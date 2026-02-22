# Interactive Questioning Protocol

**GoopSpec Voice:** Direct, Purposeful, Memory-First.

We use interactive questioning to trade ambiguity for clarity without halting momentum. Every question must earn its right to interrupt the user.

## Core Philosophy

1.  **Memory First:** Never ask what you already know.
2.  **Gate-Oriented:** Questions should drive towards a Decision Gate (Contract, Checkpoint, Acceptance).
3.  **Skill-Backed:** Use skills to frame questions intelligently, not just to gather data.
4.  **Progressive:** Start high-level; drill down only when necessary.

---

## 1. Memory-Aware Questioning

Before formulating a question, you **MUST** search memory.

### The Protocol
1.  **Search:** `memory_search({ query: "[topic] preference" })`
2.  **Evaluate:** Do I have a high-confidence answer (Importance > 7)?
3.  **Action:**
    *   **High Confidence:** Use it. Inform user: "Using saved preference for X."
    *   **Medium Confidence:** Confirm. "I recall you prefer X. Still true?"
    *   **No Data:** Ask. Then **SAVE** the answer.

### Examples

**❌ Bad (Amnesic):**
> "What database should we use?"
*(User has answered this 5 times before)*

**✅ Good (Memory-Aware):**
> ⬢ **Memory Recall:** You prefer **PostgreSQL** for new services.
> Proceeding with Postgres? [Y/n]

---

## 2. Skill-Aware Questioning

Don't just ask "What do you want?". Use loaded skills to provide *informed options*.

### The Protocol
1.  **Consult Skill:** Use `research` or `security` or `architecture` skills to analyze the situation.
2.  **Frame Options:** Present choices based on expert analysis.
3.  **Ask:** specific, constrained questions.

### Examples

**❌ Bad (Generic):**
> "How should we handle authentication?"

**✅ Good (Skill-Backed - Security):**
> ⬢ **Security Skill Analysis:**
> For this stack, I recommend **OAuth2 with PKCE** for these reasons:
> 1. Matches your security baseline.
> 2. Best support for mobile clients.
>
> **Decision:** Implement OAuth2? [Y/n] or "Explain alternatives"

---

## 3. Decision Gates

Use formal Gates for high-impact questions. Stop the world.

### Contract Gate (Planning Phase)
*Must resolve scope before work begins.*

> **Question:** "Are these MUST-HAVES correct and complete?"
> **Trigger:** End of `/goop-plan` (internal contract gate)
> **Action:** Lock SPEC.md upon confirmation.

### Checkpoint Gate (Execution Phase)
*Stop for architectural forks in the road.*

> **Question:** "I found two valid patterns. A is faster, B is more scalable. Which path?"
> **Trigger:** Rule 4 (Architectural Decision).
> **Action:** Wait for user selection.

### Acceptance Gate (Completion Phase)
*Verify completion against the contract.*

> **Question:** "I have verified requirements A, B, and C. Ready to accept?"
> **Trigger:** `/goop-accept`
> **Action:** Archive task and update memory.

---

## 4. Progressive Disclosure

Don't wall-of-text the user. Reveal complexity in layers.

### Level 1: The "Happy Path" Proposal
State the most likely path and ask for confirmation.
> "I plan to use **React Hook Form** for this form. Proceed?"

### Level 2: The Fork
If rejected or ambiguous, offer distinct high-level options.
> "Okay. Options:
> 1. **React Hook Form** (Standard, performant)
> 2. **Formik** (Legacy compatibility)
> 3. **Raw State** (Simple forms only)"

### Level 3: The Deep Dive
Only if requested, show full tradeoffs.
> "Here is the detailed comparison of bundle size, re-render performance, and API surface..."

---

## 5. Multi-Select vs Single-Select

Choosing the right selection mode is critical for UX. Using single-select when multi-select is appropriate forces the user through a tedious loop; using multi-select for a binary decision adds unnecessary noise.

