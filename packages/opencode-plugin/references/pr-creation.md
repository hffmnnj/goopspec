# PR Creation

Open pull requests that reviewers want to review.

## Before You Open a PR

- [ ] All tests pass locally (`bun test packages/opencode-plugin/`)
- [ ] No TypeScript errors (`bun run --cwd packages/opencode-plugin typecheck`)
- [ ] No debug statements or commented-out code left behind
- [ ] Branch is up to date with main/base branch
- [ ] Commit messages are clear and conventional (no internal task IDs)
- [ ] Self-reviewed the diff — would you merge this?
- [ ] PR is focused: one logical change, not a grab-bag

## Creating a PR with `gh`

```bash
# Detect default branch
git remote show origin | grep 'HEAD branch'

# Create PR targeting main
gh pr create --base main --title "feat(hooks): add reference injection hook" --body "$(cat <<'EOF'
## Summary
[What and why]

## Changes
- [Change 1]
- [Change 2]

## Testing
- [How it was tested]
EOF
)"

# Create PR and open in browser
gh pr create --base main --web

# Check PR status
gh pr status

# View PR checks
gh pr checks
```

## PR Description Template

```markdown
## Summary
[WHAT: one paragraph explaining what changed. WHY: one sentence on motivation.]

## Changes
- [Specific change with context]
- [Another change with why it matters]

## Testing
- Unit tests added/updated: [test file names]
- Manual testing: [what you tested manually]
- Existing test suite: passing

## Notes
[Breaking changes, follow-up work, known limitations, deployment notes]
```

Fill in ALL sections. Empty "Notes" should say "None."

## PR Title Conventions

Format: `type(scope): descriptive summary` (same as commit format). Max 72 characters. The title must be understandable without reading the description.

| Good | Bad |
|------|-----|
| `feat(hooks): add reference injection on session start` | `feat: add stuff` |
| `fix(state): prevent double-write on concurrent tool calls` | `WIP fix` |
| `refactor(db): extract query builder into shared module` | `refactor: cleanup` |
| `docs(references): add PR creation guide` | `docs: update docs` |
| `chore(deps): bump bun to 1.2.0` | `chore: bump version` |

## Review Request Conventions

Tag a reviewer during creation with `--reviewer` or after with `gh pr edit`:

```bash
# Add reviewer at creation time
gh pr create --base main --reviewer octocat --title "..." --body "..."

# Add reviewer after creation
gh pr edit --add-reviewer octocat
```

Write a review comment pointing reviewers to the key decision:

> "Main thing to review: [specific area — e.g., the state merge logic in `src/features/state.ts:42`]"

Respond to all review comments, even if just "Done" or "Good point, won't fix because...". Don't close reviewer comments yourself — let the reviewer resolve.

## Linking Issues

In the PR body, use GitHub keywords to auto-close issues on merge:

```markdown
Fixes #123
Closes #456
Relates to #789
```

CLI example:

```bash
gh pr create --body "Fixes #123

## Summary
..."
```

GitHub keywords that trigger auto-close: `close`, `closes`, `closed`, `fix`, `fixes`, `fixed`, `resolve`, `resolves`, `resolved`.

Use `Relates to #123` for a reference without auto-close.

## Draft PRs

Use draft for work-in-progress:

```bash
# Create as draft
gh pr create --draft --base main --title "..." --body "..."

# Mark ready when done
gh pr ready
```

Good for: getting early feedback, running CI checks, cross-team visibility before the work is complete. Never merge a draft — always mark ready first.

## After the PR is Merged

```bash
# Delete the remote branch (GitHub UI does this automatically if configured)
# Delete local branch
git branch -d feat/my-feature

# Or derive branch name from the PR and delete
gh pr view --json headRefName -q '.headRefName' | xargs git branch -d

# Return to main and pull
git checkout main && git pull

# Confirm CI passed on the merged commit
gh run list --limit 3
```

## Anti-Patterns

- **Giant PRs (>500 lines)** — impossible to review thoroughly; split into smaller, focused PRs.
- **Vague titles** ("Fix stuff", "WIP", "Updates") — title must describe the change without reading the body.
- **No description** — reviewers shouldn't have to read the diff to understand intent.
- **Reviewing your own PR and immediately merging** — always get at least one other set of eyes.
- **Force-pushing to a PR branch after review has started** — rewrites history reviewers already read; use a new commit instead.
- **Marking comments resolved without addressing them** — let the reviewer decide when their concern is satisfied.

---

*PR Creation v1.0 — GoopSpec Reference*
