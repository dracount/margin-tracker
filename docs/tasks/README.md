# tasks/ — Narrative files for large GitHub issues

## Purpose

`size:large` tasks sometimes need a markdown narrative file for content that does not fit in an issue body:
- Implementation plans with code blocks
- TDD step lists with exact commands
- Decision logs too long for issue comments

The **GitHub issue is the source of truth** for state, hierarchy, labels, and close reason. This file holds narrative only.

## Convention

- Filename: `docs/tasks/issue-<N>.md` (where `<N>` is the GitHub issue number).
- Frontmatter: exactly one field, `issue: <N>`.
- Body: free-form markdown.
- NEVER write `status:`, close state, `completed`, `done`, or labels in the frontmatter — those live on GitHub.

## When to create

Only when:
- Issue has the `size:large` label, AND
- The implementation plan is >100 lines or contains 3+ fenced code blocks.

For smaller tasks, the issue body is enough.

## After the issue closes

- Leave the file in place for historical reference.
- Optionally `git mv docs/tasks/issue-<N>.md docs/tasks/done/issue-<N>.md` (manual, not enforced).

## What NOT to put here

- Status / close state (GitHub has this)
- Labels (GitHub has this)
- Authoritative sub-task list (use GitHub sub-issues — checkboxes in a narrative file are advisory TDD sub-steps only)
- Commit SHAs (use commit trailers — `Fixes #<N>` / `Closes #<N>` / `Resolves #<N>` / `task: #<N>`)

## Example

```markdown
---
issue: 142
---

# Implementation plan for issue #142

## Context
...

## Task list
- [ ] Step 1: ...
```

## Nightly reconciliation

The task-tracking system is fail-open: the commit-msg validator warns but does not block on cache miss or unknown refs. Drift is caught by a nightly reconciliation job.

**Primary install (authoritative):** `.github/workflows/task-reconciliation.yml`, scheduled via GitHub Actions (03:17 UTC daily). No per-developer setup needed; runs in the repo regardless of who pushes.

**Fallbacks** (use if GHA schedules are disabled on this plan or for offline mirrors):
- Local cron: `17 3 * * * cd <repo> && ./scripts/reconcile-task-cache.sh >> /tmp/task-recon.log 2>&1`
- Manual (ad-hoc): `./scripts/reconcile-task-cache.sh`

Any non-zero exit indicates drift — review the GHA run log or local output and fix before continuing.
