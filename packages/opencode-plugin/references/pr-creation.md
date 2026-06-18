# PR Creation Reference

Guidelines for creating pull requests in GoopSpec workflows.

---

## Overview

Pull requests are the primary mechanism for shipping changes. Every PR should be independently reviewable and understandable by any developer — including those unfamiliar with GoopSpec internals.

---

## PR Checklist

Before opening a PR:

- [ ] Branch name follows convention: `feat/<name>`, `fix/<description>`, `chore/<description>`
- [ ] Title is plain English — no internal tooling terms
- [ ] Body describes what changed and why — no internal phase or task references
- [ ] All tests pass locally
- [ ] TypeScript compiles without errors
- [ ] Diff is focused on one logical change

---

## PR Title Format

Use conventional commit format:

```
<type>(<scope>): <short description>
```

**Types:** `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `perf`

**Examples:**
- `feat(tools): add PR creation tool with terminology gate`
- `fix(sanitizer): handle multi-line input correctly`
- `docs(references): update PR creation guide`
- `chore(deps): bump bun to 1.2.0`

---

## PR Body Template

```markdown
## What

Brief description of what this PR does.

## Why

Why this change is needed.

## How

Key implementation decisions or approach notes.

## Testing

How this was tested. Which test files cover it.
```

---

## Branch Naming

| Change Type | Pattern | Example |
|-------------|---------|---------|
| New feature | `feat/<name>` | `feat/pr-creation-tool` |
| Bug fix | `fix/<description>` | `fix/sanitizer-false-positives` |
| Chore / maintenance | `chore/<description>` | `chore/update-dependencies` |
| Documentation | `docs/<description>` | `docs/update-pr-guide` |
| Refactor | `refactor/<description>` | `refactor/tool-registry` |

---

## Atomic PR Model

One PR per logical change. Not one PR per workflow session.

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
- Failed or reverted changes have smaller blast radius
- Git history is more useful: `git log --oneline` tells a story

**Branching convention:**
- Name branches for the feature, not the workflow session
- Use `feat/<feature-name>`, `fix/<description>`, `chore/<description>`
- Never encode session identifiers or internal tooling phases into branch names

---

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
- `warn` — logged but does not block. Review whether the term adds clarity or noise.

**Before/after example:**

Before (blocked):
```
Title: Complete wave 2/4 — MH-3 implemented
Body: goop-executor-medium ran the wiring task. Deviation rule 3 applied. ADL updated. blueprint reviewed.
```

After (passes gate):
```
Title: Add PR creation tool with terminology gate
Body: Implements the sanitizer module and MCP tool. Integration step verified against existing tests. Decision log updated. Plan reviewed.
```

**Using `goop_create_pr`:**
```bash
# Via MCP tool call
goop_create_pr({
  title: "Add PR creation tool with terminology gate",
  body: "Implements the sanitizer and MCP tool...",
  branch: "feat/atomic-pr-system",
  base: "main"
})
```

If the gate blocks, the tool returns a list of violations with line numbers and suggested replacements. Fix the offending lines and retry.

---

*PR Creation Reference v1.1 — GoopSpec Reference*
