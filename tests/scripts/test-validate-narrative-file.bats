#!/usr/bin/env bats

setup() {
  SCRIPT="$PWD/scripts/validate-narrative-file.sh"
  TMPDIR=$(mktemp -d)
}

teardown() { rm -rf "$TMPDIR"; }

@test "frontmatter with only issue → pass" {
  cat > "$TMPDIR/f.md" <<'EOF'
---
issue: 42
---

Body text.
EOF
  run "$SCRIPT" "$TMPDIR/f.md"
  [ "$status" -eq 0 ]
}

@test "frontmatter with status key → fail" {
  cat > "$TMPDIR/f.md" <<'EOF'
---
issue: 42
status: in-progress
---
EOF
  run "$SCRIPT" "$TMPDIR/f.md"
  [ "$status" -eq 1 ]
  [[ "$output" == *"status"* ]]
}

@test "frontmatter with extra key → fail" {
  cat > "$TMPDIR/f.md" <<'EOF'
---
issue: 42
priority: high
---
EOF
  run "$SCRIPT" "$TMPDIR/f.md"
  [ "$status" -eq 1 ]
  [[ "$output" == *"priority"* ]]
}

@test "body with status prose outside fences → fail" {
  cat > "$TMPDIR/f.md" <<'EOF'
---
issue: 42
---

This task is: done.
EOF
  run "$SCRIPT" "$TMPDIR/f.md"
  [ "$status" -eq 1 ]
}

@test "body with status prose inside fenced code → pass" {
  cat > "$TMPDIR/f.md" <<'EOF'
---
issue: 42
---

Example JSON:

```json
{"status": "done"}
```
EOF
  run "$SCRIPT" "$TMPDIR/f.md"
  [ "$status" -eq 0 ]
}

@test "body with 'in progress' prose outside fences → fail" {
  cat > "$TMPDIR/f.md" <<'EOF'
---
issue: 42
---

Currently in progress: stuff.
EOF
  run "$SCRIPT" "$TMPDIR/f.md"
  [ "$status" -eq 1 ]
}

@test "frontmatter missing → fail" {
  echo "just body, no frontmatter" > "$TMPDIR/f.md"
  run "$SCRIPT" "$TMPDIR/f.md"
  [ "$status" -eq 1 ]
}
