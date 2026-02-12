# Planning Process

Detailed process for `/goop-plan` - creating SPEC.md and BLUEPRINT.md from discovery.

## Phase 1: Gate Check

**Execute BEFORE anything else:**

```
goop_status()
goop_state({ action: "get" })          # NEVER read state.json directly
Read(".goopspec/REQUIREMENTS.md")
```

### 1.1 Check interviewComplete

```
IF state.interviewComplete != true:
  REFUSE with:
  
  ## 🔮 GoopSpec · Gate Blocked
  
  ✗ Discovery interview required before planning.
  
  → Run: `/goop-discuss`
  
  ---
  
  EXIT command.
```

### 1.2 Check REQUIREMENTS.md exists

```
IF .goopspec/REQUIREMENTS.md does not exist:
  REFUSE with:
  
  ## 🔮 GoopSpec · Gate Blocked
  
  ✗ No discovery output found.
  
  → Run: `/goop-discuss`
  
  ---
  
  EXIT command.
```

### 1.3 Gate passed

```
## 🔮 GoopSpec · Planning

✓ Discovery gate passed

⏳ Creating specification and blueprint...

---
```

---

## Phase 2: Load Context

**Note:** Existing document archiving is handled in `/goop-discuss` Phase 1.2. 
By this point, any prior milestone has already been archived or the user chose to continue it.

### 2.1 Load discovery interview

```
Read(".goopspec/REQUIREMENTS.md")
```

Extract:
- Vision
- Must-haves (with acceptance criteria)
- Constraints
- Out of scope
- Assumptions
- Risks

### 2.2 Search memory

```
memory_search({ query: "[feature] architecture decisions patterns", limit: 5 })
```

### 2.3 Create or load project knowledge

```
Read(".goopspec/PROJECT_KNOWLEDGE_BASE.md")
```

**If PROJECT_KNOWLEDGE_BASE.md does not exist, CREATE IT:**

```markdown
# Project Knowledge Base

**Last Updated:** [timestamp]
**Updated By:** orchestrator (auto-generated from discovery)

---

## Project Identity

**Name:** [From REQUIREMENTS.md vision]
**Type:** [Inferred from constraints]
**Stage:** Active

---

## Stack (Non-Negotiable)

[Extract from REQUIREMENTS.md Constraints section]

### Runtime & Language
- **Runtime:** [e.g., Node.js / Bun / Browser]
- **Language:** [e.g., TypeScript]

### Frameworks & Libraries
- **Framework:** [From constraints]
- **Testing:** [From constraints or infer from package.json]

---

## Conventions

[Extract from REQUIREMENTS.md or infer from codebase]

### File Naming
- **Files:** [kebab-case / camelCase]
- **Tests:** [*.test.ts / *.spec.ts]

### Code Style
- **Exports:** [Named / Default]

---

## Architecture Decisions

*To be populated during planning and execution.*

---

## Known Gotchas

*To be populated as issues are discovered.*

---

*Auto-generated from discovery interview. Update as project evolves.*
```

Write to `.goopspec/PROJECT_KNOWLEDGE_BASE.md` before proceeding.

---

## Phase 3: Spawn Planner

**Display banner:**
```
## 🔮 GoopSpec · Creating Documents

⏳ Spawning planner to create SPEC.md and BLUEPRINT.md...

---
```

**Spawn goop-planner with full context:**

```
task({
  subagent_type: "goop-planner",
  description: "Create SPEC and BLUEPRINT",
  prompt: `
## TASK
Create specification and blueprint from discovery interview.

## PROJECT CONTEXT
[From PROJECT_KNOWLEDGE_BASE.md if exists]
- Stack: [technologies]
- Conventions: [naming, patterns]

## DEPTH SETTING
- Read `state.workflow.depth` from `goop_state({ action: "get" })`
- Include `depth` in planner context (default: `standard` when missing)
- depth: [state.workflow.depth]

## DEPTH-AWARE PLANNING BEHAVIOR
- **shallow:** Generate a lean blueprint with fewer waves and minimal wave decomposition. Skip per-wave questioning. Use single-agent research only when unknowns block planning.
- **standard:** Generate a full blueprint with clear wave decomposition. Generate per-wave questioning (3-4 questions per wave). Use balanced research dispatch (1-2 agents) for unresolved unknowns.
- **deep:** Generate a thorough blueprint with comprehensive wave decomposition. Generate per-wave questioning (5-6 questions per wave). Dispatch parallel research agents (`goop-researcher` + `goop-explorer`) for each wave's domain and include a per-wave risk assessment.

## DISCOVERY INTERVIEW OUTPUT
[Full content of REQUIREMENTS.md]

## INSTRUCTIONS

1. **Verify discovery completeness:**
   - Vision defined? 
   - Must-haves listed with acceptance criteria?
   - Out of scope defined?
   - Risks identified?
   
   If missing critical info, return BLOCKED.

