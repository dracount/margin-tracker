#!/usr/bin/env bash
set -euo pipefail
repo_root=$(git rev-parse --show-toplevel)
src="$repo_root/scripts/commit-msg-hook"

# Resolve hooks dir via git itself — in a worktree, `.git` is a *file*
# (gitdir pointer), not a directory, so a hardcoded `$repo_root/.git/hooks`
# fails with "Not a directory". `git rev-parse --git-path hooks` returns the
# correct per-worktree hooks dir for both main checkouts and worktrees.
hooks_dir=$(git rev-parse --git-path hooks)
mkdir -p "$hooks_dir"
dest="$hooks_dir/commit-msg"

if [[ ! -f "$src" ]]; then
  echo "install-commit-msg-hook: source not found at $src" >&2
  exit 1
fi

# Back up any preexisting hook — regular file OR a symlink pointing anywhere
# other than our own target. A bare `-f && ! -L` check missed the case of a
# prior hook system (husky/lefthook/another task tracker) that installed a
# symlink to its own script, which `ln -sf` below would silently clobber.
if [[ -e "$dest" || -L "$dest" ]]; then
  own_target=0
  if [[ -L "$dest" ]]; then
    resolved=$(readlink -f "$dest" 2>/dev/null || echo "")
    if [[ "$resolved" == "$src" ]]; then
      own_target=1
    fi
  fi
  if [[ "$own_target" -eq 0 ]]; then
    backup="$dest.bak.$(date +%s).$$"
    echo "install-commit-msg-hook: existing hook found; backing up to $backup"
    mv "$dest" "$backup"
  fi
fi

chmod +x "$src"
# Absolute symlink target — a relative `../../scripts/commit-msg-hook` would
# resolve correctly only from `$repo_root/.git/hooks/`; from a worktree's
# `$GIT_COMMON_DIR/worktrees/<name>/hooks/` it points inside .git and breaks.
ln -sf "$src" "$dest"
echo "Installed commit-msg hook → $dest (symlink to $src)"
