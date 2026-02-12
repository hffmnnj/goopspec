---
name: atomic-commits
description: Create small, focused commits that each represent a single logical change.
category: code
triggers:
  - commit
  - git
  - atomic
  - history
version: 0.2.7
---

# Atomic Commits Skill

## Purpose

Create small, focused commits that each represent a single logical change. All commits must be professional and universally understandable.

## Core Principles

1. **One Change Per Commit** - Each commit should do one thing
2. **Buildable State** - Every commit should leave the code in a working state
3. **Meaningful Messages** - Commit messages explain the why, not just the what
4. **Reviewable Size** - Commits should be easy to review (< 200 lines ideal)
5. **Universal Language** - No internal jargon, phases, or task references

## Critical: Universal Commit Messages

**NEVER include in commit messages:**
- GoopSpec phases, waves, or task IDs (W1.T2, Phase 3, etc.)
- References to SPEC.md, BLUEPRINT.md, or planning documents
- Agent names or orchestration terminology
- Internal must-have IDs (MH-01, etc.)

Write commits as if no one on the team knows GoopSpec exists.

## Commit Structure

```
type(scope): concise but descriptive title (max 72 chars)

[2-4 sentence paragraph explaining context and motivation.
Why was this change needed? What problem does it solve?]

Changes:
- Specific change with context
- Another change with why it matters

[Optional: Breaking changes, migration notes]
```

## Types

| Type | Use For |
|------|---------|
| `feat` | New feature or capability |
| `fix` | Bug fix |
| `refactor` | Code restructuring (no behavior change) |
| `docs` | Documentation only |
| `test` | Adding or updating tests |
| `chore` | Config, deps, build tooling |
| `style` | Formatting, whitespace |
| `perf` | Performance improvements |

## Good vs Bad Examples

**Good:**
```
feat(auth): Add OAuth2 login with Google and GitHub

Users can now sign in using their Google or GitHub accounts.
This reduces friction for new user onboarding and leverages
existing identity providers for security.

Changes:
- Add OAuth2 client configuration
- Implement callback handlers for each provider
- Add provider selection UI to login page
```

**Bad:**
```
feat(auth): Wave 2 Task 4 - OAuth implementation

Completed W2.T4 from BLUEPRINT.md per MH-05 specification.
The implementation agent completed this feature.

Changes:
- Implemented as specified in SPEC.md
```

## Single vs Multiple Commits

**Single commit when:**
- All changes serve one purpose
- Changes are tightly coupled
- Small scope (<100 lines, <5 files)

**Multiple commits when:**
- Unrelated fixes mixed with features
- Refactoring separate from new functionality
- Tests added independently
- Config changes separate from code

## Pre-Commit Checklist

- [ ] Tests pass
- [ ] No TypeScript/linting errors
- [ ] No console.log or debug code
- [ ] Message is specific (not generic)
- [ ] Message explains WHY
- [ ] No internal references (phases, waves, tasks)
- [ ] GPG signing preserved

## Reference

For complete Git workflow guidance, load:
```
goop_reference({ name: "git-workflow" })
```

## Anti-Patterns to Avoid

- "WIP" commits
- "Fix typo" without context
- "Update files" or "Minor changes"
- Multiple unrelated changes in one commit
- Breaking commits (code doesn't build)
- Giant commits that do everything
- Internal jargon in messages
