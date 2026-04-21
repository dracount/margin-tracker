#!/usr/bin/env bash
# scripts/reconcile-task-cache.sh
# Nightly reconciliation (backstops the fail-open commit-msg validator):
#   1. Refresh the local task cache.
#   2. For the last 30 days of commits, re-validate every `task: #N` and `Fixes #N` trailer
#      against fresh GitHub state. Warn loudly if any reference a non-existent issue.
#   3. Scan docs/tasks/issue-*.md — flag any whose `issue:` references an issue that never
#      existed in this repo. (Issues that existed and were later closed/cancelled are NOT
#      flagged — per docs/tasks/README.md, those files are kept for historical reference.)
# Exit 0 on clean run; exit 1 if drift is found (so GHA marks the run failed).
set -euo pipefail

# CWD-independence: resolve script dir and cd to repo root so relative paths
# (./scripts/refresh-task-cache.sh, docs/tasks/issue-*.md) and `git log` all
# operate correctly regardless of where this script was invoked from.
script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
repo_root=$(cd "$script_dir/.." && pwd)
cd "$repo_root"

# Check gh auth first (clearer error than a failed `gh repo view`).
if ! command -v gh >/dev/null 2>&1 || ! gh auth status >/dev/null 2>&1; then
  echo "reconcile: gh not installed or not authenticated" >&2
  exit 1
fi

repo_full=$(gh repo view --json nameWithOwner -q .nameWithOwner 2>/dev/null || echo "")
if [[ -z "$repo_full" ]]; then
  echo "reconcile: not a gh repo" >&2
  exit 1
fi

# 1. Refresh
"$script_dir/refresh-task-cache.sh" >/dev/null

# 2. Re-validate recent trailers
cache_dir="${GH_TASKS_CACHE_DIR:-$HOME/.cache/gh-tasks}"
cache_key="$(echo "$repo_full" | tr '/' '-')"
cache="$cache_dir/$cache_key.json"

errors=0

# Pass cache path via env var (NP-23: no string interpolation into Python heredoc)
export GH_TASKS_CACHE_FILE="$cache"

# Capture the Python exit code without killing the script under `set -e`.
# The Python exits with the number of stale trailers; we want to sum that
# into $errors, not abort. `|| true` alone loses the count, so disable errexit
# just for this invocation and restore afterwards.
set +e
python3 <<'PY'
import json, os, re, subprocess, sys
cache = json.load(open(os.environ["GH_TASKS_CACHE_FILE"]))
known = {i["number"]: i for i in cache["issues"]}

log = subprocess.run(
    ["git", "log", "--since=30.days", "--format=%H%n%B%n---END---"],
    capture_output=True, text=True, check=True,
).stdout

commits = [c.strip() for c in log.split("---END---\n") if c.strip()]

# GitHub auto-close keywords: match anywhere in body (mirrors GitHub's own
# semantics — e.g. "Fixes #42" in prose will close #42 on merge).
AUTOCLOSE_RE = re.compile(r'(?i)\b(fixes|closes|resolves)\s+#(\d+)')

# `task: #N` is a structured trailer, NOT a free-text keyword. Delegate parsing
# to `git interpret-trailers --parse`, which implements the canonical trailer-
# block semantics used by `git` itself (last paragraph of trailer-shaped lines,
# with the heuristics for interleaved blank lines and continuation). Avoids the
# false-positive class where prose in the final paragraph happens to match
# `Key: value` on every line.
TASK_TRAILER_RE = re.compile(r'(?i)^task:\s*#(\d+)\s*$')

def task_refs_from_trailers(body):
    try:
        r = subprocess.run(
            ["git", "interpret-trailers", "--only-trailers", "--parse"],
            input=body, capture_output=True, text=True, check=True,
        )
    except subprocess.CalledProcessError:
        return []
    refs = []
    for line in r.stdout.splitlines():
        m = TASK_TRAILER_RE.match(line.strip())
        if m:
            refs.append(int(m.group(1)))
    return refs

errs = 0
for c in commits:
    lines = c.splitlines()
    sha = lines[0] if lines else ""
    body = "\n".join(lines[1:])
    body_no_fences = re.sub(r'```.*?```', '', body, flags=re.DOTALL)

    refs = set()
    for m in AUTOCLOSE_RE.finditer(body_no_fences):
        refs.add(int(m.group(2)))
    # Pass the full body (not fence-stripped) to interpret-trailers — git's own
    # trailer parser already restricts scope to the trailer block, so code
    # fences elsewhere in the body are not a concern.
    for n in task_refs_from_trailers(body):
        refs.add(n)

    for n in refs:
        if n not in known:
            print(f"[STALE TRAILER] commit {sha[:12]}: refs #{n} not in repo", file=sys.stderr)
            errs += 1
# Cap at 255 so bash exit-code arithmetic stays meaningful.
sys.exit(min(errs, 255))
PY
py_rc=$?
set -e
errors=$((errors + py_rc))

# 3. Check narrative files — ORPHAN ONLY.
# Intentionally narrow: we only flag narratives whose issue number never
# existed in this repo (state == UNKNOWN). Narratives for issues that existed
# and were later closed/cancelled are expected to remain on disk (see
# docs/tasks/README.md § "After the issue closes"). A reconciler that flagged
# closed-issue narratives would create noise on every run after any closure.
for f in docs/tasks/issue-*.md; do
  [[ -e "$f" ]] || continue
  n=$(basename "$f" .md | sed 's/issue-//')
  # Pass both the cache path and the issue number via env vars — never
  # interpolate `$n` into the Python source. NOTE: the env-var prefix MUST
  # be inside the $(...) so it applies to the python3 subshell; the form
  # `VAR=val name=$(cmd)` is parsed as two assignments to the current shell
  # and `cmd` never receives VAR (matches the correct form at line ~509 of
  # validate-commit-trailer.sh).
  state=$(GH_TASKS_ISSUE_N="$n" python3 -c '
import json, os
cache = json.load(open(os.environ["GH_TASKS_CACHE_FILE"]))
target = int(os.environ["GH_TASKS_ISSUE_N"])
for i in cache["issues"]:
    if i["number"] == target:
        print(i["state"])
        break
else:
    print("UNKNOWN")
')
  if [[ "$state" == "UNKNOWN" ]]; then
    echo "[ORPHAN NARRATIVE] $f references issue #$n which does not exist" >&2
    errors=$((errors + 1))
  fi
done

unset GH_TASKS_CACHE_FILE

if [[ "$errors" -gt 0 ]]; then
  echo "Reconciliation: $errors issue(s) found — review output above" >&2
  exit 1
fi

count=$(GH_TASKS_CACHE_FILE="$cache" python3 -c 'import json, os; print(len(json.load(open(os.environ["GH_TASKS_CACHE_FILE"]))["issues"]))')
echo "Reconciliation: clean ($count issues in cache)"
