#!/usr/bin/env bash
# scripts/validate-narrative-file.sh
# Validates docs/tasks/issue-<N>.md files:
#   - frontmatter has exactly one key: `issue`
#   - body contains no status prose (status/state/done/completed/in progress/blocked) outside fenced code
set -euo pipefail

f="${1:-}"
if [[ -z "$f" || ! -f "$f" ]]; then
  echo "validate-narrative-file: missing file arg" >&2
  exit 2
fi

# Pass path via env var (NP-23: no string interpolation into Python heredoc —
# a filename containing `"""` would otherwise break out of the triple-quoted
# string and execute arbitrary Python).
export GH_TASKS_NARRATIVE_PATH="$f"

python3 <<'PY'
import os, re, sys
path = os.environ["GH_TASKS_NARRATIVE_PATH"]
text = open(path).read()

# Require frontmatter block
fm_match = re.match(r'^---\n(.*?)\n---\n', text, re.DOTALL)
if not fm_match:
    print(f"{path}: missing frontmatter block (must start with --- ... ---)", file=sys.stderr)
    sys.exit(1)

fm = fm_match.group(1)
# Parse simple key: value lines
keys = []
for line in fm.splitlines():
    if not line.strip() or line.strip().startswith('#'):
        continue
    m = re.match(r'^([A-Za-z_][A-Za-z0-9_-]*)\s*:', line)
    if m:
        keys.append(m.group(1))

allowed = {"issue"}
extra = [k for k in keys if k not in allowed]
if extra:
    print(f"{path}: frontmatter has disallowed keys: {extra} (only 'issue' is permitted)", file=sys.stderr)
    sys.exit(1)

if "issue" not in keys:
    print(f"{path}: frontmatter missing required 'issue' key", file=sys.stderr)
    sys.exit(1)

# Lint body: status prose outside fenced code blocks
body = text[fm_match.end():]

# Strip fenced code blocks
body_no_fences = re.sub(r'```.*?```', '', body, flags=re.DOTALL)

#   - `status:`, `state:`, `in progress:` / `in-progress:` (key-like forms with : or =)
#   - standalone status-verbs `done`, `completed`, `blocked`, `cancelled` as whole words
#     (these are themselves assertions of state, regardless of punctuation)
banned_key = re.compile(r'\b(status|state|in[- ]progress)\s*[:=]', re.IGNORECASE)
banned_verb = re.compile(r'\b(done|completed|blocked|cancelled)\b', re.IGNORECASE)
for pat in (banned_key, banned_verb):
    m = pat.search(body_no_fences)
    if m:
        print(f"{path}: body contains status prose '{m.group(0)}' outside fenced code — state lives on GitHub, not in narrative files", file=sys.stderr)
        sys.exit(1)

sys.exit(0)
PY

unset GH_TASKS_NARRATIVE_PATH
