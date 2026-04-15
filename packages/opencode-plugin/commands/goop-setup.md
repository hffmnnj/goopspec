---
name: goop-setup
description: GoopSpec setup wizard - first-time init, configuration, and verification
---

# /goop-setup

**GoopSpec setup wizard.** First-time init, configuration, and verification.

## Immediate Action

**STOP. Execute this tool call NOW before reading anything else:**
```
goop_setup({ action: "detect" })
```

**Then follow the workflow below based on the result.** Do not process user messages until you have run detection.

---

## Workflow

### If .goopspec directory NOT found → First-Time Setup

1. **Ask project name** using `question` tool (allow custom input)
2. **Ask scope** → "Both (Recommended)", "Project only", or "Global only"
3. **Ask MCP preset** → "Recommended", "Core", or "None"
4. **Ask memory** → "Yes, local embeddings (Recommended)", "Yes, OpenAI", "Yes, Ollama", or "No"
5. **Ask models** → "Use defaults (Recommended)" or "Custom configuration"

Then apply:
```
goop_setup(
  action: "init",
  scope: "<from step 2: both/project/global>",
  projectName: "<from step 1>",
  mcpPreset: "<from step 3: recommended/core/none>",
  memoryEnabled: <from step 4: true/false>,
  memoryProvider: "<from step 4: local/openai/ollama>"
)
```

Finally verify: `goop_setup(action: "verify")`

### If .goopspec directory FOUND → Ask what to do

Use `question` tool:
- **Header:** "Existing Setup"
- **Question:** "GoopSpec is already configured. What would you like to do?"
- **Options:**
  - "Verify setup" → Run `goop_setup(action: "verify")`
  - "Modify configuration" → Ask what to change, then `goop_setup(action: "apply", ...)`
  - "Reset and start fresh" → `goop_setup(action: "reset", scope: "project", preserveData: true, confirmed: true)` then do First-Time Setup
  - "View current status" → Run `goop_setup(action: "status")`

---

## Worktree Status

After detection completes, check if the session is running inside a git worktree:

1. Call `detectWorktree(ctx)` from `src/features/worktree/detector.ts`
2. If running inside a git worktree (`isWorktree: true`):
   - Report: "Running in git worktree: `<worktreePath>`"
   - Show detected branch: `<branchName>`
   - Show inferred workflowId from branch name: `<inferredWorkflowId>`
   - Show current active workflow ID: `<activeWorkflowId>` (from state)
3. If not in a worktree: report "Not running in a git worktree" (informational only)

Include this information in the setup status output alongside other environment details.

---

## Completion

After setup completes, show:

```
## GoopSpec Setup Complete

Next: Run `/goop-discuss` to start your first feature.
```
