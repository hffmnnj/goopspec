---
name: goop-help
description: Show help and information about GoopSpec
---

# GoopSpec Help

Display help information and available commands.

## Usage

```
/goop-help
```

## Tools Used

| Tool | Purpose in This Command |
|------|------------------------|
| `goop_reference` | Load reference documentation |
| `goop_skill` | List available skills |

**Hook Support:** None specific - informational command.

---

## Available Commands

**Project Management:**
- `/goop-status` - Show current status
- `/goop-milestone [name]` - Start a new milestone

**Discovery:**
- `/goop-discuss [description]` - Capture user vision before planning
- `/goop-research` - Domain research for complex phases
- `/goop-map-codebase` - Brownfield codebase analysis

**Phase Workflow:**
- `/goop-plan [description]` - Plan a feature or phase
- `/goop-execute` - Execute wave-based implementation
- `/goop-accept` - Verify and accept completion (ACCEPTANCE GATE)
- `/goop-amend [change]` - Propose changes to locked spec
- `/goop-debug` - Debug with scientific method workflow
- `/goop-quick [description]` - Small tasks without full phase planning

**Code Review:**
- `/goop-pr-review` - Review GitHub PR with fixes and safe merge (standalone)

**Session Management:**
- `/goop-pause [name]` - Save checkpoint
- `/goop-resume [id]` - Resume from checkpoint

**Memory:**
- `/goop-remember [content]` - Save to persistent memory
- `/goop-recall [query]` - Search persistent memory
- `/goop-memory` - View memory system status

**Setup:**
- `/goop-setup` - First-time setup wizard
- `/goop-help` - Show this help

**Quick Keywords:**
Say these in any message:
- `"goopspec"` or `"goop"` - Activate GoopSpec mode
- `"spec it"` - Create a spec for current task
- `"finish it"` - Enforced continuation mode (complete all)
- `"checkpoint"` - Save checkpoint

## Concepts

**Enforced Task Continuation:** The agent keeps working until tasks are complete, with clear checkpoints for user confirmation.

**Spec-Driven Development:** Every task starts with a clear specification. The agent follows the spec, and changes require explicit agreement.

**Fresh Context:** Each phase uses fresh context to keep plans and execution precise and focused.

**Audit and Confirmation:** After execution, run verification and confirm with the user before planning the next phase.

## Configuration

Edit `.goopspec/config.json` to customize:
- Enforced task continuation settings (max prompts, interval)
- Spec enforcement (strict mode)
- Agent models
- Auto-save options

## Links

- GitHub: https://github.com/hffmnnj/opencode-goopspec
- Documentation: See README.md

---

**GoopSpec**: Spec-first execution with user confirmation gates.
