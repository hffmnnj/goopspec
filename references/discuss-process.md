# Discovery Interview Process

Detailed process for conducting the `/goop-discuss` discovery interview.

## Phase 1: Setup

**Execute these checks BEFORE any user interaction:**

### 1.1 Check current state

```
goop_status()
goop_state({ action: "get" })        # NEVER read state.json directly
```

**CRITICAL: Never read or edit .goopspec/state.json directly. Always use `goop_state` tool.**

### 1.2 Git branch check (Session Start)

Check current branch:

```bash
git branch --show-current
git status
```

Use `question` tool:
- header: "Git Branch"
- question: "You're on branch `[current-branch]`. Would you like to create a new branch for this work?"
- options:
  - "Yes, create a branch" — A new branch will be created after you describe your vision
  - "No, stay on current branch" — Continue on [current-branch]

**On "Yes, create a branch":**
Record the intent. Do NOT ask for a branch name. Do NOT run `git checkout` yet.
Branch creation is deferred until after the vision question — see section 2.1.1.

**On "No, stay on current branch":**
Continue the flow normally.

### 1.3 Gitignore preference for `.goopspec/`

Check workflow state before prompting:

```
goop_state({ action: "get" })
```

Inspect `workflow.gitignoreGoopspec`:
- If `true` or `false`: preference already captured, skip this prompt entirely.
- If `undefined`/`null`: proceed to the file check below.

**Smart detection — check `.gitignore` before asking:**

Run the following bash check:

```bash
if [ -f .gitignore ] && grep -qE '^\.goopspec/?$' .gitignore; then
  echo "found"
else
  echo "not_found"
fi
```

- If **`found`**: `.goopspec/` is already in `.gitignore`. Skip the question entirely. Silently persist the preference:
  ```
  goop_state({ action: "set-gitignore", gitignoreGoopspec: true })
  ```
  Then continue to section 1.4 — do not show the question below.

- If **`not_found`** (`.gitignore` doesn't exist, or exists but doesn't contain `.goopspec/`): Ask the question as normal (existing behavior below).

Use `question` tool:
- header: "Gitignore Preference"
- question: "Do you want GoopSpec to add `.goopspec/` to this project's `.gitignore`?"
- options:
  - "Yes, ignore `.goopspec/` (Recommended)" — Keep planning artifacts out of git by default
  - "No, keep `.goopspec/` tracked" — Leave `.gitignore` unchanged

**On "Yes":**
- Ensure project `.gitignore` exists (create if needed)
- Add `.goopspec/` only if it is not already present (no duplicates)
- Persist preference in state using `goop_state` (`workflow.gitignoreGoopspec = true`)

**On "No":**
- Do not modify `.gitignore`
- Persist preference in state using `goop_state` (`workflow.gitignoreGoopspec = false`)

**Reconfiguration:**
- This preference can be changed later with `/goop-setup`.

### 1.4 Check for existing project documents

Resolve the active `workflowId` from `goop_state({ action: "get" })` first, then check:

```
Read(".goopspec/<workflowId>/SPEC.md")
Read(".goopspec/<workflowId>/BLUEPRINT.md")
```

**If SPEC.md or BLUEPRINT.md exist**, the user may have completed work that needs archiving.

Use `question` tool:
- header: "Existing Project"
- question: "I found existing project documents. How would you like to proceed?"
- options:
  - "Archive and start fresh (Recommended)" — Move current docs to archive, create new
  - "Continue existing project" — Resume work (exit, run /goop-status)
  - "Overwrite without archiving" — Replace documents (loses history)

**On "Archive":** 
```
task({
  subagent_type: "goop-writer",
  description: "Archive milestone",
  prompt: "Archive the current milestone. Move SPEC.md, BLUEPRINT.md, CHRONICLE.md from .goopspec/<workflowId>/ to .goopspec/archive/<workflowId>-<timestamp>/"
})
```
Then continue with discovery.

**On "Continue":** Exit and suggest `/goop-status`.
**On "Overwrite":** Warn about losing history, then continue.

### 1.5 Check for existing REQUIREMENTS.md

```
Read(".goopspec/<workflowId>/REQUIREMENTS.md")    # If exists, interview was done
```

### 1.6 If REQUIREMENTS.md exists