2. **Apply depth-aware planning strategy:**
   - Use the provided `depth` to calibrate blueprint detail, research thoroughness, and questioning behavior.
   - Keep `depth` visible in planning context so downstream tasks and summaries can explain why detail level changed.
   - If `depth` is missing, default to `standard`.

3. **Create .goopspec/SPEC.md:**
   - Transform must-haves into formal requirements (MH1, MH2, etc.)
   - Include acceptance criteria for each
   - Add traceability section (will be filled after blueprint)
   - Mark status as "Draft"

4. **Create .goopspec/BLUEPRINT.md:**
   - Design wave architecture
   - Create tasks that cover ALL must-haves
   - Add spec coverage to each task
   - Build traceability matrix
   - Encode depth-aligned decomposition level per wave
   - Include depth-aligned questioning expectations per wave
   - In deep mode, include explicit parallel research dispatch instructions (`goop-researcher` + `goop-explorer`) per wave domain

5. **Update .goopspec/SPEC.md:**
   - Fill traceability matrix (must-have → tasks)
   - Verify 100% coverage

6. **Initialize .goopspec/CHRONICLE.md:**
   - Phase: plan → ready for specify
   - Documents created with timestamps

7. **Save to memory:**
   - Key architectural decisions
   - Technology choices with rationale

8. **Return XML response envelope** with:
   - BLUEPRINT COMPLETE status
   - Wave summary
   - Traceability summary
   - Handoff instructions

## VERIFICATION
Before returning COMPLETE:
- [ ] Every must-have has mapped tasks
- [ ] Every task has spec coverage
- [ ] Traceability matrix shows 100%
- [ ] SPEC.md has all sections filled
- [ ] BLUEPRINT.md has verification commands
  `
})
```

---

## Phase 3.5: Per-Wave Questioning

Run this protocol after each wave draft is available and before finalizing the blueprint.

### Purpose

Generate contextual questions for each drafted wave to validate assumptions, surface unknowns, and identify where research is required before the plan is locked.

### When

- After the planner drafts a wave (scope, files, tasks, dependencies)
- Before accepting that wave as final
- Repeat for every wave in the blueprint

### How Many Questions (Depth-Scaled)

| Workflow depth | Questions per wave |
|----------------|--------------------|
| shallow | 1-2 |
| standard | 3-4 |
| deep | 5-6 |

Use `goop_state({ action: "get" })` and read `state.workflow.depth` to select the count.

### Question Generation Rules

Each question must be anchored to the current wave's actual implementation scope.

- Reference specific files, modules, technologies, integrations, or patterns named in the wave
- Target unknowns, assumption checks, risk boundaries, migration concerns, and edge cases
- Require decision-making signal that changes implementation details, sequencing, or validation
- Avoid generic template prompts (for example: "Do you want tests?")
- Prefer option-based prompts with concrete tradeoffs the user can quickly choose

### Question Format (Use `question` tool)

Use structured prompts with contextual options tied to the current wave:

```ts
question({
  questions: [{
    header: "Wave 2: Auth Migration",
    question: "Wave 2 updates src/auth/middleware.ts for token parsing. Should we preserve compatibility with existing JWT claims during rollout?",
    options: [
      { label: "Preserve", description: "Support old and new claims during migration" },
      { label: "Cutover", description: "Switch to new claims immediately" },
      { label: "Unsure", description: "Need impact analysis before choosing" }
    ],
    multiple: false
  }]
})
```

### Research Dispatch After Answers

If answers expose unknowns, conflicts, or unresolved implementation risk, dispatch research before finalizing that wave.

Dispatch rules:
- If uncertainty is domain/technology focused, delegate `goop-researcher`
- If uncertainty is codebase integration/location focused, delegate `goop-explorer`
- If both are unknown and independent, dispatch both in parallel

Required handoff context to research agents:
- Wave number and objective
- Exact files/modules/patterns in scope
- User answer that introduced the unknown
- Expected output needed to unblock planning decisions

Only finalize the wave after research findings are incorporated or the user explicitly accepts the remaining risk.

### Example Contextual Questions (Typical Wave)

- "Wave 2 modifies `src/auth/middleware.ts`. Should we preserve backward compatibility with existing JWT tokens, or is a migration acceptable?"
- "This wave adds a new database table in `src/features/setup/`. Do you have a preferred naming convention for indexes and unique constraints?"
- "The blueprint introduces React Server Components for `src/ui/dashboard/`. Is your deployment target compatible with RSC streaming?"
- "Wave 3 updates `src/hooks/orchestrator-enforcement.ts`. Should intent detection remain log-only, or should we emit structured telemetry events for auditing?"

---

## Phase 3.7: Post-Wave Review Gate

