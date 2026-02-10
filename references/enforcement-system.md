# Orchestration Enforcement System

GoopSpec enforces workflow rules through a layered enforcement system. This document describes how enforcement works and how to configure it.

## Overview

The enforcement system transforms GoopSpec from a "suggestions-based" system into an **enforced workflow** where:
- Commands trigger actual state transitions
- Documents are scaffolded automatically
- Phase gates block progression until requirements are met
- The orchestrator is forced to delegate code work

## Components

### 1. Phase Context Builder

**Location:** `src/features/enforcement/phase-context.ts`

Generates phase-specific enforcement rules for injection into system prompts.

**Key Functions:**
- `buildPhaseEnforcement(phase, state)` - Generates MUST DO / MUST NOT DO lists
- `buildStateContext(state)` - Generates current state information
- `buildEnforcementContext(state)` - Combines both for system prompt injection
- `isOperationAllowed(phase, operation)` - Checks if operation is valid in phase

### 2. Document Scaffolder

**Location:** `src/features/enforcement/scaffolder.ts`

Automatically creates phase directory structure with templated documents.

**Key Functions:**
- `scaffoldPhaseDocuments(ctx, phaseName, phase)` - Creates `.goopspec/phases/[name]/` with documents
- `checkPhaseDocuments(ctx, phaseName, phase)` - Validates required documents exist
- `getPhaseDir(ctx, phaseName)` - Returns phase directory path

**Document Types:**
| Type | File | Required In |
|------|------|-------------|
| spec | SPEC.md | plan, research, specify, execute, accept |
| blueprint | BLUEPRINT.md | specify, execute, accept |
| chronicle | CHRONICLE.md | plan, research, specify, execute, accept |
| research | RESEARCH.md | research, specify |

### 3. Validators

**Location:** `src/features/enforcement/validators.ts`

Validates operations against current workflow phase.

**Key Functions:**
- `validateWriteOperation(phase, filePath)` - Checks if file write is allowed
- `validatePhaseTransition(ctx, from, to)` - Validates transition preconditions
- `isImplementationFile(filePath)` - Detects code vs config files

**Protected Directories:**
- `src/`, `lib/`, `app/`, `apps/`
- `packages/`, `server/`, `client/`

## Hooks

### System Transform Hook

**Location:** `src/hooks/system-transform.ts`

Injects enforcement context into every system prompt:
- Current phase and state information
- Phase-specific MUST DO / MUST NOT DO rules
- Delegation reminders in execute phase
- Memory context for continuity

### Command Processor Hook

**Location:** `src/hooks/command-processor.ts`

Processes `/goop-*` slash commands:
- Triggers state transitions (e.g., `/goop-plan` → plan phase)
- Scaffolds phase documents automatically
- Logs command processing to ADL

**Command Mappings:**
| Command | Target Phase |
|---------|--------------|
| /goop-plan | plan |
| /goop-discuss | plan |
| /goop-research | research |
| /goop-execute | execute |
| /goop-accept | accept |
| /goop-complete | idle |

### Orchestrator Enforcement Hook

**Location:** `src/hooks/orchestrator-enforcement.ts`

Enforces delegation rules for the orchestrator agent:

**Code Blocking:**
- Blocks `edit`/`write` on code files for orchestrator
- Allows planning files (`.goopspec/`, `.md`, `.json`)
- Injects delegation guidance when blocked

**Delegation Enforcement:**
- Detects `goop_delegate` calls
- Injects `task()` invocation reminders
- Tracks pending delegations per session

## Phase Rules

### Plan Phase
**MUST DO:**
- Ask clarifying questions
- Create SPEC.md with must-haves, nice-to-haves, out-of-scope
- Get user confirmation before proceeding

**MUST NOT DO:**
- Write ANY implementation code
- Use write/edit tools on src/ files
- Skip requirement gathering

### Research Phase
**MUST DO:**
- Read SPEC.md to understand requirements
- Create RESEARCH.md with findings
- Document trade-offs and recommendations

**MUST NOT DO:**
- Write implementation code
- Modify source files

### Specify Phase
**MUST DO:**
- Create BLUEPRINT.md with wave-based plan
- Map all must-haves to specific tasks
- Get user confirmation to lock specification

**MUST NOT DO:**
- Write implementation code
- Proceed without locked specification

### Execute Phase
**MUST DO:**
- DELEGATE all code work using `task()` tool
- Track progress in CHRONICLE.md
- Follow wave order
- Save checkpoints at wave boundaries

**MUST NOT DO:**
- Write code directly
- Use 'delegate' tool (use 'task' instead)
- Skip verification steps

### Accept Phase
**MUST DO:**
- Verify ALL must-haves from SPEC.md
- Run all tests
- Get explicit user acceptance

**MUST NOT DO:**
- Mark complete without verification
- Skip user confirmation

## Configuration

Enforcement is enabled by default. No configuration currently required.

Future configuration options (planned):
```json
{
  "enforcement": {
    "level": "strict",  // assist | warn | strict
    "codeBlocking": true,
    "delegationEnforcement": true
  }
}
```

## Troubleshooting

### "Cannot write to file" errors
The orchestrator is blocked from writing code files. Delegate to goop-executor:
```
task({
  subagent_type: "goop-executor",
  description: "Implement feature X",
  prompt: "..."
})
```

### Phase transition rejected
Ensure required documents exist before transitioning:
- `execute` requires SPEC.md
- `accept` requires SPEC.md, BLUEPRINT.md, CHRONICLE.md

### Commands not triggering state changes
Verify the command is processed by checking ADL.md for logged entries.

### Enforcement context not appearing
Ensure memory injection is enabled in config:
```json
{
  "memory": {
    "injection": {
      "enabled": true
    }
  }
}
```

---

*GoopSpec v0.2.5 - Enforcement System Documentation*
