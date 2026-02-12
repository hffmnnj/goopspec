/**
 * Phase 3: Execute prompt section
 * @module agents/prompt-sections/execute
 */

import type { WaveExecutionMode } from "../../core/types.js";

export function buildExecuteSection(waveExecution: WaveExecutionMode): string {
  const executionStrategy = waveExecution === "sequential" 
    ? buildSequentialStrategy() 
    : buildParallelStrategy();

  return `<Phase_3_Execute>
## Phase 3: Execute

**Goal**: Implement the plan through systematic wave-based execution.

### Memory-First Checks

Before executing a wave:
- Review SPEC/BLUEPRINT/CHRONICLE for scope and constraints
- Search memory for related implementations or decisions
- Confirm the spec is locked before proceeding

### Execution Strategy: ${waveExecution === "sequential" ? "Sequential Waves" : "Parallel Execution"}

${executionStrategy}

### Wave Execution Protocol

For each wave:

1. **Announce Wave Start**
   \`\`\`
   "Starting Wave [N]: [Description]
   Tasks: [list of tasks]"
   \`\`\`

2. **Execute Tasks**
   - Delegate with native \`task\` to the executor tier specified in the task's **Executor** metadata field (from BLUEPRINT.md)
   - Build every delegation prompt with task intent, SPEC/BLUEPRINT/wave context, memory context, constraints, and verification expectations
   - Track progress with todo tools
   - Save checkpoints with \`goop_checkpoint\`

3. **Verify Wave Completion**
   - All tasks in wave marked complete
   - Tests pass (if applicable)
   - No regression introduced

4. **Report Wave Status**
   \`\`\`
   "Wave [N] Complete:
   - [Task 1]: Done
   - [Task 2]: Done
   
   Ready for Wave [N+1]?"
   \`\`\`

### Delegation via native task (required)

When delegating tasks:
\`\`\`
task({
  // Read the Executor field from BLUEPRINT task metadata
  subagent_type: "[Read Executor field from BLUEPRINT task metadata]",
  description: "Task [X.Y]: [Atomic action]",
  prompt: \`
## TASK INTENT
[Single atomic outcome and why it matters]

## EXPECTED OUTPUT
- [Concrete deliverable 1]
- [Concrete deliverable 2]

## PROJECT CONTEXT
- SPEC references: [must-have IDs and constraints from SPEC.md]
- BLUEPRINT references: [wave/task and done criteria from BLUEPRINT.md]
- Wave position: [current wave/task status]
- Project conventions: [from PROJECT_KNOWLEDGE_BASE.md]
- Relevant memory: [prior decisions/observations to follow]

## FILES IN SCOPE
- [file path 1]
- [file path 2]

## CONSTRAINTS
- Follow existing code patterns and naming conventions
- Keep changes scoped to this task only
- Apply deviation rules (Rules 1-3 auto-fix, Rule 4 stop and ask)
- Return XML response envelope with artifacts and handoff

## VERIFICATION
\`\`\`bash
[verification command(s)]
\`\`\`
  \`
})
\`\`\`

**Tier Routing:** Each task in BLUEPRINT.md has an \`| **Executor** | goop-executor-{tier} |\` field.
Always use the exact executor name from that field. Available tiers: \`goop-executor-low\`, \`goop-executor-medium\`, \`goop-executor-high\`, \`goop-executor-frontend\`.

**Specialist Routing by task type:**
- \`goop-researcher\` for evaluation/comparison/research requests
- \`goop-explorer\` for locating code and mapping call paths
- \`goop-debugger\` for bug investigation and root-cause analysis
- \`goop-verifier\` for requirement/security verification

### Handling Execution Issues

**If task fails or is blocked:**
1. Assess the issue
2. Check if it's a deviation (see Deviation Rules)
3. If auto-fixable: Apply fix, continue
4. If architectural: STOP, return to user for decision

**If scope creep detected:**
1. Note the additional work needed
2. Complete current task as specified
3. Report scope creep to user
4. Add to backlog or create new plan

### Progress Tracking

Maintain execution state:
- Use \`goop_status\` to check current state
- Use \`goop_checkpoint\` to save progress
- Use \`goop_adl\` to record decisions

### Transition to Phase 4

After all waves complete:
\`\`\`
"All waves executed:
- Wave 1: [summary] ✓
- Wave 2: [summary] ✓
- Wave 3: [summary] ✓

Moving to audit phase to verify against requirements."
\`\`\`

**Proceed to Phase 4 automatically (audit is required).**
</Phase_3_Execute>`;
}

function buildSequentialStrategy(): string {
  return `**Sequential Wave Execution** (Recommended)

Execute one wave at a time, verify before proceeding:

\`\`\`
Wave 1 → Verify → Wave 2 → Verify → Wave 3 → Verify → ...
\`\`\`

Benefits:
- Issues caught early before they compound
- Clear progress checkpoints
- Easier to rollback if needed
- Dependencies naturally satisfied

Rules:
- Complete ALL tasks in a wave before moving to next
- Verify each wave before proceeding
- If wave verification fails, fix before continuing`;
}

function buildParallelStrategy(): string {
  return `**Parallel Wave Execution** (Advanced)

Execute independent tasks in parallel, grouped by dependencies:

\`\`\`
Wave 1 (sequential - foundation)
  ↓
Wave 2 (parallel tasks within wave)
  ↓
Wave 3 (parallel tasks within wave)
\`\`\`

Benefits:
- Faster execution for large features
- Better resource utilization

Rules:
- Only parallelize tasks WITHOUT dependencies
- Still verify after each wave
- Merge conflicts are YOUR responsibility to resolve`;
}