Run this gate after all waves are drafted and after per-wave questioning outputs have been incorporated.

### Overview

After the planner generates all waves, present each wave to the user for review before finalizing the blueprint.

### Approve-All Shortcut (Before Per-Wave Iteration)

Offer a top-level choice first:

```ts
question({
  questions: [{
    header: "Plan Review",
    question: "The blueprint has [N] waves. Would you like to review each wave individually or approve the entire plan?",
    options: [
      { label: "Review Each Wave", description: "Examine and approve waves one by one" },
      { label: "Approve All (Recommended)", description: "Skip per-wave review, approve the entire plan" }
    ],
    multiple: false
  }]
})
```

If user selects `Approve All (Recommended)`, skip per-wave review and continue to Phase 4.

### Per-Wave Review Protocol

If user selects `Review Each Wave`, iterate every wave in order:

```text
For each wave in the blueprint:

Display wave summary:
## Wave [N]: [Name]
**Tasks:** [count]
**Files:** [key files]
**Must-Haves Covered:** [list]

Then use question tool:
- header: "Wave [N] Review"
- question: "Review Wave [N]: [Name]. How would you like to proceed?"
- options:
  - "Approve Wave" — Wave looks good, proceed
  - "Request More Research" — Need deeper investigation on this wave's scope
  - "Clarify Scope" — Want to adjust or clarify what this wave covers
```

Recommended `question` payload:

```ts
question({
  questions: [{
    header: "Wave [N] Review",
    question: "Review Wave [N]: [Name]. How would you like to proceed?",
    options: [
      { label: "Approve Wave", description: "Wave looks good, proceed" },
      { label: "Request More Research", description: "Need deeper investigation on this wave's scope" },
      { label: "Clarify Scope", description: "Want to adjust or clarify what this wave covers" }
    ],
    multiple: false
  }]
})
```

### Decision Handling

- `Approve Wave`
  - Mark wave approved
  - Continue to next wave

- `Request More Research`
  - Ask user which specific areas of the wave need investigation
  - Dispatch `goop-researcher` and/or `goop-explorer` for the identified areas
  - Use parallel dispatch when research and codebase-mapping work are independent
  - Incorporate findings back into the wave definition
  - Re-present the updated wave using the same review question until approved

- `Clarify Scope`
  - Ask follow-up clarification using `question` tool (not plain text prompt)
  - Update wave scope/tasks/files/must-have mapping based on user feedback
  - Re-present the updated wave using the same review question until approved

Only finalize the blueprint when every reviewed wave is approved or the user selected `Approve All (Recommended)`.

---

## Phase 4: Handle Response

**Parse XML response from planner.**

**On `COMPLETE` status:**

Read created documents:
```
Read(".goopspec/SPEC.md")
Read(".goopspec/BLUEPRINT.md")
```

Display completion:
```
## 🔮 GoopSpec · Planning Complete

✨ Blueprint created successfully

**Feature:** [Name from SPEC.md]

| Document | Status | Location |
|----------|--------|----------|
| Spec | ✓ Created | .goopspec/SPEC.md |
| Blueprint | ✓ Created | .goopspec/BLUEPRINT.md |
| Chronicle | ✓ Created | .goopspec/CHRONICLE.md |

**[N] must-haves** | **[M] waves** | **[P] tasks**

### Traceability
| Must-Have | Covered By |
|-----------|------------|
| MH1 | Wave X, Tasks Y |
| MH2 | Wave X, Tasks Y |

✓ Coverage: 100%

### Next Step

**Proceed to Contract Gate**

→ Present contract summary and ask: Confirm / Amend / Cancel

---

Continue to **Phase 5: Contract Gate** in the same session when possible.
```

**Generate HANDOFF.md:**

```markdown
# Session Handoff

**Generated:** [timestamp]
**Phase:** plan

## Accomplished
- [x] Discovery interview completed
- [x] SPEC.md created with [N] must-haves
- [x] BLUEPRINT.md created with [M] waves, [P] tasks
- [x] 100% traceability achieved

## Current State
- Phase: execute-ready
- Interview: complete
- Spec: locked

## Next Session
Run: /goop-execute

## Files to Read
1. .goopspec/SPEC.md — Requirements
2. .goopspec/BLUEPRINT.md — Execution plan

## Context Summary
Planning complete for [feature]. [N] must-haves mapped to [P] tasks
across [M] waves. Contract confirmed and spec locked.
```

**On `BLOCKED` status:**

Display blocker context, then use `question` tool:

```
## 🔮 GoopSpec · Planning Blocked

✗ Cannot proceed

**Blocker:** [From planner response]
```

```ts
question({
  questions: [{
    header: "Planning Blocked",
    question: "How would you like to resolve this blocker?",
    options: [
      { label: "Provide more context", description: "Return to discovery via /goop-discuss" },
      { label: "Research the unknown", description: "Investigate via /goop-research" }
    ],
    multiple: false
  }]
})
```

