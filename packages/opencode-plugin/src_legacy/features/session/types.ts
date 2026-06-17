import type { SessionIndex, SessionInfo } from "../../core/types.js";
import { WORKFLOW_SCOPED_FILES } from "../../shared/paths.js";

export type { SessionInfo, SessionIndex };
export { WORKFLOW_SCOPED_FILES };

export const SESSION_ID_PATTERN = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/;

export const SHARED_RESOURCES = ["memory.db", "config.json", "archive/"] as const;

/**
 * @deprecated Workflow docs (SPEC.md, BLUEPRINT.md, etc.) are now workflow-scoped.
 * Use WORKFLOW_SCOPED_FILES from shared/paths.ts for workflow document routing.
 * This list is kept for backward compatibility only.
 */
export const SESSION_SCOPED_FILES = [
  "state.json",
  "SPEC.md",
  "BLUEPRINT.md",
  "CHRONICLE.md",
  "RESEARCH.md",
  "REQUIREMENTS.md",
  "HANDOFF.md",
  "checkpoints/",
  "history/",
] as const;

export function validateSessionId(sessionId: string): boolean {
  return sessionId.length <= 50 && SESSION_ID_PATTERN.test(sessionId);
}
