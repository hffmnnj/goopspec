/**
 * Per-session rolling tracker for recent tool calls.
 */

import type { Entry } from "./types.js";

export interface LoopTracker {
  record(sessionID: string, entry: Entry, windowSize: number): void;
  getHistory(sessionID: string): readonly Entry[];
  clearSignature(sessionID: string, tool: string, normalizedArgsHash: string): void;
  clearSession(sessionID: string): void;
}

/**
 * Create a fresh `LoopTracker` backed by a module-level `Map`.
 *
 * Sessions are fully isolated: a `sessionID` only ever reads/writes its own
 * entry array. Recording pushes a new entry and then evicts oldest-first down
 * to `windowSize`.
 */
export function createLoopTracker(): LoopTracker {
  const sessions = new Map<string, Entry[]>();

  function ensureHistory(sessionID: string): Entry[] {
    let history = sessions.get(sessionID);
    if (!history) {
      history = [];
      sessions.set(sessionID, history);
    }
    return history;
  }

  return {
    record(sessionID: string, entry: Entry, windowSize: number): void {
      if (windowSize <= 0) return;
      const history = ensureHistory(sessionID);
      history.push(entry);
      while (history.length > windowSize) {
        history.shift();
      }
    },

    getHistory(sessionID: string): readonly Entry[] {
      return sessions.get(sessionID) ?? [];
    },

    clearSignature(sessionID: string, tool: string, normalizedArgsHash: string): void {
      const history = sessions.get(sessionID);
      if (!history) return;

      const filtered = history.filter(
        (entry) => entry.tool !== tool || entry.normalizedArgsHash !== normalizedArgsHash,
      );
      if (filtered.length === 0) {
        sessions.delete(sessionID);
      } else {
        sessions.set(sessionID, filtered);
      }
    },

    clearSession(sessionID: string): void {
      sessions.delete(sessionID);
    },
  };
}