---

## Phase 5: Contract Gate

Run this gate immediately after Phase 4 completes and both `.goopspec/SPEC.md` and `.goopspec/BLUEPRINT.md` are available.

### 5.1 Present Contract Summary

Show a concise summary pulled from the generated planning documents:

- Must-haves (`MH1..MHn`)
- Out-of-scope items
- Wave summary (`[M] waves`, `[P] tasks`)
- Traceability matrix (`must-have -> wave/task coverage`)

Display format:

```text
## 🔒 Contract Gate

Please review the contract before execution.

### Must-Haves
- MH1: ...
- MH2: ...

### Out of Scope
- ...

### Wave Summary
- Waves: [M]
- Tasks: [P]

### Traceability
| Must-Have | Covered By |
|-----------|------------|
| MH1 | Wave X, Task Y |
| MH2 | Wave X, Task Z |

✓ Coverage: 100%
```

### 5.2 Ask for Decision

Use `question` tool with exactly three options:

```ts
question({
  questions: [{
    header: "Contract Gate",
    question: "How would you like to proceed with this contract?",
    options: [
      { label: "Confirm and Lock", description: "Accept contract and lock spec" },
      { label: "Amend", description: "Revise contract before locking" },
      { label: "Cancel", description: "Stop now and keep spec unlocked" }
    ],
    multiple: false
  }]
})
```

### 5.3 On Confirm

Lock the spec with state tool:

```ts
goop_state({ action: "lock-spec" })
```

Then display confirmation:

```text
## 🔮 GoopSpec · Contract Confirmed

✓ Spec locked
✓ Execution ready

### Next Step
→ `/goop-execute`
```

Generate/update `HANDOFF.md`:

```markdown
# Session Handoff

**Generated:** [timestamp]
**Phase:** plan

## Accomplished
- [x] Discovery interview completed
- [x] SPEC.md created with [N] must-haves
- [x] BLUEPRINT.md created with [M] waves, [P] tasks
- [x] 100% traceability achieved
- [x] Contract confirmed and spec locked

## Current State
- Phase: execute-ready
- Interview: complete
- Spec: locked

## Next Session
Run: /goop-execute

## Files to Read
1. .goopspec/SPEC.md — Locked contract
2. .goopspec/BLUEPRINT.md — Execution plan

## Context Summary
Planning complete for [feature]. Contract confirmed and locked.
Begin execution using the approved wave plan.
```

### 5.4 On Amend

Enter amendment mode (same behavior as current specify-process amend flow):

1. Ask what to change (must-have wording, scope boundary, traceability, wave decomposition).
2. Apply updates to `.goopspec/SPEC.md` and/or `.goopspec/BLUEPRINT.md`.
3. Re-validate traceability coverage.
4. Re-present the full contract summary.
5. Return to decision prompt (Confirm / Amend / Cancel).

Spec remains unlocked until user explicitly confirms and lock succeeds.

### 5.5 On Cancel

- Do not call `lock-spec`
- Keep spec unlocked
- Inform user they can iterate and run `/goop-plan` again

Display:

```text
## 🔮 GoopSpec · Contract Not Locked

Spec remains unlocked.

You can update requirements and run `/goop-plan` again.
```

---

## Phase 6: Memory Persistence

After successful planning:

```
memory_save({
  type: "note",
  title: "Plan: [Feature Name]",
  content: "Created [N]-wave blueprint. Key decisions: [list]. Must-haves: [summary].",
  concepts: ["planning", "blueprint", "[domain]"],
  importance: 0.7
})

memory_save({
  type: "decision",
  title: "Spec Lock Decision: [Feature Name]",
  content: "User selected [confirm|amend|cancel] at Contract Gate. Lock state: [locked|unlocked].",
  facts: [
    "Contract Gate decision: [confirm|amend|cancel]",
    "Spec lock state after planning: [locked|unlocked]"
  ],
  concepts: ["contract-gate", "spec-lock", "planning"],
  importance: 0.8
})
```

---

## Examples

### Gate Passed
```
User: /goop-plan

Orchestrator: 
## 🔮 GoopSpec · Planning

✓ Discovery gate passed

[Spawns goop-planner]

...

## 🔮 GoopSpec · Planning Complete

**Feature:** Dark Mode Toggle

| Document   | Status  |
|------------|---------|
| Spec       | Created |
| Blueprint  | Created |

**3 must-haves** | **2 waves** | **5 tasks**

→ Next: `/goop-execute`
```

### Gate Blocked
```
User: /goop-plan

Orchestrator:
## 🔮 GoopSpec · Gate Blocked

✗ Discovery interview required before planning.

→ Run: `/goop-discuss`
```

---

*Planning Process v0.2.7*
