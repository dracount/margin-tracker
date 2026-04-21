#!/usr/bin/env bats

setup() {
  SCRIPT="$PWD/scripts/validate-commit-trailer.sh"
  TMPDIR=$(mktemp -d)
  # Stub a cache for this test invocation
  export GH_TASKS_CACHE_DIR="$TMPDIR/cache"
  mkdir -p "$GH_TASKS_CACHE_DIR"
  export GH_TASKS_CACHE_KEY="test-owner-test-repo"
  cat > "$GH_TASKS_CACHE_DIR/$GH_TASKS_CACHE_KEY.json" <<'JSON'
{
  "refreshed_at": "2026-04-20T00:00:00Z",
  "owner": "test-owner",
  "repo": "test-repo",
  "issues": [
    {"number": 1, "state": "OPEN", "title": "Open one"},
    {"number": 2, "state": "OPEN", "title": "Open two"},
    {"number": 50, "state": "CLOSED", "title": "Closed fifty"},
    {"number": 123, "state": "OPEN", "title": "Open one two three"}
  ]
}
JSON
}

teardown() {
  rm -rf "$TMPDIR"
}

@test "empty message → exit 0" {
  echo "" > "$TMPDIR/msg"
  run "$SCRIPT" "$TMPDIR/msg"
  [ "$status" -eq 0 ]
}

@test "message with no issue refs → exit 0" {
  echo "chore: tidy imports" > "$TMPDIR/msg"
  run "$SCRIPT" "$TMPDIR/msg"
  [ "$status" -eq 0 ]
}

@test "extracts Fixes #N for open issue → exit 0" {
  echo -e "fix: thing\n\nFixes #123" > "$TMPDIR/msg"
  run "$SCRIPT" "$TMPDIR/msg"
  [ "$status" -eq 0 ]
}

@test "extracts task: #N for open issue → exit 0" {
  echo -e "feat: step 1\n\ntask: #1" > "$TMPDIR/msg"
  run "$SCRIPT" "$TMPDIR/msg"
  [ "$status" -eq 0 ]
}

@test "task: #N for closed issue → exit 1" {
  echo -e "feat: step\n\ntask: #50" > "$TMPDIR/msg"
  run "$SCRIPT" "$TMPDIR/msg"
  [ "$status" -eq 1 ]
  [[ "$output" == *"closed"* ]]
}

@test "Fixes #N for closed issue → exit 0 (auto-close verbs tolerate closed, GitHub no-ops)" {
  echo -e "fix: late\n\nFixes #50" > "$TMPDIR/msg"
  run "$SCRIPT" "$TMPDIR/msg"
  [ "$status" -eq 0 ]
}

@test "ref to unknown issue → warn and exit 0 (fail-open)" {
  echo -e "feat: x\n\ntask: #99999" > "$TMPDIR/msg"
  run "$SCRIPT" "$TMPDIR/msg"
  [ "$status" -eq 0 ]
  [[ "$output" == *"unknown"* ]] || [[ "$output" == *"99999"* ]]
}

@test "stale cache (>24h old) → warn and exit 0" {
  # Fake an old cache file
  touch -d "2 days ago" "$GH_TASKS_CACHE_DIR/$GH_TASKS_CACHE_KEY.json"
  echo -e "fix: thing\n\nFixes #1" > "$TMPDIR/msg"
  run "$SCRIPT" "$TMPDIR/msg"
  [ "$status" -eq 0 ]
}

@test "missing cache → warn and exit 0" {
  rm "$GH_TASKS_CACHE_DIR/$GH_TASKS_CACHE_KEY.json"
  echo -e "fix: thing\n\ntask: #1" > "$TMPDIR/msg"
  run "$SCRIPT" "$TMPDIR/msg"
  [ "$status" -eq 0 ]
  [[ "$output" == *"cache"* ]]
}

@test "SKIP_TRAILER_VALIDATION=1 bypasses everything" {
  echo -e "task: #50" > "$TMPDIR/msg"
  SKIP_TRAILER_VALIDATION=1 run "$SCRIPT" "$TMPDIR/msg"
  [ "$status" -eq 0 ]
}

