# Status Display Process

Detailed process for `/goop-status` - showing current project state.

## Data Sources

| Source | Information |
|--------|-------------|
| `goop_state` | Phase, locks, timestamps |
| `REQUIREMENTS.md` | Interview status |
| `SPEC.md` | Must-haves, lock status |
| `BLUEPRINT.md` | Waves, tasks, traceability |
| `CHRONICLE.md` | Progress, decisions, blockers |
| `HANDOFF.md` | Last session context |

---

## Status Dashboard Template

```
## 🔮 GoopSpec · Status

### Project State

| Attribute | Value |
|-----------|-------|
| Phase | [current phase] |
| Interview Complete | [Yes/No] |
| Spec Locked | [Yes/No] |
| Wave | [N of M] |
| Task | [X of Y] |

### Gate Status

| Gate | Status | Requirement |
|------|--------|-------------|
| Discovery | [PASSED/BLOCKED] | interview_complete |
| Spec | [PASSED/BLOCKED] | spec_locked |
| Execution | [PASSED/BLOCKED] | all_tasks_done |
| Acceptance | [PASSED/BLOCKED] | verification_passed |

### Progress

[Progress bar and completion percentage]

#### Completed
- [x] [Item 1]
- [x] [Item 2]

#### In Progress
- [ ] [Current item] <- **Current**

#### Remaining
- [ ] [Item 3]
- [ ] [Item 4]

### Active Blockers

[None | List of blockers]

### Pending Decisions

[None | List of decisions awaiting user input]

### Recent Activity

| Time | Action | Agent |
|------|--------|-------|
| [time] | [action] | [agent] |

---

### Suggested Next Command

Based on current state: `/goop-[command]`

[Brief explanation]

---
```

---

## Gate Logic

### Discovery Gate
```
IF REQUIREMENTS.md exists AND interview_complete == true:
  PASSED
ELSE:
  BLOCKED - Run /goop-discuss
```

### Spec Gate
```
IF SPEC.md exists AND spec_locked == true:
  PASSED
ELSE:
  BLOCKED - Run /goop-plan to confirm and lock
```

### Execution Gate
```
IF CHRONICLE shows all waves complete:
  PASSED
ELSE:
  BLOCKED - Continue /goop-execute
```

### Acceptance Gate
```
IF verification_passed == true AND user_accepted == true:
  PASSED
ELSE:
  BLOCKED - Run /goop-accept
```

---

## Command Suggestions

| State | Suggested Command |
|-------|-------------------|
| No project | `/goop-discuss` to start discovery |
| Interview incomplete | `/goop-discuss` to complete interview |
| Interview complete, no spec | `/goop-plan` to create blueprint |
| Spec draft, not locked | `/goop-plan` to confirm and lock |
| Spec locked, not executing | `/goop-execute` to start |
| Executing, tasks remaining | `/goop-execute` to continue |
| Executing, all done | `/goop-accept` to verify and finalize |
| Verified, not accepted | `/goop-accept` to accept and complete |
| Accepted | Ready for next milestone |

---

## Verbose Mode

With `--verbose`:

```
### Full Task History

| Wave | Task | Status | Commit | Time |
|------|------|--------|--------|------|
| 1 | 1.1 | Complete | abc123 | 10m |
| 1 | 1.2 | Complete | def456 | 15m |
| 2 | 2.1 | In Progress | - | - |

### Memory Stats

- Total memories: [N]
- Decisions: [M]
- Observations: [P]
- Recent: [list]

### Recent Deviations

| Rule | Description | Resolution |
|------|-------------|------------|
| [N] | [What happened] | [How resolved] |

### Checkpoint History

| ID | Phase | Wave | Created |
|----|-------|------|---------|
| [id] | [phase] | [wave] | [time] |
```

---

## Examples

### Fresh Project
```
User: /goop-status

## 🔮 GoopSpec · Status

### Project State

| Attribute | Value |
|-----------|-------|
| Phase | idle |
| Interview Complete | No |
| Spec Locked | No |

### Gate Status

| Gate | Status |
|------|--------|
| Discovery | BLOCKED |
| Spec | BLOCKED |
| Execution | BLOCKED |
| Acceptance | BLOCKED |

### Suggested Next Command

`/goop-discuss` - Start discovery interview

No project documents found. Begin with discovery.
```

### Mid-Execution
```
User: /goop-status

## 🔮 GoopSpec · Status

### Project State

| Attribute | Value |
|-----------|-------|
| Phase | execute |
| Interview Complete | Yes |
| Spec Locked | Yes |
| Wave | 2 of 3 |
| Task | 3 of 4 |

### Gate Status

| Gate | Status |
|------|--------|
| Discovery | PASSED |
| Spec | PASSED |
| Execution | In Progress |
| Acceptance | Pending |

### Progress

[################____] 75%

#### Completed
- [x] Wave 1: Foundation (4/4 tasks)
- [x] Wave 2.1: Define types
- [x] Wave 2.2: Implement handler

#### In Progress
- [ ] Wave 2.3: Add validation <- **Current**

#### Remaining
- [ ] Wave 2.4: Add tests
- [ ] Wave 3: Integration (3 tasks)

### Suggested Next Command

`/goop-execute` - Continue Wave 2

2 tasks remaining in Wave 2, then Wave 3.
```

---

*Status Process v0.2.6*
