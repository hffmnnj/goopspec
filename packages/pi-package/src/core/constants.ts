/**
 * Core constants for @goopspec/pi-package.
 *
 * All domain enumerations are defined as `as const` arrays with derived
 * union types so that runtime validation and static typing stay in sync.
 */

// ---------------------------------------------------------------------------
// Workflow phases
// ---------------------------------------------------------------------------

/**
 * The 5-phase GoopSpec workflow lifecycle for Pi.
 *
 * - discuss:  Gathering requirements through conversation
 * - plan:     Creating specification and execution blueprint
 * - execute:  Wave-based implementation
 * - accept:   Verifying and accepting completion
 * - confirm:  Final confirmation gate
 */
export const WORKFLOW_PHASES = ["discuss", "plan", "execute", "accept", "confirm"] as const;

export type WorkflowPhase = (typeof WORKFLOW_PHASES)[number];

// ---------------------------------------------------------------------------
// Document types
// ---------------------------------------------------------------------------

/** Workflow document types stored in the GoopSpec DB. */
export const DOC_TYPES = [
  "spec",
  "blueprint",
  "chronicle",
  "requirements",
  "research",
  "adl",
  "handoff",
] as const;

export type DocType = (typeof DOC_TYPES)[number];

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
// Executor tiers
// ---------------------------------------------------------------------------

/**
 * Executor agent tiers for task delegation.
 *
 * - low / medium / high:           General-purpose tiers
 * - frontend-low / frontend-high:  Frontend-specific tiers
 */
export const EXECUTOR_TIERS = ["low", "medium", "high", "frontend-low", "frontend-high"] as const;

export type ExecutorTier = (typeof EXECUTOR_TIERS)[number];

// ---------------------------------------------------------------------------
// Directory and file constants
// ---------------------------------------------------------------------------

/** Root directory for GoopSpec project state. */
export const GOOPSPEC_DIR = ".goopspec" as const;

/** SQLite database filename within the GoopSpec directory. */
export const DB_FILENAME = "goopspec.db" as const;

/** Markdown sidecar files live alongside the DB in the GoopSpec directory. */
export const MARKDOWN_SIDECAR_DIR = GOOPSPEC_DIR;

// ---------------------------------------------------------------------------
// Status symbols
// ---------------------------------------------------------------------------

/** Status symbols used in formatted output. */
export const STATUS_SYMBOLS = {
  OK: "[OK]",
  FAIL: "[FAIL]",
  WARN: "[WARN]",
  WORK: "[WORK]",
  WAIT: "[WAIT]",
  GATE: "[GATE]",
} as const;

// ---------------------------------------------------------------------------
// Pi lifecycle events
// ---------------------------------------------------------------------------

/** Pi lifecycle event names used for hook registration. */
export const PI_EVENTS = {
  SESSION_START: "session_start",
  SESSION_SHUTDOWN: "session_shutdown",
  BEFORE_AGENT_START: "before_agent_start",
  TOOL_CALL: "tool_call",
  TURN_START: "turn_start",
  TURN_END: "turn_end",
  INPUT: "input",
  CONTEXT: "context",
} as const;

// ---------------------------------------------------------------------------
// Runtime detection environment variables
// ---------------------------------------------------------------------------

/** Environment variable set by oh-my-pi to indicate its version. */
export const OMP_DETECTION_ENV = "OMP_VERSION" as const;

/** Environment variable to explicitly set the Pi runtime type. */
export const PI_RUNTIME_ENV = "PI_RUNTIME" as const;
