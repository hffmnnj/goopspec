# Git Workflow

Professional, atomic, universally understandable commits.

## Core Principles

### Universal Commit Messages

Commit messages must be understandable by anyone. Never reference:

- GoopSpec phases, waves, or task IDs.
- Internal planning documents (`SPEC.md`, `BLUEPRINT.md`, etc.).
- Agent names or orchestration concepts.
- Tool names or MCP terminology.

Write commits as if no one knows GoopSpec exists.

### Atomic Commits

- One logical change per commit.
- At least one commit per completed task.
- Announce commits in task reports; no silent commits.
- Split into multiple focused commits when a task contains unrelated changes.

## Commit Message Format

```
type(scope): concise but descriptive title (max 72 chars)

[2-4 sentence paragraph explaining context, motivation, and approach.]

Changes:
- Specific change with context
- Another change with why it matters

[Optional: breaking changes, migration notes, or follow-up]
```

### Types

| Type | Use For |
|------|---------|
| `feat` | New feature |
| `fix` | Bug fix |
| `refactor` | Restructuring with no behavior change |
| `docs` | Documentation only |
| `test` | Test-only changes |
| `chore` | Config, deps, build tooling |
| `style` | Formatting, whitespace |
| `perf` | Performance improvement |

### Scope

The affected module or area. Required for non-trivial changes. Examples: `auth`, `api`, `ui`, `database`, `config`.

## Good vs Bad Examples

Good:

```
feat(auth): Add OAuth2 login with Google and GitHub

Users can now authenticate via Google or GitHub. This replaces the
legacy email-only flow and simplifies onboarding.

Changes:
- Add OAuth2 callback handler
- Update user schema to store provider IDs
- Add provider selection UI
```

Bad:

```
feat(auth): Wave 2 Task 3 - implement OAuth per SPEC MH-04

Completed task W2.T3 from BLUEPRINT.md.

Changes:
- Implemented the feature
- Added required files
- Tests pass
```

## Single vs Multiple Commits

Use a single commit when changes serve one purpose, are tightly coupled, and are small.

Use multiple commits when changes include unrelated fixes/features, tests added separately, or config changes separate from code.

Order multiple commits from independent to dependent.

## Branching

- Format: `type/short-description`.
- Types: `feat/`, `fix/`, `refactor/`, `chore/`.
- Keep descriptions short and kebab-case.
- Check existing branches first to avoid collisions.

## Pre-Commit Checklist

- [ ] All tests pass.
- [ ] No TypeScript/linting errors.
- [ ] No debug statements left behind.
- [ ] Commit message is specific.
- [ ] Message explains why, not just what.
- [ ] No internal references.
- [ ] A stranger could understand the change.
- [ ] One logical change per commit.
- [ ] Commit leaves the code in a buildable state.
- [ ] Diff is reviewable (< 200 lines ideal).

## Code Review

Review focus areas: correctness, design, performance, security, maintainability.

Comment types:

| Type | Action Required |
|------|-----------------|
| **Blocking** | Must fix before merge |
| **Suggestion** | Nice to have |
| **Question** | Needs clarification |
| **Nitpick** | Style preference; prefix with `nit:` |

## Pull Requests

### PR Title

Same format as commits: `type(scope): descriptive summary`.

### PR Description Template

```markdown
## Summary
[WHAT and WHY]

## Changes
- [Specific change]
- [Another change]

## Testing
- [How tested]

## Notes
[Breaking changes, follow-up work]
```

### Target Branch

1. Detect default branch: `git remote show origin | grep 'HEAD branch'`.
2. Default to `main` if detection fails.
3. Confirm target branch with the user before creating the PR.

## Safety Rules

### Never

- Force push to main/master without explicit user request.
- Commit secrets, credentials, or `.env` files.
- Create empty commits.
- Use `--no-verify` to skip hooks.
- Add AI attribution footers.

### Always

- Run tests before committing.
- Preserve GPG signing configuration.
- Check for sensitive files before staging.
- Use atomic commits.

## Recovery Commands

| Goal | Command |
|------|---------|
| Undo last commit, keep changes | `git reset --soft HEAD~1` |
| Undo last commit, discard changes | `git reset --hard HEAD~1` |
| Amend last commit (not pushed) | `git commit --amend` |
| Stash changes | `git stash` / `git stash pop` |

---

*Git Workflow v1.0 — GoopSpec Reference*
