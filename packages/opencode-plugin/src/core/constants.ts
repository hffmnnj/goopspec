/**
 * Core constants for GoopSpec 1.0.0 plugin.
 *
 * All domain enumerations are defined as `as const` arrays with derived
 * union types so that runtime validation and static typing stay in sync.
 */

// ---------------------------------------------------------------------------
// State schema
// ---------------------------------------------------------------------------

/** Current state.json schema version (v2 = multi-workflow support). */
export const STATE_SCHEMA_VERSION = 2;

/** Root directory for GoopSpec project state. */
export const GOOPSPEC_DIR = ".goopspec";

// ---------------------------------------------------------------------------
// Workflow phases
// ---------------------------------------------------------------------------

/**
 * The 5-phase GoopSpec workflow lifecycle.
 *
 * - idle:    No active workflow
 * - discuss: Gathering requirements through conversation
 * - plan:    Creating specification and execution blueprint
 * - execute: Wave-based implementation
 * - accept:  Verifying and accepting completion
 */
export const WORKFLOW_PHASES = ["idle", "discuss", "plan", "execute", "accept"] as const;

export type WorkflowPhase = (typeof WORKFLOW_PHASES)[number];

// ---------------------------------------------------------------------------
// Task modes
// ---------------------------------------------------------------------------

/**
 * Task mode determines the complexity and thoroughness of the workflow.
 *
 * - quick:          Abbreviated workflow for small fixes
 * - standard:       Normal workflow with all phases
 * - comprehensive:  Detailed workflow with extra verification
 * - milestone:      Multi-phase project with archiving
 */
export const TASK_MODES = ["quick", "standard", "comprehensive", "milestone"] as const;

export type TaskMode = (typeof TASK_MODES)[number];

// ---------------------------------------------------------------------------
// Workflow depths
// ---------------------------------------------------------------------------

/**
 * Workflow depth describes the desired level of investigation and rigor.
 *
 * - shallow:  Minimal depth for quick changes
 * - standard: Default depth for typical work
 * - deep:     Increased depth for thorough analysis
 */
export const WORKFLOW_DEPTHS = ["shallow", "standard", "deep"] as const;

export type WorkflowDepth = (typeof WORKFLOW_DEPTHS)[number];

// ---------------------------------------------------------------------------
// Executor tiers
// ---------------------------------------------------------------------------

/**
 * Executor agent tiers for task delegation.
 *
 * - low / medium / high:                       General-purpose tiers
 * - frontend-low / frontend-medium / frontend-high: Frontend-specific tiers
 */
export const EXECUTOR_TIERS = [
  "low",
  "medium",
  "high",
  "frontend-low",
  "frontend-medium",
  "frontend-high",
] as const;

export type ExecutorTier = (typeof EXECUTOR_TIERS)[number];

// ---------------------------------------------------------------------------
// Memory types
// ---------------------------------------------------------------------------

/**
 * Memory entry classification.
 *
 * `memory_save` accepts any of these via its `type` parameter, absorbing
 * the old `memory_note` and `memory_decision` tools.
 */
export const MEMORY_TYPES = ["observation", "decision", "note", "todo", "session_summary"] as const;

export type MemoryType = (typeof MEMORY_TYPES)[number];

// ---------------------------------------------------------------------------
// Resource types
// ---------------------------------------------------------------------------

/**
 * Loadable resource categories for `goop_reference`.
 *
 * Skills are folded into references (MH9); only two categories remain.
 */
export const RESOURCE_TYPES = ["reference", "template"] as const;

export type ResourceType = (typeof RESOURCE_TYPES)[number];

// ---------------------------------------------------------------------------
// Agent roles
// ---------------------------------------------------------------------------

/**
 * All agent roles recognised by the routing subsystem.
 */
export const AGENT_ROLES = [
  "orchestrator",
  "executor-low",
  "executor-medium",
  "executor-high",
  "executor-frontend-low",
  "executor-frontend-medium",
  "executor-frontend-high",
  "planner",
  "verifier",
  "researcher",
  "explorer",
  "debugger",
  "tester",
  "writer",
] as const;

export type AgentRole = (typeof AGENT_ROLES)[number];

// ---------------------------------------------------------------------------
// Token budgets
// ---------------------------------------------------------------------------

/** Default token budget for memory injection in the system-transform hook. */
export const DEFAULT_MEMORY_TOKEN_BUDGET = 800;