Use `question` tool:
- header: "Existing Discovery"
- question: "I found an existing discovery interview. How would you like to proceed?"
- options:
  - "Start fresh (Recommended)" — Clear previous discovery, start new interview
  - "Review and update" — Load previous answers, modify as needed
  - "Use existing" — Skip interview, go straight to /goop-plan

### 1.7 Initialize if needed

```bash
mkdir -p .goopspec
```

### 1.8 Search memory for context

```
memory_search({ query: "project preferences architecture [user's topic]", limit: 5 })
```

Store relevant findings - use them to skip questions you already know answers to.

### 1.9 Research Depth Selection

Before starting the six-question interview, ask the user which research depth they want.

Use `question` tool:
- header: "Research Depth"
- question: "How thorough should planning and research be for this work?"
- options:
  - "Light" — Fastest path with minimal agents and focused coverage (~1x baseline token/cost)
  - "Standard (Recommended)" — Balanced depth with moderate exploration (~2x baseline token/cost)
  - "Deep" — Most thorough with multiple parallel agents and expanded analysis (~3-5x baseline token/cost)

Map the selected label to workflow depth:
- Light -> `shallow`
- Standard -> `standard`
- Deep -> `deep`

Persist selection in workflow state:
```
goop_state({ action: "set-depth", depth: "[shallow|standard|deep]" })
```

Confirm selection to the user before moving on:
```
Research depth selected: [Light|Standard|Deep] ([shallow|standard|deep], [~1x|~2x|~3-5x] baseline)
```

### 1.10 Autopilot Opt-In

After depth selection, offer the user autopilot mode.

Use `question` tool:
- header: "Autopilot Mode"
- question: "How much should I drive? Running at **[Light|Standard|Deep]** depth (~[1x|2x|3-5x] baseline cost)."
- options:
  - "Manual mode — confirm between phases (default) (Recommended)" — Review and approve at each phase transition.
  - "Autopilot — run pipeline unattended" — Discuss, plan, and execute chain runs automatically. Pauses only at final acceptance.
  - "Lazy Autopilot — infer everything, zero questions" — No clarifying questions. Agent reads your initial prompt and infers all decisions. Full pipeline runs unattended. Pauses only at final acceptance.

**On "Manual mode":**
```
goop_state({ action: "set-autopilot", autopilot: false })
```
Confirm to the user: "✓ Manual mode. You'll confirm at each phase transition."

**On "Autopilot":**
```
goop_state({ action: "set-autopilot", autopilot: true })
```
Confirm to the user: "✓ Autopilot enabled. The full pipeline will run unattended at [depth] depth. You'll only be asked to review at final acceptance."

**On "Lazy Autopilot":**
```
goop_state({ action: "set-autopilot", autopilot: true, lazy: true })
```
Confirm to the user: "✓ Lazy Autopilot enabled. I'll infer everything from your prompt — no questions asked. Full pipeline runs unattended. Pauses only at final acceptance."

### 1.11 Lazy Autopilot Interview Behavior

When `workflow.lazyAutopilot === true`, skip the entire six-question discovery interview. Instead:

1. **Read the initial prompt** — extract all context from what the user has provided.
2. **Infer all six discovery categories** directly from the prompt:
   - **Vision:** what the user wants to build and why
   - **Must-haves:** derive from stated goals, tasks, and implied requirements
   - **Constraints:** infer from tech context, existing codebase, and stack references
   - **Out of scope:** note obvious exclusions or deferred work mentioned
   - **Assumptions:** what must be true for this work to succeed
   - **Risks:** obvious risks given the stated scope
3. **Do NOT use the `question` tool** at any point during the interview.
4. **Skip** the creative agent opt-in (section 2.1).
5. **Branch creation:** Infer a `feat/kebab-case` name from the prompt topic. Create it silently with `git checkout -b` — no confirmation question.
6. **Generate REQUIREMENTS.md directly** from the inferred answers using the same template as the standard interview.
7. **Proceed to `/goop-plan` immediately** — no confirmation gate between phases.

The compaction hook automatically injects the LAZY AUTOPILOT ACTIVE directive when this state flag is set, ensuring all subagents also avoid asking questions or pausing.

---

### Depth Tier Behavior Reference

Use this table as the authoritative behavior contract across discuss, plan, and research phases.