### When to Use `multiple: true`

Use multi-select any time the user may legitimately want to pick **more than one item** from a list:

- Collecting must-have requirements
- Selecting risks or constraints
- Marking out-of-scope items
- Choosing feature flags or capabilities
- Picking labels, tags, or categories

### When NOT to Use `multiple: true`

Use single-select (omit `multiple` or set it to `false`) for:

- **Confirmation gates** — approve / amend / cancel
- **Binary decisions** — yes / no
- **Exclusive path choices** — "which approach to take" where only one option can be active

### Anti-Pattern (DON'T)

```ts
// WRONG: One-by-one loop forces the user to answer repeatedly
question({ header: "Must-Haves", question: "Add a must-have?", options: ["Add requirement", "Done"] })
// ... repeat for each item — tedious and error-prone
```

This pattern requires multiple round-trips, loses context between calls, and makes it easy for the user to miss items.

### Correct Pattern (DO)

```ts
// CORRECT: Multi-select collects the full list in one call
question({
  header: "Must-Haves",
  multiple: true,
  question: "Which of these are must-have requirements?",
  options: [
    { label: "Option A", description: "Core feature needed on day one" },
    { label: "Option B", description: "Required for compliance" },
    { label: "Option C", description: "Nice-to-have, can defer" }
  ]
})
```

The user sees all options at once, can select any combination, and the agent receives the complete list in a single response.

### Quick Reference

| Scenario | Mode |
|---|---|
| Collecting must-haves / risks / constraints | `multiple: true` |
| Selecting feature flags or tags | `multiple: true` |
| Approve / amend / cancel gate | single-select |
| Yes / no confirmation | single-select |
| Exclusive path choice (A or B, not both) | single-select |

---

## 6. Mandatory `(Recommended)` Suffix

**Every `question` tool call MUST mark exactly one option with `(Recommended)` appended to its label.** This helps users identify the suggested path at a glance and reduces decision fatigue.

### Rules

- Add ` (Recommended)` to **exactly one** option per `question` call — no more, no fewer.
- **Never** add it to multiple options in the same question.
- **Never** omit it entirely from a `question` call (multi-select list-collection questions are exempt — see below).

### Which Option to Mark

| Question Type | Mark as Recommended |
|---|---|
| Approve / confirm / accept gates | The confirm/approve option |
| Continue / pause choices | The continue option (usually first) |
| Wave review (approve / research / clarify) | "Approve Wave" or the first option |
| Architectural decisions with a clear best practice | The safer/faster/standard choice |
| All options are roughly equal | The first option |

### Exemption

Multi-select questions (`multiple: true`) used for **list collection** (must-haves, risks, constraints, out-of-scope items) are exempt — they have no single "recommended" path because the user is selecting a set.

### Example

```ts
// CORRECT — exactly one option marked
question({
  header: "Contract Gate",
  question: "How would you like to proceed?",
  options: [
    { label: "Confirm and Lock (Recommended)", description: "Accept contract and lock spec" },
    { label: "Amend", description: "Revise contract before locking" },
    { label: "Cancel", description: "Stop now and keep spec unlocked" }
  ]
})

// WRONG — no recommended option
question({
  header: "Contract Gate",
  question: "How would you like to proceed?",
  options: [
    { label: "Confirm and Lock", description: "Accept contract and lock spec" },
    { label: "Amend", description: "Revise contract before locking" },
    { label: "Cancel", description: "Stop now and keep spec unlocked" }
  ]
})
```

---

## Checklist: Before You Ask

- [ ] **Did I search memory?** (Don't be amnesic)
- [ ] **Is this a "One-Way Door" decision?** (If yes, use a Gate)
- [ ] **Can I propose a default instead?** (Bias for action)
- [ ] **Is the question binary or multiple choice?** (Reduce cognitive load)
- [ ] **Am I ready to save the answer?** (Build the knowledge base)

---

**Remember:** Every question is a context switch. Make it count.
