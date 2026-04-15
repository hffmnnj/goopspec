---
name: goop-pr-review
description: Review a GitHub pull request end-to-end with intelligent fix options and safe merge flow
phase: standalone
next-step: "After review completion, offer merge options with explicit confirmation"
next-command: null
alternatives:
  - command: /goop-quick
    when: "If you need to make a quick fix to the PR"
  - command: /goop-debug
    when: "If you need to debug a specific issue found in the PR"
---

# /goop-pr-review

**Comprehensive PR review with intelligent fixes and safe merge.** Standalone command for reviewing GitHub pull requests.

## Usage

```bash
/goop-pr-review
```

The command will interactively prompt for PR selection.

### Prerequisites

- `gh` CLI installed and authenticated
- Current directory is a git repository
- PR belongs to the current repository

## Quick Summary

**Review a PR end-to-end:** Select PR → Analyze quality/security/spec → Apply fixes → Merge with confirmation.

### Tools Used

| Tool | Purpose |
|------|---------|
| `goop_state` | Check current state |
| `memory_search` | Find relevant prior review patterns |
| `memory_save` | Persist review findings |
| `goop_spec` | Load spec files for requirement verification (when present) |
| `goop_adl` | Log review decisions |

### Process Overview

1. **Preflight Check** — Verify `gh` CLI is installed and authenticated
2. **PR Selection** — Prompt for PR number or URL, validate accessibility
3. **PR Context Display** — Show PR title, author, source branch, target branch
4. **Review Analysis** — Run comprehensive checks:
   - Quality: lint/type/test status
   - Security: vulnerability and security-relevant findings
   - Spec Alignment: verify against `.goopspec/SPEC.md` and `.goopspec/BLUEPRINT.md` (when present)
   - Change Summary: human-readable summary of changes
5. **Review Report** — Present structured findings with severity indicators
6. **Fix Options** — Offer selectable fix categories:
   - Lint/format fixes
   - Failing test remediation
   - Code review comment remediation
   - Missing requirements remediation (when spec files exist)
7. **Fix Execution** — Apply only user-selected fixes with post-fix verification
8. **Merge Flow** — After review/fixes complete:
   - Prompt for merge strategy (`merge` or `squash`)
   - Display final summary of any unresolved findings
   - **Require explicit confirmation** before merge execution
   - Execute merge via `gh pr merge` with selected strategy
   - Handle merge success/failure with actionable output

## Input Contract

### PR Selection Prompt

User provides one of:
- **PR number** (e.g., `42`)
- **PR URL** (e.g., `https://github.com/owner/repo/pull/42`)

### Validation Outcomes

| Outcome | Action |
|---------|--------|
| PR exists and accessible | Continue to review |
| PR not found | Exit with error message |
| PR already closed/merged | Exit with status message |
| `gh` not installed | Exit with setup instructions |
| `gh` not authenticated | Exit with auth instructions |
| PR not in current repo | Exit with guidance |

## Fix Categories

All fix options are **opt-in**. User selects which to apply:

| Category | When Offered | Action |
|----------|--------------|--------|
| Lint/Format | Linting failures detected | Run formatter/linter with auto-fix |
| Test Remediation | Failing tests detected | Attempt to fix failing test cases |
| Comment Remediation | Review comments present | Address code review feedback |
| Requirements | Spec gaps found (when `.goopspec/` exists) | Implement missing must-haves |

## Merge Confirmation Requirement

**CRITICAL:** Merge can only proceed after:

1. User selects merge strategy (`merge` or `squash`)
2. System displays final summary including any unresolved findings
3. User explicitly confirms with "yes" or equivalent affirmative response

**No automatic merge.** Confirmation is mandatory even if all checks pass.

## No-Spec Mode

When `.goopspec/SPEC.md` and `.goopspec/BLUEPRINT.md` are not present:
- Review runs in **no-spec mode**
- Spec alignment section is skipped
- Requirements remediation option is not offered
- All other review capabilities remain functional

## Dirty Working Directory

If uncommitted changes are detected:
- Display warning with list of changed files
- Offer options:
  - Continue (review only, no fixes)
  - Cancel (exit command)
- Fixes are disabled until working directory is clean

## Output

| File | Purpose |
|------|---------|
| `.goopspec/ADL.md` | Review decisions and fix actions logged |
| Source files | Modified by selected fix handlers |
| Commits | Created by fix handlers (atomic per fix category) |

## Success Criteria

- [ ] `gh` CLI validated (installed + authenticated)
- [ ] PR selected and validated (exists, accessible, open)
- [ ] PR context displayed (title, author, branches)
- [ ] Review analysis complete (quality, security, spec, summary)
- [ ] Review report presented clearly
- [ ] Fix options offered (all applicable categories)
- [ ] User-selected fixes applied and verified
- [ ] Merge strategy selected by user
- [ ] Explicit merge confirmation obtained
- [ ] Merge executed via `gh pr merge` with selected strategy
- [ ] Merge outcome handled (success or failure with guidance)

## Error Handling

| Error | Response |
|-------|----------|
| `gh` missing | "Install gh CLI: https://cli.github.com/" |
| `gh` not authenticated | "Run: gh auth login" |
| PR not found | "PR #X not found in current repository" |
| PR closed/merged | "PR #X is already [closed/merged]" |
| No merge permission | "You don't have permission to merge this PR" |
| Merge conflict | "PR has merge conflicts. Resolve manually first." |
| Fix verification fails | "Fix introduced new issues. Review changes before merge." |

## Anti-Patterns

**DON'T:** 
- Merge without explicit confirmation
- Apply fixes without user selection
- Skip verification after fixes
- Use raw GitHub API (always use `gh` CLI)
- Block review when spec files are absent

**DO:** 
- Validate PR state before expensive analysis
- Warn on dirty working directory
- Re-verify after applying fixes
- Provide actionable error messages
- Support graceful degradation (no-spec mode)

---

*This command is standalone and does not require active GoopSpec workflow state.*