| Tier | Discuss | Plan | Research | Agents | Token Impact |
|------|---------|------|----------|--------|--------------|
| **Shallow (Light)** | Minimal clarification; accept requirements largely as-given and only resolve blockers. | Lean blueprint with fewer waves and minimal research gates. | Quick lookup from a single source; no deep exploration. | 1 agent at a time (sequential only). | ~1x baseline |
| **Standard** | Balanced clarification; probe ambiguities and confirm key assumptions. | Full blueprint with wave decomposition and 3-4 contextual questions per wave. | Targeted exploration across 2-3 sources to resolve known unknowns. | 1-2 agents concurrently when tasks are independent. | ~2x baseline |
| **Deep** | Thorough discovery; challenge assumptions and explicitly explore edge cases and failure modes. | Detailed blueprint with comprehensive research and 5-6 contextual questions per wave. | Thorough multi-source investigation with parallel sub-research and deeper synthesis. | Multiple parallel agents (researcher + explorer + librarian). | ~3-5x baseline |

---

## Structured Question Policy (Discuss Phase)

All short-answer interactions during discovery MUST use the `question` tool. Output explanatory context as regular messages first, then ask a concise question with 2-5 options.

**Option limit:** Never exceed 10 options in a single `question` call (applies to both single-select and multi-select). If a domain requires more than 10 options, split into sequential calls with batch context in the header (e.g., "(1 of 2)"). See `references/interactive-questioning.md` § 7 for the full chunking pattern.

**When to use structured prompts:**
- Setup choices (branch, gitignore, existing docs)
- Discovery completion confirmation
- Any prompt expecting a short selection or yes/no answer

**When to use freeform text:**
- Open-ended discovery questions requiring multi-sentence detail (e.g., "What is your vision?")
- Follow-up probing where the user needs to elaborate freely

**Examples:**

Yes/No confirmation:
```ts
question({
  header: "Discovery Check",
  question: "Does this capture your requirements?",
  options: [
    { label: "Approve and proceed (Recommended)", description: "Generate REQUIREMENTS.md" },
    { label: "Add more requirements", description: "Continue discussion" }
  ]
})
```

Multiple choice with custom entry:
```ts
question({
  header: "Research Depth",
  question: "How thorough should planning and research be?",
  options: [
    { label: "Light", description: "Fastest path (~1x baseline)" },
    { label: "Standard (Recommended)", description: "Balanced depth (~2x baseline)" },
    { label: "Deep", description: "Most thorough (~3-5x baseline)" }
  ]
})
```

---

### 1.12 Pre-Discovery: Worktree Detection

Before starting the interview, detect if we're in a git worktree:

1. Call `detectWorktree(ctx)` from `src/features/worktree/detector.ts`
   - **Primary signal:** `ctx.input.worktree` is non-empty → we ARE in a worktree
   - **Fallback:** compare `git rev-parse --git-dir` vs `--git-common-dir`
2. If detected (`isWorktree: true`):
   - Pre-populate `workflowId` from `inferredWorkflowId` (derived from branch name)
   - Present to user using `question` tool:
     ```ts
     question({
       header: "Worktree Detected",
       question: "You're in worktree branch `<branchName>`. Suggested workflow ID: `<inferredWorkflowId>`. Use this ID?",
       options: [
         { label: "Yes, use `<inferredWorkflowId>` (Recommended)", description: "Workflow scoped to this worktree branch" },
         { label: "Use a different workflow ID", description: "Enter a custom workflow ID" }
       ]
     })
     ```
   - On approval: set `workflowId` to the inferred value
   - On custom: accept user input as `workflowId`
3. If not detected: proceed normally without workflow ID pre-population

---

## Phase 2: Discovery Interview

**Display stage banner:**
```
## 🔮 GoopSpec · Discovery Interview

Let's nail down the requirements before planning.
I'll ask six key questions to understand your needs.

---
```

### 2.1 Open the conversation

If `$ARGUMENTS` provided:
> "You want to **[argument]**. Let me understand this better."

Otherwise:
> "What do you want to build?"

### 2.1.1 Workflow ID Creation (REQUIRED — always run this)

**This step is mandatory regardless of whether a branch was requested or a worktree was detected.** Every discuss session must be bound to an isolated workflowId before any files are written.

**Step 1 — Infer workflowId from the user's vision:**

