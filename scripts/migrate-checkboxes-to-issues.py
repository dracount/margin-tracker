#!/usr/bin/env python3
"""
migrate-checkboxes-to-issues.py

One-shot migration: scans markdown files under docs/ for unchecked checkboxes
and creates GitHub issues for human-classified items.

Idempotency: skips lines that end with "— tracked as #N" (added by this script
on successful migration).

Usage:
  migrate-checkboxes-to-issues.py --scan               # list candidates, no writes
  migrate-checkboxes-to-issues.py --file <path>        # migrate one file interactively
  migrate-checkboxes-to-issues.py --file <path> --auto # auto-skip TDD step lines; prompt for the rest
"""

import argparse
import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path

# Idempotency log — keyed on content-hash of the normalized line, NOT on a visible suffix.
# Rationale (NP fix): visible suffixes like "— tracked as #42" are erased by prettier,
# trailing-whitespace trim, line-wrap, markdown reformat. Content-hash survives reformat.
LOG_PATH = Path(".github/task-migration-log.jsonl")

def normalize_line(text):
    """Normalize for hashing: strip whitespace, collapse internal runs, strip markdown emphasis."""
    t = text.strip()
    t = re.sub(r'\s+', ' ', t)
    t = re.sub(r'\*+', '', t)  # strip bold/italic markers
    t = re.sub(r'`+', '', t)   # strip inline-code backticks
    return t

def line_hash(path, text):
    # Include the file path so the same line in two different files is not collapsed.
    h = hashlib.sha256()
    h.update(str(path).encode("utf-8"))
    h.update(b"\n")
    h.update(normalize_line(text).encode("utf-8"))
    return h.hexdigest()[:16]

def load_log():
    if not LOG_PATH.exists():
        return {}
    migrated = {}
    with LOG_PATH.open() as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                rec = json.loads(line)
            except json.JSONDecodeError:
                continue
            migrated[rec["hash"]] = rec
    return migrated

def append_log(record):
    LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    with LOG_PATH.open("a") as f:
        f.write(json.dumps(record) + "\n")

def run_gh(args, input_text=None):
    result = subprocess.run(
        ["gh"] + args,
        input=input_text,
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        raise RuntimeError(f"gh failed: {result.stderr}")
    return result.stdout.strip()

def scan_file(path, migrated):
    text = path.read_text()
    candidates = []
    for i, line in enumerate(text.splitlines(), start=1):
        m = re.match(r'^(\s*)- \[ \] (.+)$', line)
        if not m:
            continue
        indent, body = m.groups()
        # Skip if already tracked via visible link (legacy suffix)
        if "— tracked as #" in line:
            continue
        # Skip if content-hash is in migration log (robust to reformat)
        h = line_hash(path, body)
        if h in migrated:
            continue
        candidates.append({
            "lineno": i, "indent": len(indent),
            "text": body, "raw": line, "hash": h,
        })
    return text, candidates

def classify_interactive(candidate):
    print(f"\nLine {candidate['lineno']}: {candidate['text']}")
    while True:
        choice = input("  [s]mall issue / [l]arge issue / s[k]ip / [a]bort: ").strip().lower()
        if choice in ("s", "l", "k", "a"):
            return choice
        print("  invalid choice; type one of s/l/k/a")

def create_issue(title, size):
    body = "Migrated from checkbox in plan file."
    url = run_gh([
        "issue", "create",
        "--title", title,
        "--label", f"size:{size},source:migration",
        "--body", body,
    ])
    # gh issue create returns the URL on stdout; parse defensively so an
    # unexpected line (e.g. future gh progress prefix) surfaces as a loud
    # error rather than an orphan issue with no log entry.
    m = re.search(r'/issues/(\d+)\s*$', url)
    if not m:
        raise RuntimeError(f"could not parse issue number from gh output: {url!r}")
    num = int(m.group(1))
    return num, url

def migrate_file(path, auto=False):
    migrated = load_log()
    text, candidates = scan_file(path, migrated)
    if not candidates:
        print(f"No untracked checkboxes in {path}.")
        return

    print(f"\n{path}: {len(candidates)} untracked checkbox(es)")
    replacements = {}

    for c in candidates:
        if auto and re.match(r'^Step \d+:', c["text"], re.IGNORECASE):
            print(f"  L{c['lineno']} SKIP (TDD step): {c['text'][:60]}")
            continue

        choice = classify_interactive(c)

        if choice == "a":
            print("Aborted by user.")
            sys.exit(0)
        if choice == "k":
            continue
        size = "small" if choice == "s" else "large"

        title = re.sub(r'^\*\*Step \d+:\s*', '', c["text"])
        title = title.strip("*").strip()
        title = title[:80]

        num, url = create_issue(title, size)
        print(f"  → created #{num}: {url}")

        # Write to both places: visible suffix (for humans) AND content-hash log (for idempotency)
        replacements[c["lineno"]] = f"{c['raw']} — tracked as #{num}"
        append_log({
            "hash": c["hash"],
            "path": str(path),
            "lineno": c["lineno"],
            "issue": num,
            "url": url,
            "text": c["text"][:200],
        })

    if not replacements:
        print("No changes to write.")
        return

    lines = text.splitlines()
    for lineno, new_line in replacements.items():
        lines[lineno - 1] = new_line
    # Atomic write: tmp + rename avoids leaving a truncated plan file if the
    # process is killed mid-write. Log entries are already durable per-issue.
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text("\n".join(lines) + ("\n" if text.endswith("\n") else ""))
    tmp.replace(path)
    print(f"\nUpdated {path} with {len(replacements)} issue link(s); log at {LOG_PATH}")

def scan_all():
    plans_dir = Path("docs/superpowers/plans")
    if not plans_dir.is_dir():
        print(f"Not found: {plans_dir}", file=sys.stderr)
        sys.exit(1)

    migrated = load_log()
    total = 0
    for path in sorted(plans_dir.glob("*.md")):
        _, candidates = scan_file(path, migrated)
        if candidates:
            print(f"{path}: {len(candidates)} untracked")
            total += len(candidates)
    print(f"\nTotal: {total} across {plans_dir}")
    print(f"Already migrated (by content-hash): {len(migrated)}")

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--scan", action="store_true", help="list candidates without writing")
    ap.add_argument("--file", type=Path, help="migrate a single file")
    ap.add_argument("--auto", action="store_true", help="use heuristics to auto-skip TDD steps")
    args = ap.parse_args()

    if args.scan:
        scan_all()
    elif args.file:
        migrate_file(args.file, auto=args.auto)
    else:
        ap.print_help()
        sys.exit(1)

if __name__ == "__main__":
    main()
