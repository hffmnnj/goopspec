# GoopSpec Enforcement Patterns

Canonical language patterns for bootstrap blocks and phase gates.
Used to harden workflow enforcement across all agent and command files.

---

## 1. Canonical Bootstrap Block Template (for Agent Prompts)

Use this exact block at the start of every agent definition, immediately after the frontmatter and role statement.

```markdown
## ⚠️ MANDATORY FIRST STEP

**DO NOT proceed past this section until all steps are complete.**

1. `goop_state({ action: "get" })` — Load workflow state
2. `Read(".goopspec/SPEC.md")` — Read specification
3. `Read(".goopspec/BLUEPRINT.md")` — Read execution plan
4. `memory_search({ query: "[task context]", limit: 5 })` — Search relevant memory

Load references: `goop_reference({ name: "executor-core" })`

**Then acknowledge:** current phase, spec lock status, active task.
```

### Usage Notes

- Place this block **before** any mission, scope, or protocol sections
- Replace `[task context]` with domain-specific terms for the agent
- For executor agents, always include `executor-core` reference
- For specialized agents, add relevant skill references after step 4
- The entire block must be 10-15 lines maximum

### Minimal Variant (for Simple Agents)

```markdown
## ⚠️ MANDATORY FIRST STEP

1. `goop_state({ action: "get" })` — Load state
2. `Read(".goopspec/SPEC.md")` and `.goopspec/BLUEPRINT.md`
3. `memory_search({ query: "[context]", limit: 5 })`
4. Load: `goop_reference({ name: "executor-core" })`

**Acknowledge phase, lock status, task — then proceed.**
```

---

## 2. Canonical Stop-and-Return Gate Template (for Command Docs)

Use this pattern at the start of command documentation to enforce phase gates.

```markdown
### STOP-AND-RETURN

**Execute this tool call NOW before reading anything else:**
```
goop_state({ action: "get" })
```

**IF prerequisite != true:**
- Return BLOCKED response immediately
- Include: "Cannot [action]. Run [command] first."
- Do not process further instructions

**Then load:** `goop_reference({ name: "[process-ref]" })`
```

### Usage Notes

- Use `### STOP-AND-RETURN` heading (not `##`)
- Always use `goop_state({ action: "get" })` — never read state.json directly
- State the prerequisite check explicitly (e.g., `interviewComplete: true`)
- Block response must be immediate and unambiguous
- Include the specific next command to run

### Gate Check Variants

| Gate | Prerequisite | Block Message |
|------|--------------|---------------|
| Plan | `interviewComplete: true` | "Cannot plan. Run /goop-discuss first." |
| Execute | `specLocked: true` | "Cannot execute. Run /goop-plan and confirm spec first." |
| Accept | `allWavesComplete: true` | "Cannot accept. Complete all waves via /goop-execute first." |

---

## 3. Imperative Style Guide for Weaker Models

### Core Principles

1. **Short sentences.** One action per sentence.
2. **Numbered steps.** Sequential numbering forces order.
3. **Command verbs.** Use "Load", "Check", "Return", "Stop" — not "You should" or "Please".
4. **Explicit markers.** Use "STOP", "DO NOT", "MUST", "NOW" for critical enforcement points.
5. **No conditionals in flow.** State the happy path; exceptions go in explicit blocks.

### Good vs Bad Examples

**Good:**
```
1. Load state.
2. Check gate.
3. If gate fails, STOP and return BLOCKED.
```

**Bad:**
```
You should probably load the state first if you want to check whether the gate requirements have been satisfied, and if they haven't been met yet, you might want to consider returning a blocked status before proceeding with any other work that could depend on those prerequisites being in place.
```

### Verb Priority

| Priority | Verbs | Use For |
|----------|-------|---------|
| Critical | STOP, DO NOT, MUST, NOW | Gates, blocking conditions |
| Action | Load, Check, Read, Search, Execute | Bootstrap steps |
| Completion | Return, Report, Proceed, Continue | Handoffs, outcomes |

### Marker Strings

These strings must appear exactly as written:

- `## ⚠️ MANDATORY FIRST STEP` — Bootstrap block heading
- `### STOP-AND-RETURN` — Gate block heading
- `STOP-AND-RETURN` — Inline gate reference
- `DO NOT proceed` — Blocking instruction
- `NOW before reading anything else` — Immediate action marker

---

## 4. Implementation Checklist

When applying these patterns:

- [ ] Bootstrap block placed before mission/scope sections
- [ ] Bootstrap uses exact `## ⚠️ MANDATORY FIRST STEP` heading
- [ ] Bootstrap has 4 numbered steps minimum
- [ ] Bootstrap includes "DO NOT proceed" warning
- [ ] Command docs use exact `### STOP-AND-RETURN` heading
- [ ] Gates use `goop_state({ action: "get" })` exclusively
- [ ] Block responses include specific next command
- [ ] Language is imperative, under 15 lines per block
- [ ] References use `goop_reference` tool (not hardcoded paths)

---

*Enforcement Patterns v0.2.7 — for hardening workflow compliance*
