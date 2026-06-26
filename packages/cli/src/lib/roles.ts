/**
 * Agent roles supported by the GoopSpec model routing subsystem.
 *
 * Keep this list in sync with `packages/opencode-plugin/src/core/constants.ts`
 * so the CLI edits the same roles the plugin resolves at runtime.
 */

export const AGENT_ROLES = [
  "planner",
  "orchestrator",
  "executor-high",
  "executor-medium",
  "executor-low",
  "executor-frontend-high",
  "executor-frontend-low",
  "researcher",
  "explorer",
  "verifier",
  "tester",
  "writer",
  "debugger",
] as const;

export type AgentRole = (typeof AGENT_ROLES)[number];

/**
 * Human-readable labels for the model routing screen.
 */
export const ROLE_LABELS: Record<AgentRole, string> = {
  planner: "Planner",
  orchestrator: "Orchestrator",
  "executor-high": "Executor (High)",
  "executor-medium": "Executor (Medium)",
  "executor-low": "Executor (Low)",
  "executor-frontend-high": "Frontend Executor (High)",
  "executor-frontend-low": "Frontend Executor (Low)",
  researcher: "Researcher",
  explorer: "Explorer",
  verifier: "Verifier",
  tester: "Tester",
  writer: "Writer",
  debugger: "Debugger",
};
