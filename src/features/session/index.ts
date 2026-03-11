export {
  createSession,
  listSessions,
  archiveSession,
  deleteSession,
  getSessionIndex,
  updateSessionIndex,
} from "./manager.js";

export {
  SESSION_ID_PATTERN,
  SHARED_RESOURCES,
  SESSION_SCOPED_FILES,
  validateSessionId,
} from "./types.js";

export { resolveSession } from "./resolver.js";
export { setSession, setWorkflow, getActiveWorkflowId, clearSession } from "./binding.js";

export type { SessionInfo, SessionIndex } from "./types.js";
