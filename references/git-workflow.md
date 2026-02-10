# Git Workflow

Best practices for Git operations in GoopSpec agents. All commits should be professional, well-formatted, and universally understandable by any developer.

## Core Principles

### Universal Commit Messages

**CRITICAL:** Commit messages must be understandable by anyone. Never reference:
- GoopSpec phases, waves, or task IDs
- Internal planning documents (SPEC.md, BLUEPRINT.md, etc.)
- Agent names or orchestration concepts
- Tool names or MCP terminology

Write commits as if you're on a team where no one knows GoopSpec exists.

### Professional Quality

Commits should:
- Be indistinguishable from expert human developers
- Follow conventional commit format
- Explain the "why" not just the "what"
- Be atomic (one logical change per commit)

---

## Commit Message Format

```
type(scope): concise but descriptive title (max 72 chars)

[2-4 sentence paragraph explaining context, motivation, and approach.
Why was this change needed? What problem does it solve?]

Changes:
- Specific change with context
- Another change with why it matters
- Include file/module names when helpful

[Optional: Breaking changes, migration notes, or follow-up needed]
```

### Types

| Type | Use For |
|------|---------|
| `feat` | New feature or capability |
| `fix` | Bug fix |
| `refactor` | Code restructuring (no behavior change) |
| `docs` | Documentation only |
| `test` | Adding or updating tests |
| `chore` | Config, deps, build tooling |
| `style` | Formatting, whitespace (no logic change) |
| `perf` | Performance improvements |

### Scope

The affected area/module. Required for non-trivial changes.

Examples: `auth`, `api`, `ui`, `database`, `config`, `deps`

---

## Good vs Bad Examples

### Title Examples

**Good:**
```
feat(auth): Add OAuth2 login with Google and GitHub
fix(api): Resolve race condition in concurrent requests
refactor(ui): Extract shared button styles into component
perf(database): Add index to users.email for faster lookups
```

**Bad:**
```
Update files                      # Too vague
Fix bug                           # Says nothing
feat: W2.T4 complete              # References internal task
chore: Task from BLUEPRINT.md     # References planning docs
feat(auth): Added feature         # Redundant, past tense
```

### Full Message Examples

**Good commit:**
```
feat(users): Add avatar upload with image resizing

Users can now upload profile avatars. The system accepts common image
formats and automatically resizes them to standard dimensions (150x150
for thumbnails, 400x400 for full size) to optimize storage and load times.

Changes:
- Add AvatarUpload component with drag-and-drop support
- Implement server-side image processing with Sharp
- Create avatar storage service with S3 integration
- Add migration for avatar_url column on users table
```

**Bad commit:**
```
feat(users): Wave 2 Task 3 - implement avatar upload per SPEC MH-04

Completed task W2.T3 from BLUEPRINT.md. This satisfies must-have MH-04
from the specification. Moving to next task in the wave.

Changes:
- Implemented the feature as specified
- Added required files
- Tests pass
```

---

## Single vs Multiple Commits

### Use Single Commit When:
- All changes serve one purpose
- Changes are tightly coupled
- Total changes are small (<100 lines or <5 files)

### Use Multiple Commits When:
- Changes include unrelated fixes/features
- Cleanup/refactoring mixed with new functionality
- Tests added separately from implementation
- Documentation updated independently
- Config changes separate from code changes

### Multi-Commit Order

When splitting into multiple commits, order from independent to dependent:

```
1. chore(deps): Update axios to v1.6.0
2. fix(ui): Correct typo in welcome message
3. feat(users): Add avatar upload with resizing
```

---

## Branching

### Branch Naming

Format: `type/short-description`

```
feat/user-avatars
fix/login-race-condition
refactor/button-components
chore/update-dependencies
```

### Creating Branches

Before creating:
1. Check existing branches: `git branch --list`
2. Ensure name is unique and descriptive
3. If similar exists, make more specific: `feat/auth` → `feat/auth-oauth`

---

## Pre-Commit Checklist

Before committing, verify:

