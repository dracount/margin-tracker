#!/usr/bin/env bash
# scripts/seed-task-labels.sh
set -euo pipefail

labels=(
  "status:in-progress|fbca04|Active work in progress"
  "status:blocked|d93f0b|Blocked on external dependency"
  "status:reopened|b60205|Reopened after regression"
  "size:small|c2e0c6|Small — inline candidate"
  "size:large|0e8a16|Large — own issue with optional narrative"
  "type:bug|d73a4a|Defect"
  "type:chore|ededed|Housekeeping"
  "type:feature|a2eeef|New capability"
  "source:migration|ffffff|Created by migrate-checkboxes-to-issues"
)

for spec in "${labels[@]}"; do
  IFS='|' read -r name color desc <<< "$spec"
  gh label create "$name" --color "$color" --description "$desc" --force
done

echo "Seeded ${#labels[@]} labels in $(gh repo view --json nameWithOwner -q .nameWithOwner)"