@test "strips fenced code blocks before matching" {
  cat > "$TMPDIR/msg" <<'EOF'
fix: real work

```python
# This is a code example, Fixes #99999 should be ignored
```

Fixes #1
EOF
  run "$SCRIPT" "$TMPDIR/msg"
  [ "$status" -eq 0 ]
  # Should NOT have emitted a warning about #99999
  [[ "$output" != *"99999"* ]]
}

@test "extracts multiple refs deduped" {
  cat > "$TMPDIR/msg" <<'EOF'
feat: work

Fixes #1
task: #2
Closes #1
EOF
  run bash -c "$SCRIPT '$TMPDIR/msg' --print-refs"
  # "1" and "2" each appear exactly once
  [ "$(echo "$output" | grep -xc '1')" -eq 1 ]
  [ "$(echo "$output" | grep -xc '2')" -eq 1 ]
}

@test "case-insensitive verb matching" {
  echo "FIXES #123" > "$TMPDIR/msg"
  run "$SCRIPT" "$TMPDIR/msg"
  [ "$status" -eq 0 ]
}

@test "Fixes: #N with colon after verb (open issue) → exit 0, ref extracted" {
  echo -e "fix: late\n\nFixes: #1" > "$TMPDIR/msg"
  run bash -c "$SCRIPT '$TMPDIR/msg' --print-refs"
  [ "$(echo "$output" | grep -xc '1')" -eq 1 ]
}

@test "Fixes: #N with colon after verb (closed issue) → exit 0 (autoclose tolerates closed)" {
  echo -e "fix: late\n\nFixes: #50" > "$TMPDIR/msg"
  run "$SCRIPT" "$TMPDIR/msg"
  [ "$status" -eq 0 ]
}

@test "compound task: #N, #M extracts both refs" {
  echo -e "feat: two steps\n\ntask: #1, #2" > "$TMPDIR/msg"
  run bash -c "$SCRIPT '$TMPDIR/msg' --print-refs"
  [ "$(echo "$output" | grep -xc '1')" -eq 1 ]
  [ "$(echo "$output" | grep -xc '2')" -eq 1 ]
}

@test "compound task: #N, #M where second is closed → exit 1 (second ref enforced)" {
  # #1 is OPEN, #50 is CLOSED in the test cache
  echo -e "feat: broken\n\ntask: #1, #50" > "$TMPDIR/msg"
  run "$SCRIPT" "$TMPDIR/msg"
  [ "$status" -eq 1 ]
  [[ "$output" == *"50"* ]]
  [[ "$output" == *"closed"* ]]
}

@test "compound Fixes #N and #M extracts both refs (autoclose family)" {
  echo -e "fix: many\n\nFixes #1, #2" > "$TMPDIR/msg"
  run bash -c "$SCRIPT '$TMPDIR/msg' --print-refs"
  [ "$(echo "$output" | grep -xc '1')" -eq 1 ]
  [ "$(echo "$output" | grep -xc '2')" -eq 1 ]
}

@test "Fixes:#N zero-space after colon → ref extracted" {
  echo -e "fix: tight\n\nFixes:#1" > "$TMPDIR/msg"
  run bash -c "$SCRIPT '$TMPDIR/msg' --print-refs"
  [ "$(echo "$output" | grep -xc '1')" -eq 1 ]
}

@test "compound task: #1, #2, #123 three-way extracts all three" {
  echo -e "feat: big\n\ntask: #1, #2, #123" > "$TMPDIR/msg"
  run bash -c "$SCRIPT '$TMPDIR/msg' --print-refs"
  [ "$(echo "$output" | grep -xc '1')" -eq 1 ]
  [ "$(echo "$output" | grep -xc '2')" -eq 1 ]
  [ "$(echo "$output" | grep -xc '123')" -eq 1 ]
}

@test "documented over-match: Fixes #1 with parenthetical #99999 extracts both" {
  # Over-match is acknowledged in the validator comment: every #N on a
  # trailer line is lifted. Autoclose-family false-positives are harmless
  # (fail-open on unknown). This test locks the behavior so a silent
  # future tightening surfaces in CI.
  echo -e "fix: real\n\nFixes #1 (see also #99999)" > "$TMPDIR/msg"
  run bash -c "$SCRIPT '$TMPDIR/msg' --print-refs"
  [ "$(echo "$output" | grep -xc '1')" -eq 1 ]
  [ "$(echo "$output" | grep -xc '99999')" -eq 1 ]
}
