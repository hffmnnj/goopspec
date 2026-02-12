# Workflow: PR Review

Standalone command for comprehensive GitHub pull request review with intelligent fixes and safe merge flow.

## Prerequisites

**Required:**
- `gh` CLI installed and authenticated
- Current directory is a git repository
- PR belongs to the current repository

**Validation:**
```bash
gh --version          # Must succeed
gh auth status        # Must show authenticated
git rev-parse --git-dir  # Must be in git repo
```

**Setup Instructions:**
- Install `gh`: https://cli.github.com/
- Authenticate: `gh auth login`

## Workflow Phases

### Phase 1: Preflight and Selection

**Actions:**
1. Validate `gh` CLI installation and authentication
2. Prompt user for PR number or URL
3. Resolve and validate PR accessibility
4. Check PR state (must be open)
5. Display PR context (title, author, branches)

**Outcomes:**
- Success: Proceed to review analysis
- Failure: Exit with actionable error message

**Error Handling:**
| Error | Message | Recovery |
|-------|---------|----------|
| `gh` not installed | "Install gh CLI: https://cli.github.com/" | Install and retry |
| `gh` not authenticated | "Run: gh auth login" | Authenticate and retry |
| PR not found | "PR #X not found in current repository" | Verify PR number/URL |
| PR closed/merged | "PR #X is already [closed/merged]" | Select different PR |

---

### Phase 2: Review Analysis

**Actions:**
1. Collect PR data via `gh` CLI:
   - Metadata (title, author, branches, state)
   - Changed files and diff statistics
   - Check runs (CI/CD status)
   - Review comments
2. Detect spec mode:
   - Check for `.goopspec/SPEC.md` and `.goopspec/BLUEPRINT.md`
   - Set no-spec mode if absent
3. Run analyzers:
   - **Quality:** Lint/type/test status from check runs
   - **Security:** Vulnerability signals from checks and comments
   - **Spec Alignment:** Verify against must-haves (when spec files present)
   - **Change Summary:** Human-readable summary of changes
4. Generate structured review report

**Outcomes:**
- Review report with four sections: quality, security, spec (if applicable), summary
- List of applicable fix categories
- Proceed to fix selection

**No-Spec Mode Behavior:**
When `.goopspec/` files are absent:
- Review continues normally
- Spec alignment section is skipped
- Requirements remediation option is not offered
- All other capabilities remain functional

---

### Phase 3: Fix Selection and Execution

**Actions:**
1. Check working directory status
   - If dirty: warn and offer continue (review-only) or cancel
   - If clean: proceed to fix options
2. Present fix categories (opt-in):
   - Lint/format fixes
   - Failing test remediation
   - Code review comment remediation
   - Missing requirements remediation (only when spec files exist)
3. User selects which fixes to apply (multi-select)
4. Execute selected fixes sequentially
5. Run post-fix verification for each fix
6. Report fix outcomes (success/failure/skipped)

**Outcomes:**
- Selected fixes applied and verified
- Working directory may have new commits
- Proceed to merge flow

**Fix Verification:**
After each fix category:
```bash
bun test              # For test fixes
bun run typecheck     # For lint/type fixes
# Targeted verification based on fix type
```

**Rollback Guidance:**
If fix verification fails:
- Stop fix pipeline
- Report which fix introduced issues
- Provide rollback instructions
- Block merge until resolved

---

### Phase 4: Merge Flow (MERGE CONFIRMATION GATE)

**Actions:**
1. Prompt for merge strategy:
   - `merge` - Create merge commit
   - `squash` - Squash and merge
2. Display final summary:
   - Review findings recap
   - Unresolved issues (if any)
   - Fix outcomes
   - Merge impact
3. **Request explicit confirmation:**
   - "Type 'yes' to merge this PR with [strategy]"
   - User must type affirmative response
4. Execute merge via `gh pr merge --[strategy]`
5. Handle merge outcome:
   - Success: Confirm merge completion
   - Conflict: Provide manual resolution guidance
   - Permission failure: Report permission issue

**Outcomes:**
- Success: PR merged, command complete
- Failure: Actionable error message with recovery steps

**Merge Confirmation Requirement (HARD GATE):**
- **No automatic merge** - confirmation is mandatory
- **No bypass** - even when all checks pass
- **Explicit user action** - must type "yes" or equivalent
- **Final summary** - user sees all findings before confirming

**Error Handling:**
| Error | Message | Recovery |
|-------|---------|----------|
| No merge permission | "You don't have permission to merge this PR" | Request permission from maintainer |
| Merge conflict | "PR has merge conflicts. Resolve manually first." | Resolve conflicts locally, push, retry |
| Merge API failure | "Merge failed: [reason]" | Check PR state, retry or merge manually |

---

## State Independence

**Key Characteristic:** `/goop-pr-review` is **standalone** and does not require active GoopSpec workflow state.

**Implications:**
- Can be run in any repository (with or without `.goopspec/`)
- Does not modify workflow state (`state.json`)
- Does not require spec lock
- Does not require active phase
- Gracefully degrades when spec files absent

**Integration Points:**
- Uses `goop_state` to check for spec files (read-only)
- Uses `goop_spec` to load SPEC.md/BLUEPRINT.md when present
- Uses `goop_adl` to log review decisions
- Uses `memory_search` and `memory_save` for context

---

## Verification Expectations

Before merge confirmation, verify:

**Quality Checks:**
- [ ] Lint/format passes (or fix applied)
- [ ] Type checking passes (or fix applied)
- [ ] Tests pass (or fix applied)

**Security Checks:**
- [ ] No new vulnerabilities introduced
- [ ] Security-relevant comments addressed
- [ ] Dependency updates reviewed

**Spec Alignment (when applicable):**
- [ ] All must-haves covered by PR changes
- [ ] No out-of-scope changes introduced
- [ ] Traceability maintained

**Post-Fix Verification (when fixes applied):**
- [ ] Fix verification passed
- [ ] No new issues introduced
- [ ] Working directory clean (or changes committed)

---

## Handoff Instructions

**For Orchestrator:**
- Command is self-contained, no handoff needed
- Review findings logged to ADL.md
- Memory persisted for future reference

**For User:**
After merge completion:
- PR is merged and closed
- Local branch may need cleanup: `git branch -d [branch]`
- Remote branch may need cleanup: `git push origin --delete [branch]`

**For Next Session:**
- Review findings available in `.goopspec/ADL.md`
- Memory searchable via `/goop-recall`

---

## Anti-Patterns

**DON'T:**
- Merge without explicit confirmation
- Apply fixes without user selection
- Skip post-fix verification
- Use raw GitHub API (always use `gh` CLI)
- Block review when spec files absent
- Continue with dirty working directory for fixes

**DO:**
- Validate PR state before expensive analysis
- Warn on dirty working directory
- Re-verify after applying fixes
- Provide actionable error messages
- Support graceful degradation (no-spec mode)
- Cache `gh` responses to avoid rate limits

---

*Workflow: PR Review v1.0*
*Standalone command with merge confirmation gate*
