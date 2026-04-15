---
name: goop-resume
description: Resume from a saved checkpoint
---

# /goop-resume

**Resume from a checkpoint.** Restore context and continue work.

## Usage

```bash
/goop-resume [checkpoint-id]
```

## Tools Used

| Tool | Purpose in This Command |
|------|------------------------|
| `goop_checkpoint` | Load saved execution state |
| `goop_status` | Verify current state matches checkpoint |
| `memory_search` | Find context from when checkpoint was saved |

**Hook Support:** `system.transform` injects checkpoint context automatically.

---

### STOP-AND-RETURN

**Execute this tool call NOW before reading anything else:**
```
goop_checkpoint({ action: "list" })
```

**IF no checkpoints or sessions exist:**
- Return BLOCKED response immediately
- Include: "Cannot resume. No checkpoint found. Run /goop-pause first or start fresh with /goop-execute."
- Do not process further instructions

---

## How It Works

Loads a saved state, restores the workflow context, and prepares the agent to continue exactly where it left off.

### Behavior
- **With active sessions:** List active sessions first (phase, wave, last activity), let user select one, then bind it via `setSession(ctx, selectedId)` and resume.
- **One active session:** Auto-select and bind it before resuming.
- **No active sessions:** Fallback to legacy checkpoint behavior.
- **No ID:** Resumes the most recent checkpoint.
- **With ID:** Resumes specific checkpoint (e.g., `/goop-resume cp-123`).

### What Happens
1. **Resolve Session Context:** Call `listSessions(projectDir)` and resolve/bind session (select when multiple, auto-select when one, legacy fallback when none).
2. **Load State:** Reads the checkpoint JSON.
3. **Restore Context:** Re-initializes the Orchestrator at the correct phase/wave.
4. **Status Check:** Runs a quick status check to confirm environment matches.
5. **Prompt:** Reminds user of the next pending task.

## Example

> **User:** `/goop-resume`
> **Agent:** "Resuming session from 2 hours ago.
> Phase: Execute (Wave 2).
> Next Task: [2.2] Implement handler.
> Ready to continue?"
