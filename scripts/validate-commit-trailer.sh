#!/usr/bin/env bash
# scripts/validate-commit-trailer.sh
# Usage: validate-commit-trailer.sh <commit-msg-file> [--print-refs]
#
# Reads ~/.cache/gh-tasks/<owner>-<repo>.json (populated by SessionStart hook or ./scripts/refresh-task-cache.sh).
# NO network calls. Fail-open on cache miss / stale / unknown issue (warns only).
# Fail-closed ONLY on: task: #N where issue is known to be CLOSED.
#
# Env:
#   SKIP_TRAILER_VALIDATION=1   → bypass all checks, exit 0
#   GH_TASKS_CACHE_DIR          → override cache dir (default: ~/.cache/gh-tasks)
#   GH_TASKS_CACHE_KEY          → override cache key (default: <owner>-<repo>)
#
# Also lints staged docs/tasks/issue-<N>.md files via validate-narrative-file.sh.

set -euo pipefail

msg_file="${1:-}"
mode="${2:-validate}"

if [[ "${SKIP_TRAILER_VALIDATION:-0}" == "1" ]]; then
  exit 0
fi

if [[ -z "$msg_file" || ! -f "$msg_file" ]]; then
  echo "validate-commit-trailer: missing or unreadable msg file: $msg_file" >&2
  exit 2
fi

# --- Narrative file lint (on staged files) ---
if [[ "$mode" != "--print-refs" ]]; then
  narrative_validator="$(dirname "$0")/validate-narrative-file.sh"
  if [[ -x "$narrative_validator" ]]; then
    # Only lint if git is available and we're inside a repo
    if git rev-parse --git-dir >/dev/null 2>&1; then
      staged=$(git diff --cached --name-only --diff-filter=AM 2>/dev/null | grep -E '^docs/tasks/issue-[0-9]+\.md$' || true)
      for f in $staged; do
        if ! "$narrative_validator" "$f"; then
          echo "validate-commit-trailer: narrative file $f failed lint" >&2
          exit 1
        fi
      done
    fi
  fi
fi

msg=$(cat "$msg_file")

# Strip fenced code blocks (``` ... ```) — closes code-fence bug
msg_stripped=$(echo "$msg" | awk '
  BEGIN { in_fence = 0 }
  /^```/ { in_fence = !in_fence; next }
  { if (!in_fence) print }
')

# Strip comment lines (# at start, used by editors) — git commit -v also prepends a diff, which we should skip
msg_stripped=$(echo "$msg_stripped" | sed '/^#/d')

# Extract refs. Two-pass approach: (1) find lines containing a trailer verb or
# task: prefix, (2) pull every #N on those lines. This supports compound forms
# ("Fixes #1, #2", "task: #1, #2") and colon-after-verb ("Fixes: #N"). Side
# effect: a non-trailer #N on a triggering line is also extracted (e.g.
# "Fixes #1 (see also #99)" extracts 99 too). For the autoclose family this is
# harmless (fail-open on unknown). For the task: family a stray #N that maps to
# a CLOSED issue would produce a false block — rare and user-resolvable via
# rewording. Simplicity wins over a tighter awk-based parser.
autoclose_lines=$(echo "$msg_stripped" | grep -iE '(fixes|closes|resolves)[[:space:]]*:?[[:space:]]*#[0-9]+' || true)
autoclose_refs=$(echo "$autoclose_lines" | grep -oE '#[0-9]+' | grep -oE '[0-9]+' | sort -u || true)

task_lines=$(echo "$msg_stripped" | grep -iE '(^|[[:space:]])task:[[:space:]]*#[0-9]+' || true)
task_refs=$(echo "$task_lines" | grep -oE '#[0-9]+' | grep -oE '[0-9]+' | sort -u || true)

all_refs=$(printf "%s\n%s\n" "$autoclose_refs" "$task_refs" | grep -v '^$' | sort -u || true)

if [[ "$mode" == "--print-refs" ]]; then
  echo "$all_refs"
  exit 0
fi

if [[ -z "$all_refs" ]]; then
  exit 0
fi

# Resolve cache location
cache_dir="${GH_TASKS_CACHE_DIR:-$HOME/.cache/gh-tasks}"

if [[ -z "${GH_TASKS_CACHE_KEY:-}" ]]; then
  if command -v gh >/dev/null 2>&1; then
    repo_full=$(gh repo view --json nameWithOwner -q .nameWithOwner 2>/dev/null || echo "")
    if [[ -n "$repo_full" ]]; then
      GH_TASKS_CACHE_KEY=$(echo "$repo_full" | tr '/' '-')
    fi
  fi
fi

cache_file="$cache_dir/${GH_TASKS_CACHE_KEY:-unknown}.json"

if [[ ! -f "$cache_file" ]]; then
  echo "validate-commit-trailer: cache missing ($cache_file). Run scripts/refresh-task-cache.sh to populate. Proceeding (fail-open)." >&2
  exit 0
fi

# Stale check: >24h old → fail-open with warning
if [[ $(( $(date +%s) - $(stat -c %Y "$cache_file" 2>/dev/null || stat -f %m "$cache_file" 2>/dev/null || echo 0) )) -gt 86400 ]]; then
  echo "validate-commit-trailer: cache is >24h old. Run scripts/refresh-task-cache.sh. Proceeding (fail-open)." >&2
  exit 0
fi

# Lookup each ref in cache. Pass cache path + ref via env vars (NP-23: never
# string-interpolate into the Python source, even when inputs are digit-only
# or from controlled sources — keep the pattern consistent).
export GH_TASKS_CACHE_FILE="$cache_file"

for n in $all_refs; do
  state=$(GH_TASKS_ISSUE_N="$n" python3 -c '
import json, os, sys
cache = json.load(open(os.environ["GH_TASKS_CACHE_FILE"]))
target = int(os.environ["GH_TASKS_ISSUE_N"])
for i in cache.get("issues", []):
    if i["number"] == target:
        print(i["state"])
        sys.exit(0)
print("UNKNOWN")
' 2>/dev/null || echo "UNKNOWN")

  if [[ "$state" == "UNKNOWN" ]]; then
    echo "validate-commit-trailer: issue #$n not in local cache (may be new; run refresh-task-cache.sh). Proceeding (fail-open)." >&2
    continue
  fi

  # Only task: trailer must be OPEN. auto-close verbs against CLOSED are no-ops in GitHub, not errors.
  if echo "$task_refs" | grep -qxE "${n}"; then
    if [[ "$state" == "CLOSED" ]]; then
      echo "validate-commit-trailer: task: #$n references a closed issue — /reopen-task first or remove the trailer" >&2
      exit 1
    fi
  fi
done

unset GH_TASKS_CACHE_FILE
exit 0
