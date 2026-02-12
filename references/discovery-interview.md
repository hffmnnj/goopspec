# Discovery Interview

The Discovery Interview is a mandatory gate before planning. It ensures requirements are "nailed down" before any work begins.

## Core Principle

```
+================================================================+
|  NO PLANNING WITHOUT DISCOVERY.                                 |
|  The interview ensures we build the RIGHT thing.                |
|  Skipping discovery leads to scope creep and rework.            |
+================================================================+
```

## When to Run

- **Required before**: `/goop-plan`
- **Triggered by**: `/goop-discuss`
- **Output**: `.goopspec/REQUIREMENTS.md`
- **State update**: `interview_complete: true` in state.json

## The Six Questions

Every discovery interview MUST answer these questions:

### 1. Vision (The What)
```
What are you trying to build?
- What problem does this solve?
- Who is this for?
- What does success look like?
```

**Good answer**: "A JWT-based authentication system that allows users to securely log in, maintains sessions, and protects API routes. Success = users can sign up, log in, and access protected resources."

**Bad answer**: "Auth stuff"

### 2. Must-Haves (The Contract)
```
What are the non-negotiable requirements?
- What MUST be delivered for this to be complete?
- What are the acceptance criteria?
```

**Good answer**:
- User registration with email/password
- Login returns JWT token
- Protected routes reject invalid tokens
- Tokens expire after 24 hours
- Password reset via email

**Bad answer**: "It should work"

### 3. Constraints (The Boundaries)
```
What are the technical and practical constraints?
- What stack/frameworks are we using?
- What are the performance requirements?
- What's the timeline?
- What existing code must we integrate with?
```

**Good answer**: "Must use existing Express.js backend, PostgreSQL for storage, jose library for JWT (already in package.json), must not break existing session middleware."

**Bad answer**: "None"

### 4. Out of Scope (The Guardrails)
```
What are we explicitly NOT building?
- What features are deferred to later?
- What approaches are we avoiding?
```

**Good answer**:
- OAuth/social login (future phase)
- Multi-factor authentication (future phase)
- Rate limiting (handled by API gateway)
- User profile management (separate feature)

**Bad answer**: "Everything else I guess"

### 5. Assumptions (The Baseline)
```
What are we assuming to be true?
- What existing functionality are we relying on?
- What decisions have already been made?
```

**Good answer**:
- Database is already set up with users table
- Email service is available via existing utility
- Frontend will handle token storage (not our concern)
- HTTPS is handled at infrastructure level

**Bad answer**: "Standard stuff"

### 6. Risks (The Unknowns)
```
What could go wrong?
- What are we uncertain about?
- What might change?
- What dependencies could block us?
```

**Good answer**:
- Risk: Password hashing library may have breaking changes
  - Mitigation: Pin exact version, test migration path
- Risk: Token refresh logic may conflict with existing session
  - Mitigation: Research existing session code first
- Risk: Email service rate limits may affect password reset
  - Mitigation: Add retry logic with backoff

**Bad answer**: "None, it'll be fine"

## Interview Flow

### Step 1: Open-Ended Discovery
Ask broad questions to understand intent:
- "What are you trying to accomplish?"
- "Why is this needed now?"
- "Who will use this?"

### Step 2: Structured Questions
Work through the six questions, prompting for specifics:
- "What happens if [edge case]?"
- "How should [error scenario] be handled?"
- "What's the expected behavior when [boundary condition]?"

### Step 3: Summarize and Confirm
Present back:
- Vision statement
- Must-haves list
- Constraints list
- Out of scope list
- Assumptions list
- Risks with mitigations

### Step 4: Lock Discovery
- Generate REQUIREMENTS.md
- Update state.json with `interview_complete: true`
- Inform user: "Discovery complete. Run `/goop-plan` to create blueprint."

## REQUIREMENTS.md Template

```markdown
# REQUIREMENTS: [Feature Name]

**Generated:** [date]
**Status:** Locked

---

## Vision

[Vision statement - what and why]

---

## Must-Haves

These are non-negotiable. The feature is incomplete without ALL of these:

- [ ] [Requirement 1]
- [ ] [Requirement 2]
- [ ] [Requirement 3]

---

## Constraints

### Technical
- [Constraint 1]
- [Constraint 2]

### Practical
- [Timeline, budget, resources]

---

## Out of Scope

Explicitly excluded from this work:

- [Item 1] - [reason/future phase]
- [Item 2] - [reason/future phase]

---

## Assumptions

We are assuming:

- [Assumption 1]
- [Assumption 2]

---

## Risks & Mitigations

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| [Risk 1] | [H/M/L] | [H/M/L] | [Plan] |
| [Risk 2] | [H/M/L] | [H/M/L] | [Plan] |

---

*Discovery interview completed. Ready for /goop-plan.*
```

## Enforcement

### Pre-Plan Gate
When `/goop-plan` is invoked:

```
1. Check state.json for interview_complete
2. If false or missing:
   - REFUSE to proceed
   - Display: "Discovery interview required. Run /goop-discuss first."
3. If true:
   - Load REQUIREMENTS.md
   - Proceed with planning
```

### Validation Rules
Interview is NOT complete if:
- Vision is vague (< 2 sentences)
- Must-haves is empty
- Out of scope is empty (everything has scope limits)
- No risks identified (there are always risks)

### Skip Conditions
Discovery MAY be skipped only for:
- `/goop-quick` small tasks (single file, < 30 min work)
- Bug fixes with clear reproduction steps
- Documentation-only changes

## Anti-Patterns

### Bad: Rushing Through
```
Q: What are you building?
A: "Just some auth stuff"
                           <- NOT ENOUGH
```

### Bad: No Scope Limits
```
Q: What's out of scope?
A: "Nothing, we'll figure it out"
                           <- SCOPE CREEP INCOMING
```

### Bad: No Risks
```
Q: What could go wrong?
A: "Nothing, it's straightforward"
                           <- FAMOUS LAST WORDS
```

### Good: Specific and Bounded
```
Q: What are you building?
A: "JWT auth with login/logout, 24h token expiry, refresh tokens, 
    protected route middleware. Uses existing users table."

Q: What's out of scope?
A: "OAuth (phase 2), MFA (phase 3), rate limiting (infra handles it)"

Q: Risks?
A: "Token refresh may conflict with existing session - need to check 
    session.ts first. Also email service has rate limits."
```

---

*Discovery Interview Protocol v0.2.7*
*"Nail the spec before you write the code."*