- [ ] All tests pass
- [ ] No TypeScript/linting errors
- [ ] No console.log or debug statements
- [ ] Commit message is specific (not generic)
- [ ] Message explains WHY, not just WHAT
- [ ] No internal references (phases, waves, tasks)
- [ ] Someone unfamiliar could understand the change

---

## Commit Workflow

### Step 1: Review Changes

```bash
git status                    # See modified files
git diff                      # Review unstaged changes
git diff --staged             # Review staged changes
```

### Step 2: Stage Thoughtfully

Stage related changes together:

```bash
git add src/components/Avatar.tsx
git add src/services/avatar.ts
git add tests/avatar.test.ts
```

Or stage all if changes are cohesive:

```bash
git add -A
```

### Step 3: Commit with Quality Message

```bash
git commit -m "type(scope): title" -m "Body paragraph explaining why."
```

Or for longer messages, let the editor open:

```bash
git commit
```

### Step 4: Verify

```bash
git log -1                    # Review the commit
git show HEAD --stat          # See files changed
```

---

## Pull Request Guidelines

### PR Title

Same format as commits: `type(scope): Descriptive summary`

### PR Description Template

```markdown
## Summary

[2-4 sentences: WHAT this PR does and WHY it was needed.
What problem does it solve? What's the approach?]

## Changes

- [Specific change with context]
- [Another change with why it matters]
- [Group related changes together]

## Testing

- [How was this tested?]
- [Manual testing performed]
- [Automated tests added/modified]

## Notes

[Breaking changes, migration steps, follow-up work, deployment notes]
```

### Target Branch Selection

Before creating a PR, confirm which base branch the PR should target.

1. Detect the repository default branch:

```bash
git remote show origin | grep 'HEAD branch' | sed 's/.*: //'
```

2. If detection fails or returns empty, default to `main`.
3. Prompt the user for confirmation before creating the PR.

Prompt pattern:

```text
Detected default branch: main
"Which base branch should this PR target? [main]"
```

4. Use the selected branch with `gh pr create --base <branch>`.

Common patterns:
- `main` - Most common default branch
- `develop` - Projects using Git Flow
- `release/*` - Release-branch workflows

Example:

```text
Detected default branch: main
"Which base branch should this PR target? [main]"
-> gh pr create --base main --title "..." --body "..."
```

---

## Safety Rules

### Never

- Force push to main/master without explicit user request
- Commit secrets, credentials, or .env files
- Skip GPG signing if configured
- Create empty commits
- Commit with `--no-verify` (skips hooks)
- Add AI attribution or "Generated with" footers

### Always

- Run tests before committing
- Preserve GPG signing configuration
- Check for sensitive files before staging
- Use atomic commits (one logical change each)

---

## Handling Merge Conflicts

### Step 1: Identify Conflicts

```bash
git status                    # Shows conflicted files
```

### Step 2: Resolve

Open each conflicted file and resolve:
- Keep their changes: accept incoming
- Keep your changes: accept current
- Combine both: manual merge

### Step 3: Mark Resolved

```bash
git add <resolved-file>
git commit                    # Complete the merge
```

---

## Recovery Commands

### Undo Last Commit (Keep Changes)

```bash
git reset --soft HEAD~1
```

### Undo Last Commit (Discard Changes)

```bash
git reset --hard HEAD~1
```

### Amend Last Commit

Only if NOT pushed:

```bash
git commit --amend
```

### Stash Changes

```bash
git stash                     # Save changes
git stash pop                 # Restore changes
git stash list                # See stashed items
```

---

## Quality Checklist for Agents

Before any commit, verify:

1. **Message is universal** - No GoopSpec terminology
2. **Title is specific** - Not "Update files" or "Fix bug"
3. **Body explains why** - Context and motivation included
4. **Changes are atomic** - One logical unit of work
5. **Tests pass** - Verified before committing
6. **No debug code** - console.log removed
7. **GPG preserved** - Don't disable signing

---

*Git Workflow Reference v1.0*
