#!/usr/bin/env bash
# scripts/refresh-task-cache.sh
# Populates ~/.cache/gh-tasks/<owner>-<repo>.json from live GitHub state.
# Called by: SessionStart hook, manual refresh, nightly reconciliation.
set -euo pipefail

if ! command -v gh >/dev/null 2>&1; then
  echo "refresh-task-cache: gh not installed" >&2
  exit 1
fi

if ! gh auth status >/dev/null 2>&1; then
  echo "refresh-task-cache: gh not authenticated" >&2
  exit 1
fi

repo_full=$(gh repo view --json nameWithOwner -q .nameWithOwner 2>/dev/null || echo "")
if [[ -z "$repo_full" ]]; then
  exit 0  # not in a gh repo, no cache needed
fi

cache_dir="${GH_TASKS_CACHE_DIR:-$HOME/.cache/gh-tasks}"
mkdir -p "$cache_dir"
cache_key="$(echo "$repo_full" | tr '/' '-')"
cache_file="$cache_dir/$cache_key.json"
tmp_file="$cache_file.tmp.$$"

owner="${repo_full%/*}"
repo="${repo_full#*/}"

# Fetch all open issues + issues updated in the last 90 days (covers recent closes
# needed for trailer validation). `gh issue list --search "sort:updated-desc"` is
# explicit about ordering so the 500-row cap drops the oldest, not newest.
issues_json=$(gh issue list \
  --state all \
  --limit 500 \
  --search "sort:updated-desc" \
  --json number,state,title,labels,updatedAt 2>/dev/null || echo '[]')

# Pass issues via env var (NP-23: no shell interpolation into Python heredoc —
# untrusted issue titles could escape a '''...''' string and execute as Python).
export GH_TASKS_ISSUES_JSON="$issues_json"
export GH_TASKS_OWNER="$owner"
export GH_TASKS_REPO="$repo"

python3 <<'PY' > "$tmp_file"
import json, datetime, os
issues = json.loads(os.environ["GH_TASKS_ISSUES_JSON"])
_now = datetime.datetime.now(datetime.timezone.utc)
# cutoff format matches GitHub's updatedAt ("YYYY-MM-DDTHH:MM:SSZ") so the
# lexicographic >= comparison below is equivalent to chronological comparison.
cutoff = (_now - datetime.timedelta(days=90)).strftime('%Y-%m-%dT%H:%M:%SZ')
kept = [i for i in issues if i['state'] == 'OPEN' or i.get('updatedAt', '') >= cutoff]

out = {
    "refreshed_at": _now.strftime('%Y-%m-%dT%H:%M:%S.%fZ'),
    "owner": os.environ["GH_TASKS_OWNER"],
    "repo": os.environ["GH_TASKS_REPO"],
    "issues": [{"number": i["number"], "state": i["state"], "title": i["title"]} for i in kept],
}
print(json.dumps(out, indent=2))
PY

unset GH_TASKS_ISSUES_JSON GH_TASKS_OWNER GH_TASKS_REPO
mv "$tmp_file" "$cache_file"
count=$(GH_TASKS_CACHE_FILE="$cache_file" python3 -c 'import json, os; print(len(json.load(open(os.environ["GH_TASKS_CACHE_FILE"]))["issues"]))')
echo "Refreshed task cache: $cache_file ($count issues)"