If worktree detection (section 1.12) already produced an `inferredWorkflowId`, use it. Otherwise infer from the vision text:
- Extract the topic or goal the user described
- Normalise to a short kebab-case slug: 3–6 words max
- Strip common prefixes if they came from a branch name: `feat/`, `fix/`, `feature/`, `bugfix/`, `chore/`
- Examples: `dark-mode-toggle`, `payment-system-rebuild`, `auth-jwt-refresh`, `user-profile-page`
- Default if nothing can be inferred: `default`

**Step 2 — Create and bind the workflow:**

```
goop_state({ action: "create-workflow", workflowId: "<inferredId>" })
goop_state({ action: "set-active-workflow", workflowId: "<inferredId>" })
```

These two calls are **non-negotiable**. They must happen before writing ANY workflow document (REQUIREMENTS.md, SPEC.md, BLUEPRINT.md, etc.). Until these calls are made, all file writes will fall into the `default` workflow slot and collide with other sessions.

**In Lazy Autopilot mode:** Infer the workflowId silently from the user's initial prompt and execute both calls without any confirmation question.

**In standard/autopilot mode** — confirm with the user using the `question` tool:

```ts
question({
  header: "Workflow ID",
  question: "I'll scope this work to workflow `<inferredId>`. All documents will be saved under `.goopspec/<inferredId>/`.",
  options: [
    { label: "Use `<inferredId>` (Recommended)", description: "Isolates this session from other concurrent work" },
    { label: "Use a different name", description: "Enter a custom workflow ID (kebab-case)" }
  ]
})
```

On approval (or in Lazy Autopilot): execute both `create-workflow` and `set-active-workflow` calls.
On custom: accept user input, validate it is kebab-case, then execute both calls with the custom value.

**Verification — after both calls, confirm the binding:**

```
goop_state({ action: "get" })
```

The returned state should show `workflowId: "<inferredId>"` as the active workflow. All subsequent file writes in this session target `.goopspec/<inferredId>/`.

---

### 2.1.2 Branch Name Inference (if branch creation requested)

**Only execute this section if the user selected "Yes, create a branch" in section 1.2.**

After the user has described their vision (section 2.1) and the workflowId has been created and bound (section 2.1.1), infer a branch name from what they described:

1. **Infer a branch name** from the vision content:
   - Construct a short `type/kebab-case` slug from the topic or goal
   - Default type prefix: `feat/` unless the work is clearly a fix, refactor, or chore
   - Keep slugs short: 3–5 words max, kebab-case
   - Examples: `feat/lazy-autopilot-wiring`, `fix/branch-name-timing`, `refactor/discuss-flow`

2. **Confirm with the user** using the `question` tool:

```ts
question({
  header: "Branch Name",
  question: "Based on what you're building, I'd suggest: `feat/[inferred-slug]`. Create this branch?",
  options: [
    { label: "Yes, create `feat/[inferred-slug]` (Recommended)", description: "Approve the inferred name" },
    { label: "Use a different name", description: "Type a custom branch name" }
  ]
})
```

3. **On approval:** Run `git checkout -b feat/[inferred-slug]`
4. **On "Use a different name":** Accept the user's input, then run `git checkout -b [custom-name]`

**In Lazy Autopilot mode:** Skip the confirmation question entirely — infer the name from the vision and create the branch silently.

**Branch naming rules:**
- Format: `type/short-description`
- Types: `feat/`, `fix/`, `refactor/`, `chore/`
- Keep descriptions short and kebab-case
- Check existing branches first: `git branch --list`

---

### 2.2 Work through the six questions

Ask naturally, not as a checklist. Weave questions based on their responses.

**Memory-first protocol:**
Before asking ANYTHING:
1. Check memory: `memory_search({ query: "[topic] preference" })`
2. If found: "I recall you prefer X for this. Still true? [Y/n]"
3. If not found: Ask, then SAVE the answer with `memory_note`

**List-collection questions use `multiple: true`:**

When collecting must-haves, use a multi-select question:

```ts
question({
  header: "Must-Haves",
  question: "Which of these are must-have requirements?",
  multiple: true,
  options: [
    { label: "[Requirement A] (Recommended)", description: "[Brief description]" },
    { label: "[Requirement B]", description: "[Brief description]" },
    { label: "[Requirement C]", description: "[Brief description]" }
  ]
})
```

When collecting out-of-scope items, use a multi-select question:

