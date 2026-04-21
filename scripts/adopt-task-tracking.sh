#!/usr/bin/env bash
# scripts/adopt-task-tracking.sh
# Adopts GitHub-Issues task tracking in the current repo.
# Safe to re-run; detects prior state and reports what's already adopted.
set -euo pipefail

repo_full=$(gh repo view --json nameWithOwner -q .nameWithOwner 2>/dev/null || echo "")
if [[ -z "$repo_full" ]]; then
  echo "adopt-task-tracking: not a gh repo (or gh not authed)" >&2
  exit 1
fi

echo "Adopting task tracking in $repo_full"

report() {
  echo "  $1"
}

# 1. Check gh issues enabled
has_issues=$(gh api "/repos/$repo_full" --jq .has_issues 2>/dev/null || echo "false")
if [[ "$has_issues" != "true" ]]; then
  echo "ERROR: Issues are disabled on $repo_full. Enable in repo Settings and re-run." >&2
  exit 1
fi
report "issues enabled: yes"

# 2. Check GitHub Enterprise variance (sub-issues API availability).
# Derive the hostname from the repo's origin remote, not from `gh config get -h <login>`
# (a login is not a hostname — that command silently returns empty on github.com).
origin_url=$(git remote get-url origin 2>/dev/null || echo "")
gh_host=""
if [[ "$origin_url" =~ ^git@([^:]+): ]]; then
  gh_host="${BASH_REMATCH[1]}"
