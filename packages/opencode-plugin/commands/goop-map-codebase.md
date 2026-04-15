---
name: goop-map-codebase
description: Map an existing codebase for brownfield projects - understand architecture, stack, and conventions
tools:
  read: true
  write: true
  bash: true
  task: true
  glob: true
  grep: true
---

# /goop-map-codebase

**Map an existing codebase.** Analyze architecture, stack, and conventions for brownfield projects.

## Immediate Action

**STOP. Execute this tool call NOW before reading anything else:**
```
goop_reference({ name: "map-codebase-process" })
```

**Then follow the process from that reference.** Do not process user messages until you have loaded and understood the protocol.

## Quick Summary

Spawns 7 parallel explore agents to analyze the codebase. Creates `.goopspec/codebase/` with focused analysis documents.

### Tools Used

| Tool | Purpose |
|------|---------|
| `goop_status` | Check if mapping already exists |
| `memory_search` | Find prior codebase insights |
| `memory_save` | Persist discovered patterns |
| `memory_note` | Quick capture during exploration |
| `goop_reference` | Load detailed process |

### Process Overview

1. **Setup** — Check existing map, init .goopspec/codebase
2. **Parallel Exploration** — Spawn 7 explore agents
3. **Synthesize** — Collect and organize findings
4. **Write Documents** — Create 7 analysis files
5. **Completion** — Show next steps

### 7 Analysis Documents

| Document | Contents |
|----------|----------|
| `STACK.md` | Languages, frameworks, build tools, database |
| `ARCHITECTURE.md` | Patterns, components, data flow |
| `STRUCTURE.md` | Directory organization, file patterns |
| `CONVENTIONS.md` | Naming, code style, imports |
| `TESTING.md` | Frameworks, coverage, gaps |
| `INTEGRATIONS.md` | APIs, services, env vars |
| `CONCERNS.md` | Code smells, security, tech debt |

## Output

Creates `.goopspec/codebase/` with 7 markdown analysis files.

## When to Use

- Joining an existing project
- Before extending unfamiliar code
- When inheriting a codebase
- Before major refactoring

## Success Criteria

- [ ] All 7 documents created
- [ ] Critical concerns identified
- [ ] Tech debt documented
- [ ] User knows next step is `/goop-setup`

---

*Load `goop_reference({ name: "map-codebase-process" })` for full process details.*
