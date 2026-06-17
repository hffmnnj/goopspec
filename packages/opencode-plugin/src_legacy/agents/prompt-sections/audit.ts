/**
 * Phase 4: Audit prompt section
 * @module agents/prompt-sections/audit
 */

export function buildAuditSection(): string {
  return `<Phase_4_Audit>
## Phase 4: Audit

**Goal**: Verify implementation against requirements before declaring completion.

### Short-Answer Question Policy (Shared)

Use structured question prompts for audit responses that can be short: pass/fail confirmations, issue triage choices, and next-step selection.

Use free-form prompts when the user needs to provide long-form analysis, nuanced risk explanation, or multi-paragraph feedback.

For structured prompts:
- Provide 2-5 options that reflect likely audit outcomes
- Keep labels human-readable and context-aware
- Always include a custom path labeled "Type your own answer"
- Treat custom input as required default behavior in all short-question patterns

### Reusable Structured Templates

1. **Yes/No template**
   - For readiness checks and approval gates
   - Option pattern: "Yes, this passes", "No, needs fixes", "Type your own answer"

2. **Multi-choice template**
   - For classifying findings (minor, moderate, major) or selecting remediation path
   - Option pattern: 2-4 audit-specific choices plus "Type your own answer"

3. **Progressive collection template**
   - For collecting multiple short verification details in sequence
   - Each step includes 2-5 options and "Type your own answer"
   - Follow up using prior responses to keep the flow conversational

### Audit Process

1. **Delegate to goop-verifier**
   \`\`\`
task({
     subagent_type: "general",
     description: "Verify requirements",
     prompt: \`
       Verify implementation against requirements:
       
       Original Requirements:
       [requirements from Phase 1]
       
       Execution Plan:
       [PLAN.md reference]
       
       Files Modified:
       [list of changed files]
       
       Verify:
       1. All requirements are met
       2. Acceptance criteria satisfied
       3. No regressions introduced
       4. Code quality standards met
       5. Security considerations addressed
     \`
   })
   \`\`\`

2. **Review Verification Results**

### Verification Checklist

**Functional Verification:**
- [ ] All requirements from Phase 1 implemented
- [ ] All acceptance criteria met
- [ ] Edge cases handled
- [ ] Error handling in place

**Quality Verification:**
- [ ] Code follows existing patterns
- [ ] No TypeScript errors
- [ ] Tests pass (if applicable)
- [ ] No console.log or debug code

**Security Verification:**
- [ ] Input validation present
- [ ] No hardcoded secrets
- [ ] Auth/authz properly handled
- [ ] No obvious vulnerabilities

**Documentation Verification:**
- [ ] ADL updated with decisions
- [ ] Code comments where needed
- [ ] README updated (if applicable)

### Handling Audit Failures

**If verification fails:**

1. **Minor Issues** (typos, missing edge cases)
   - Fix directly or delegate to executor
   - Re-verify affected areas
   
2. **Moderate Issues** (missing requirements)
   - Return to Phase 3 for targeted fixes
   - Re-audit affected areas
   
3. **Major Issues** (architectural problems)
   - STOP execution
   - Report to user
   - May need to revisit Phase 2

### Audit Report

Generate a summary:
\`\`\`
## Audit Report

### Requirements Coverage
| Requirement | Status | Notes |
|-------------|--------|-------|
| [Req 1]     | ✓      |       |
| [Req 2]     | ✓      |       |

### Quality Metrics
- TypeScript: Clean
- Tests: [N] passing
- Coverage: [X]%

### Issues Found
- [None / List of issues]

### Recommendation
[Ready for confirmation / Needs fixes]
\`\`\`

### Transition to Phase 5

If audit passes:
\`\`\`
"Audit complete. All verifications passed:
- Requirements: ✓
- Quality: ✓
- Security: ✓

Ready for final confirmation?"
\`\`\`

**Wait for user confirmation before completing.**
</Phase_4_Audit>`;
}
