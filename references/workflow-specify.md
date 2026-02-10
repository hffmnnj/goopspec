# Workflow: Specify Phase

**GoopSpec Voice:** Contractual, Precise, Binding.

The Specify phase answers: **What exactly will we deliver?** This is the **CONTRACT**.

## Position in Workflow

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│    PLAN     │ ──▶ │  RESEARCH   │ ──▶ │   SPECIFY   │
│  (Intent)   │     │  (Explore)  │     │ (Contract)  │
└─────────────┘     └─────────────┘     └─────────────┘
                                              ↑
                                        (You are here)

       ╔══════════════════════════════════════════════╗
       ║          CONTRACT GATE                       ║
       ║   User MUST confirm before execution begins  ║
       ╚══════════════════════════════════════════════╝
```

## The Contract Philosophy

*   **No Surprises:** Everything implemented must be in the spec.
*   **Must vs. Nice:** Ruthless prioritization.
*   **Explicit Scope:** "Out of Scope" is as important as "Must Have".

## Activities

### 1. Synthesize & Draft
Combine Intent (Plan) + Approach (Research) into `SPEC.md`.

*   **Must Haves:** Non-negotiable deliverables.
*   **Nice to Haves:** Best effort, time permitting.
*   **Out of Scope:** Explicitly excluded to prevent creep.

### 2. The Blueprinting
Create `BLUEPRINT.md` - the execution plan.
*   Break down into **Waves**.
*   Define **Atomic Tasks**.

## The Contract Gate

This is the most critical interaction in the GoopSpec workflow.

```text
╭─ ⬢ GoopSpec ───────────────────────────────────────╮
│                                                    │
│  🔒 CONTRACT GATE                                  │
│                                                    │
│  I'm ready to lock the specification.              │
│                                                    │
│  MUST HAVES (I commit to delivering):              │
│  • User Login (Email/Pass)                         │
│  • "Forgot Password" Flow                          │
│                                                    │
│  NICE TO HAVES (Best effort):                      │
│  • Social Login (Google)                           │
│                                                    │
│  OUT OF SCOPE:                                     │
│  • Admin Dashboard                                 │
│                                                    │
│  ─────────────────────────────────────────────     │
│  ► Type "confirm" to Lock Spec and Execute.        │
│  ► Type "amend" to request changes.                │
│                                                    │
╰────────────────────────────────────────────────────╯
```

## Amendments

If the user rejects the contract or needs changes later:

1.  **Command:** `/goop-amend "Add Social Login to Must Haves"`
2.  **Action:** Agent updates `SPEC.md` and `BLUEPRINT.md`.
3.  **Gate:** Re-present the Contract Gate.

**Note:** Amending a locked spec during execution triggers a "Scope Change" warning.

## Output: SPEC.md & BLUEPRINT.md

### SPEC.md
The "What".
```markdown
# Specification: Auth Feature
**Status:** LOCKED

## Must Haves
- [ ] Login Form
- [ ] API Integration
```

### BLUEPRINT.md
The "How".
```markdown
# Blueprint
## Wave 1: Foundation
- [ ] Task 1.1: Setup Auth0 Provider
```

## Commands

| Command | Effect |
| :--- | :--- |
| `/goop-plan` | Finalize spec and trigger Contract Gate internally. |
| `/goop-amend` | Modify a draft or locked spec. |
| `/goop-status` | View current spec status. |

## Memory Triggers

*   **Save:** The Locked Contract (High Importance).
*   **Decision:** Scope exclusions (Why did we exclude X?).

```javascript
memory_decision({
  decision: "Excluded Admin Dashboard",
  reasoning: "User wants to focus on consumer-facing features first.",
  impact: "high"
})
```