```ts
question({
  header: "Out of Scope",
  question: "Which of these are out of scope for this work?",
  multiple: true,
  options: [
    { label: "[Item A] (Recommended)", description: "[Reason]" },
    { label: "[Item B]", description: "[Reason]" },
    { label: "[Item C]", description: "[Reason]" }
  ]
})
```

When collecting risks, use a multi-select question:

```ts
question({
  header: "Risks",
  question: "Which of these risks apply to this work?",
  multiple: true,
  options: [
    { label: "[Risk A] (Recommended)", description: "[Impact and mitigation]" },
    { label: "[Risk B]", description: "[Impact and mitigation]" },
    { label: "[Risk C]", description: "[Impact and mitigation]" }
  ]
})
```

When collecting constraints, use a multi-select question:

```ts
question({
  header: "Constraints",
  question: "Which of these constraints apply?",
  multiple: true,
  options: [
    { label: "[Constraint A] (Recommended)", description: "[Details]" },
    { label: "[Constraint B]", description: "[Details]" },
    { label: "[Constraint C]", description: "[Details]" }
  ]
})
```

### 2.3 Probe for specifics

| Vague Answer | Follow-up |
|--------------|-----------|
| "It should be fast" | "What's the target? Sub-100ms? Sub-1s?" |
| "Standard auth" | "JWT? Sessions? OAuth? What's the token TTL?" |
| "Good UX" | "What does that mean for this feature? Animations? Accessibility level?" |

### 2.4 Checklist tracker (internal)

Track progress through the six questions:
- [ ] Vision defined (goal, problem, users)
- [ ] Must-haves listed (at least 1)
- [ ] Constraints documented (stack, performance)
- [ ] Out of scope defined (at least 1 item)
- [ ] Assumptions listed
- [ ] Risks identified (at least 1 with mitigation)

### 2.5 Completion check

When all six questions are answered:

1. **Output the summary as a regular message first:**
   Present the vision, must-haves, constraints, out-of-scope, assumptions, and risks as formatted text.

2. **Then use structured confirmation:**

```typescript
question({
  header: "Discovery Check",
  question: "Does this capture your requirements?",
  options: [
    { value: "proceed", label: "Approve and proceed (Recommended)" },
    { value: "add", label: "Add more requirements" },
    { value: "restart", label: "Start over" }
  ]
})
```

**Outcomes:**
- **"Approve and proceed"** → Generate REQUIREMENTS.md and mark interview complete
- **"Add more requirements"** → Continue discussion from current state
- **"Start over"** → Clear all answers and restart from question 1

---

## Phase 3: Generate REQUIREMENTS.md

**Display stage banner:**
```
## 🔮 GoopSpec · Saving Discovery

⏳ Generating REQUIREMENTS.md...

---
```

### 3.1 Create REQUIREMENTS.md

Write directly (orchestrator can write planning docs) to `.goopspec/<workflowId>/REQUIREMENTS.md`:

```markdown
# REQUIREMENTS: [Feature Name]

**Generated:** [timestamp]
**Interview Status:** Complete
**Ready for Planning:** Yes

---

## Vision

[Vision statement from interview]

**Problem Solved:** [From interview]

**Why Now:** [From interview]

---

## Must-Haves (The Contract)

- [ ] **MH1**: [Title]
  - [Description]
  - **Acceptance:** [Criteria]

- [ ] **MH2**: [Title]
  - [Description]
  - **Acceptance:** [Criteria]

---

## Out of Scope

- **[Item]** — [Reason]
- **[Item]** — [Reason]

---

## Constraints

### Technical Constraints
- [Stack, frameworks, versions]

### Practical Constraints
- [Timeline, resources]

---

## Assumptions

- **[Assumption]** — If false: [Impact]

---

## Risks & Mitigations

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| [Risk] | [H/M/L] | [H/M/L] | [Plan] |

---

*Discovery interview completed. Ready for /goop-plan.*
```

### 3.2 Mark interview complete

```
goop_state({ action: "complete-interview" })
```

This atomically updates the workflow state. **NEVER edit state.json directly.**

### 3.3 Save to memory

```
memory_save({
  type: "note",
  title: "Discovery: [Feature Name]",
  content: "[Summary of key requirements and constraints]",
  concepts: ["discovery", "requirements", "[domain]"],
  importance: 0.7
})
```

---

