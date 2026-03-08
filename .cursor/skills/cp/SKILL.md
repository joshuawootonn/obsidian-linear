---
name: cp
description: Summarizes repository changes, groups them into atomic git commits, and pushes directly to main. Use when the user invokes /cp or asks to summarize changes, create atomic commits, and push.
---

# CP

## Purpose

Use this skill to take the current repository changes, summarize them, split them into sensible atomic commits, and push them directly to `main`.

This repository does not use a branch workflow. Default to committing on `main` and pushing immediately after the commit sequence is complete.

## Workflow

1. Inspect the repository state first:
   - Run `git status --short`
   - Run `git diff --stat` plus `git diff`
   - Run `git log --oneline -5`

2. Summarize the current changes for the user in 1-3 short bullets before committing:
   - What changed
   - How the changes naturally group into atomic commits
   - Any risk, ambiguity, or secret-like files that should not be committed

3. Create atomic commits:
   - Group changes by coherent unit of work, not by file count
   - Prefer one commit when the work is tightly coupled
   - Use multiple commits only when each commit is independently meaningful
   - Do not mix unrelated refactors, docs, and feature work unless they are inseparable

4. Stage carefully:
   - Stage only the files or hunks that belong in the current commit
   - Leave unrelated user changes untouched
   - Never commit likely secrets such as `.env`, credentials, or tokens

5. Write concise commit messages:
   - Use imperative mood
   - Keep the subject focused on the why
   - Add a short body only when it clarifies intent

6. Push after the final commit:
   - Push directly to `main`
   - Do not create branches
   - Do not force-push

7. Report back with:
   - The summary of what was committed
   - The commit hashes and messages
   - Whether push succeeded

## Commit message guidance

Use formats like:

```text
feat: add live preview status icons
fix: normalize Linear issue lookup by team key
docs: update local vault setup instructions
refactor: extract status icon mapping helpers
test: cover markdown link paste format
```

Add a body when useful:

```text
feat: add live preview status icons

Render inline Linear state icons in Live Preview without modifying
the underlying Markdown source.
```

## Guardrails

- Commit only when the user asked for this workflow.
- Do not amend unless the user explicitly asks.
- Do not use `git push --force`.
- Do not commit secrets or generated build artifacts unless the repo clearly tracks them already.
- If the worktree contains unexpected unrelated changes, leave them alone and commit only the intended scope.

## Examples

### Example 1

Request: `/cp`

Behavior:
- Inspect status and diff
- Summarize the changes
- Create one or more atomic commits
- Push directly to `main`

### Example 2

Request: `Summarize what's changed, commit it in atomic commits, and push it`

Behavior:
- Same workflow as `/cp`
- Mention the commit grouping before creating commits
