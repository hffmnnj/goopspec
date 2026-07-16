# PR Creation

Open pull requests that reviewers want to review.

## Atomic PR Strategy

Check `## Atomic PR Strategy` in `REQUIREMENTS.md` at the start of every workflow.

| Preference | Rule |
|------------|------|
| `Yes` | One PR per wave. Create a branch per wave. Stack Wave N+1 on Wave N. Open PR after each wave against the previous branch. Continue immediately — no merge gate. |
| `No` | All work goes into one branch. Open a single PR at the end. |
| `Custom` | Follow the explicit strategy written in `REQUIREMENTS.md`. |

Default in lazy-autopilot mode is `Yes`.

## Branch Naming

Format: `feat/<wave-description>`

- Kebab-case only.
- Keep it brief: 2-4 words.
- One branch per wave.
- Create the branch at wave start.
- Delete the branch after its PR merges.

Examples:

| Good | Bad |
|------|-----|
| `feat/auth-tokens` | `feat/new-stuff` |
| `feat/pr-workflow-improvements` | `feat/wave-2-branch` |
| `feat/db-migration` | `feat/JWT_and_OAuth` |

Before creating a branch, check for collisions:

```bash
git branch -a | grep feat/
```

## Stacked Branch Rule

Each wave branch is created immediately from the previous wave's branch — no waiting for a merge. Wave 1 branches from `main`; Wave N branches from Wave N-1.

PRs are opened after each wave against the previous branch: Wave N → Wave N-1; Wave 1 → main.

Only one wave is actively worked on at a time. Multiple open PRs in the stack are expected and correct.

## Stacked PR Model

Wave branches form a stack rooted at `main`:

```
main ← feat/wave-1 ← feat/wave-2 ← feat/wave-3 ← …
```

Each PR targets the previous branch. When GitHub merges an upstream PR, it automatically re-targets the next PR in the stack to the new base.

To merge a stack: merge Wave 1 first, then Wave 2 (now re-targeted to main), and so on in order. The accept step handles this automatically when you choose to merge.

## Single-Branch Parallelism Rule

Parallel agents may only run simultaneously on the same branch. Never dispatch agents to different branches at the same time. Multiple branches = multiple sources of truth = merge conflicts and context loss.

## Commit Timing

Commit after EACH task completes — not at wave end.

- Minimum: one commit per completed task.
- A wave with 3 tasks produces ≥3 commits.
- Verify after each commit: `git log --oneline -5`.

For exact commit-message style, see `git-workflow.md`.

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
[WHAT: one paragraph. WHY: one sentence.]

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

## Atomic PR Model

One PR per logical change — not one per session, not one per project milestone.

Each PR should be independently reviewable, mergeable, and understandable without context from any other PR in a series.

**When to split into separate PRs:**
- Distinct feature areas that can ship independently
- Infrastructure changes separate from feature changes
- Bug fixes separate from feature additions
- Documentation changes separate from code changes

**When NOT to split:**
- Tightly coupled changes that would break if either merged alone
- Trivial follow-up (typo fix, comment) directly after the PR it targets

**Benefits:**
- Reviewers can focus on one clear scope
- Smaller diffs are reviewed more thoroughly
- Failed or reverted changes have a smaller blast radius
- Git history is more useful: `git log --oneline` tells a story

**Branching convention:**
- Name branches for the feature, not the session
- Use `feat/<name>`, `fix/<description>`, `chore/<description>`
- Never encode session identifiers or internal tooling phases into branch names

**Forbidden Patterns:**
- Running parallel agents on different branches — creates divergent sources of truth
- Creating Wave N+1 branch from `main` instead of stacking on Wave N's branch — wrong base, breaks the stack

## Terminology Gate

PRs must use plain English. Internal tooling terminology must not appear in PR titles, descriptions, or branch names.

The `goop_create_pr` tool enforces this automatically — it scans PR content before calling `gh pr create` and blocks if forbidden terms are detected.

**Forbidden term categories:**
- Planning phases: "wave", "wave 2/4", "task 2.1"
- Requirements labels: "must-have", "MH-3", "nice-to-have", "NH-1"
- Internal agent names: "goop-executor", "goop-executor-medium"
- Internal documents: "chronicle", "ADL", "wiring task"
- Process terms: "spec locked", "acceptance gate", "deviation rule"

**Severity levels:**
- `error` — blocks PR creation. Fix the content before retrying.
- `warn` — logged but does not block.

**Before/after example:**

Before (blocked):
```
Title: Complete wave 2/4 — MH-3 implemented
Body: goop-executor-medium ran the wiring task. Deviation rule 3 applied. ADL updated.
```

After (passes gate):
```
Title: Add PR creation tool with terminology gate
Body: Implements the sanitizer module and MCP tool. Integration step verified. Decision log updated.
```

**Using `goop_create_pr`:**
```bash
goop_create_pr({
  title: "feat(tools): add PR creation tool with terminology gate",
  body: "Implements the sanitizer and MCP tool...",
  branch: "feat/atomic-pr-system",
  base: "main"
})
```

If the gate blocks, the tool returns a list of violations with line numbers and suggested replacements. Fix the offending lines and retry.

## Verification Checklist

Before pushing a wave branch and opening a PR:

- [ ] Branch created from latest `main`.
- [ ] One commit per task minimum — `git log --oneline -5` shows individual commits.
- [ ] Branch is stacked on the previous wave branch (not main, unless this is Wave 1).
- [ ] PR title follows conventional commit format (`type(scope): description`).
- [ ] `git diff --name-only main` shows only expected files.
- [ ] No internal GoopSpec terms in PR title or body (see Terminology Gate).
- [ ] Self-reviewed the diff — would you merge this?

## Anti-Patterns

- **Giant PRs (>500 lines)** — impossible to review thoroughly; split into smaller, focused PRs.
- **Vague titles** ("Fix stuff", "WIP", "Updates") — title must describe the change without reading the body.
- **No description** — reviewers shouldn't have to read the diff to understand intent.
- **Reviewing your own PR and immediately merging** — always get at least one other set of eyes.
- **Force-pushing to a PR branch after review has started** — rewrites history reviewers already read; use a new commit instead.
- **Marking comments resolved without addressing them** — let the reviewer decide when their concern is satisfied.
- **Bundling unrelated changes** — each PR should have one reason to exist.
- **Cross-branch parallel dispatch** — never run parallel agents on different branches simultaneously.
- **Wrong base** — never create Wave N+1 from `main`; always stack it on Wave N's branch.

---

*PR Creation v1.2 — GoopSpec Reference*