elif [[ "$origin_url" =~ ^https?://([^/]+)/ ]]; then
  gh_host="${BASH_REMATCH[1]}"
fi
if [[ -z "$gh_host" ]]; then
  echo "WARNING: could not determine GitHub host from 'origin' remote; skipping Enterprise check." >&2
elif [[ "$gh_host" != "github.com" ]]; then
  echo "WARNING: non-github.com host detected ($gh_host) — likely GitHub Enterprise Server." >&2
  echo "         The sub-issues GraphQL mutation may not be available on this instance." >&2
  echo "         Verify manually via Task 0 Step 2 before relying on /promote-task." >&2
fi

# 3. Seed labels (idempotent via --force)
if [[ -x ./scripts/seed-task-labels.sh ]]; then
  ./scripts/seed-task-labels.sh
  report "labels seeded"
else
  echo "ERROR: ./scripts/seed-task-labels.sh not found. Copy from task-track first." >&2
  exit 1
fi

# 4. Check for preexisting commit-msg hook — regular file OR a symlink whose
# target is not our own commit-msg-hook. A narrow `-f && ! -L` check misses
# the foreign-symlink case (husky, lefthook, or a different task tracker);
# the installer's matching check backs up whichever form is present.
# Use `git rev-parse --git-path hooks` so this works in a worktree too —
# `.git/hooks/commit-msg` hardcodes away the per-worktree hooks dir.
hooks_path=$(git rev-parse --git-path hooks)
hook_file="$hooks_path/commit-msg"
existing_hook=""
if [[ -e "$hook_file" || -L "$hook_file" ]]; then
  hook_is_ours=0
  if [[ -L "$hook_file" ]]; then
    hook_target=$(readlink -f "$hook_file" 2>/dev/null || echo "")
    own_target=$(readlink -f "$(pwd)/scripts/commit-msg-hook" 2>/dev/null || echo "")
    if [[ -n "$hook_target" && "$hook_target" == "$own_target" ]]; then
      hook_is_ours=1
    fi
  fi
  if [[ "$hook_is_ours" -eq 0 ]]; then
    existing_hook="$hook_file"
    echo "WARNING: preexisting commit-msg hook detected at $existing_hook"
    echo "         Install script will back it up before installing ours."
  fi
fi

# 5. Install hook (installer handles backup)
if [[ -x ./scripts/install-commit-msg-hook.sh ]]; then
  ./scripts/install-commit-msg-hook.sh
  report "commit-msg hook installed"
else
  echo "ERROR: ./scripts/install-commit-msg-hook.sh not found. Copy from task-track first." >&2
  exit 1
fi

# 6. Populate initial cache
if [[ -x ./scripts/refresh-task-cache.sh ]]; then
  ./scripts/refresh-task-cache.sh
  report "task cache populated"
fi

# 7. Check for .github/task-tracking-config.json
if [[ ! -f .github/task-tracking-config.json ]]; then
  echo "NOTE: .github/task-tracking-config.json missing. Copy from task-track and verify"
  echo "      addSubIssueMutation name still works on this plan (run Task 0 Step 2 verification)."
fi

# 7b. Check for the scheduled-reconciliation GHA workflow (NP-26: the nightly
# backstop must actually be installed in each repo, not just documented).
if [[ ! -f .github/workflows/task-reconciliation.yml ]]; then
  echo "ERROR: .github/workflows/task-reconciliation.yml missing. Copy from task-track before continuing." >&2
  echo "       Without this workflow the fail-open commit-msg validator has no backstop in this repo." >&2
  exit 1
fi
report "scheduled reconciliation workflow present"

# 7c. Also verify the reconciliation script is copied
if [[ ! -x ./scripts/reconcile-task-cache.sh ]]; then
  echo "ERROR: scripts/reconcile-task-cache.sh missing or not executable. Copy from task-track." >&2
  exit 1
fi
report "reconciliation script present"

# 8. Detect legacy checkboxes for migration.
# Invoke via `python3` and gate on file-presence (not exec bit) — a `cp` from
# source-of-truth repo does NOT preserve the executable bit unless explicitly
# preserved, so `[[ -x ... ]]` would silently skip this whole section in most
# target repos and NP-25 reporting would vanish.
if [[ -d docs/superpowers/plans || -d docs ]]; then
  if [[ -f ./scripts/migrate-checkboxes-to-issues.py ]]; then
    count=$(python3 ./scripts/migrate-checkboxes-to-issues.py --scan 2>/dev/null | grep -E '^Total:' | awk '{print $2}' || echo "0")
    if [[ "$count" != "0" && -n "$count" ]]; then
      echo "NOTE: $count untracked checkbox(es) found. Run python3 ./scripts/migrate-checkboxes-to-issues.py --file <path> interactively to migrate."
    fi
  fi
fi

# 9. Detect .context/tasks.json
if [[ -f .context/tasks.json ]]; then
  echo "NOTE: .context/tasks.json exists. After migration, remove with: git rm .context/tasks.json"
fi

echo ""
echo "Adoption complete for $repo_full."

# Acceptance checks — verify mechanically what we can (items 1–4); leave the
# judgment-required items (5–6) as operator checklists. Each mechanical check
# renders [x] on success, [!] on failure with the reason, so a partially
# adopted repo's remaining gaps surface on every re-run (NP-25 fidelity).
echo "Acceptance checks:"

mark() {
  local ok="$1" text="$2"
  if [[ "$ok" -eq 1 ]]; then
    echo "  [x] $text"
  else
    echo "  [!] $text"
  fi
}

# Pass counts via env var (NP-23 discipline even for tiny Python one-liners).
labels_needed_json='["size:small","size:large","status:in-progress","status:blocked","status:reopened","source:migration","type:bug","type:feature","type:chore"]'
labels_present=$(gh label list --json name --jq '[.[].name]' 2>/dev/null || echo '[]')
# Env-var prefix MUST live inside $(...) so it applies to the python3 subshell;
# `VAR=val name=$(cmd)` is parsed as assignments to the CURRENT shell and `cmd`
# never receives VAR. Same trap documented at reconcile-task-cache.sh §3.
missing_labels=$(LABELS_PRESENT="$labels_present" LABELS_NEEDED="$labels_needed_json" python3 -c '
import json, os
present = set(json.loads(os.environ["LABELS_PRESENT"]))
needed = set(json.loads(os.environ["LABELS_NEEDED"]))
print(",".join(sorted(needed - present)))
')
if [[ -z "$missing_labels" ]]; then
  mark 1 "9 task-tracking labels present"
else
  mark 0 "labels missing: $missing_labels"
fi

hook_resolved=$(readlink -f "$hook_file" 2>/dev/null || echo "")
hook_expected=$(readlink -f "$(pwd)/scripts/commit-msg-hook" 2>/dev/null || echo "")
if [[ -L "$hook_file" && -n "$hook_resolved" && "$hook_resolved" == "$hook_expected" ]]; then
  mark 1 "$hook_file → scripts/commit-msg-hook"
else
  mark 0 "$hook_file not a symlink to scripts/commit-msg-hook (resolved: ${hook_resolved:-<missing>})"
fi

cache_path="${GH_TASKS_CACHE_DIR:-$HOME/.cache/gh-tasks}/$(echo "$repo_full" | tr '/' '-').json"
if [[ -f "$cache_path" ]]; then
  mark 1 "cache file exists: $cache_path"
else
  mark 0 "cache file missing: $cache_path"
fi

wf_registered=$(gh workflow list --json name --jq '[.[].name] | any(. == "task-reconciliation")' 2>/dev/null || echo "false")
if [[ "$wf_registered" == "true" ]]; then
  mark 1 "task-reconciliation workflow registered in GitHub Actions"
else
  # Not a hard error: workflow may not be registered until after the first push.
  mark 0 "task-reconciliation workflow not yet registered (push the workflow file, then re-check)"
fi

echo "  [ ] legacy checkboxes either migrated or explicitly skipped  (operator judgment)"
echo "  [ ] .context/tasks.json deleted (if it existed)              (operator judgment)"