## Phase 4: Completion

**Display completion banner:**

```
## 🔮 GoopSpec · Discovery Complete

✨ Requirements captured successfully

**Feature:** [Name]

| Question | Status |
|----------|--------|
| Vision | ✓ Defined |
| Must-Haves | ✓ [N] items |
| Constraints | ✓ Documented |
| Out of Scope | ✓ [M] items |
| Assumptions | ✓ Listed |
| Risks | ✓ [P] identified |

### Next Step

**Create the blueprint** — Transform requirements into an execution plan

→ `/goop-plan`

> **Autopilot:** If `workflow.autopilot === true`, skip the confirmation question above and immediately execute this tool call:
> ```
> mcp_slashcommand({ command: "/goop-plan" })
> ```
> **DO NOT** write "Autopilot is enabled — proceeding directly to /goop-plan" and then stop. Announcing intent in text without calling the tool is a **hard failure** — the next phase never starts. The transition only happens when `mcp_slashcommand` is actually invoked.

---

**Also available:**
- `cat .goopspec/<workflowId>/REQUIREMENTS.md` — Review discovery output
- `/goop-research [topic]` — Investigate unknowns first
```

---

## Examples

### Simple Feature

```
User: /goop-discuss add dark mode toggle

Orchestrator: "Dark mode toggle. Let me understand what you need.

**Vision:** What's the goal here?
- Toggle in settings that switches the app theme
- Persist preference across sessions
- Respect system preference as default

**Must-haves:** What MUST work?
- Toggle UI in settings
- Theme actually changes
- Persists to localStorage

**Out of scope?**
- Per-component theme overrides
- Multiple theme options beyond light/dark

**Constraints?**
- Using existing Tailwind dark: classes
- No new dependencies

**Assumptions?**
- CSS already has dark variants (will verify)

**Risks?**
- Some components may not have dark styles → will audit first

---

## Summary

[Formatted summary of all six questions]

question({
  header: "Discovery Check",
  question: "Does this capture your requirements?",
  options: [
    { value: "proceed", label: "Approve and proceed (Recommended)" },
    { value: "add", label: "Add more requirements" }
  ]
})

User: [Clicks "Approve and proceed (Recommended)"]

Orchestrator: "Creating REQUIREMENTS.md..."
```

### Complex Feature

```
User: /goop-discuss rebuild the payment system

Orchestrator: "Payment system rebuild - that's significant. 
Let me understand the scope.

**Vision:** What's driving this?
- Current system uses deprecated Stripe API
- Need to add PayPal as alternative
- Improve error handling and retry logic

**Must-haves:**
- Migrate to Stripe v2 API
- Add PayPal integration
- Unified payment interface
- Retry with exponential backoff
- Webhook handling for async payments

**Out of scope:**
- Cryptocurrency payments (future)
- Subscription management (separate project)

**Risks:**
- Stripe migration may have breaking changes → research first
- PayPal integration complexity unknown → estimate 2x buffer

---

## Summary

[Formatted summary of all six questions]

question({
  header: "Discovery Check",
  question: "Does this capture your requirements?",
  options: [
    { value: "proceed", label: "Approve and proceed (Recommended)" },
    { value: "add", label: "Add more requirements" },
    { value: "research", label: "Research unknowns first" }
  ]
})

User: [Clicks "Research unknowns first"]

Orchestrator: "I'll launch research on Stripe v2 migration before planning.
Run `/goop-research stripe v2 migration` to investigate."
```

---

## Anti-Patterns

**DON'T:** Mention an offer or question in plain text without using the `question` tool

Bad (anti-pattern):
> "Would you like creative brainstorming from The Visionary? I'd recommend skipping..."
> [Continues without calling question tool]

**DO:** Use the `question` tool for EVERY interactive offer, decision, or yes/no prompt to the user:

```ts
question({
  header: "Creative Brainstorming",
  question: "Would you like creative brainstorming from The Visionary before the interview?",
  options: [
    { label: "Skip — proceed directly (Recommended)", description: "Requirements are already well-defined" },
    { label: "Yes, bring in The Visionary", description: "Adds broad ideation around your topic" }
  ]
})
```

**Rule:** Every user-facing question or offer MUST have a corresponding `question` tool call. Plain-text questions without a `question()` call are forbidden.

---

*Discovery Interview Process v0.2.8*
