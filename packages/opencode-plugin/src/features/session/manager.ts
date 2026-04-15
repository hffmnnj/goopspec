import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "fs";
import { join } from "path";
import { logError } from "../../shared/logger.js";
import type { SessionIndex, SessionInfo } from "./types.js";
import { SESSION_ID_PATTERN } from "./types.js";

const SESSION_ID_MIN_LENGTH = 2;
const SESSION_ID_MAX_LENGTH = 50;

function getSessionsRoot(projectDir: string): string {
  return join(projectDir, ".goopspec", "sessions");
}

function getSessionIndexPath(projectDir: string): string {
  return join(getSessionsRoot(projectDir), "_active.json");
}

function getSessionPath(projectDir: string, sessionId: string): string {
  return join(getSessionsRoot(projectDir), sessionId);
}

function getArchivedSessionPath(projectDir: string, sessionId: string): string {
  return join(projectDir, ".goopspec", "archive", "sessions", sessionId);
}

function ensureDirectory(path: string): void {
  if (!existsSync(path)) {
    mkdirSync(path, { recursive: true });
  }
}

function createEmptyIndex(): SessionIndex {
  return {
    sessions: [],
    lastUpdated: new Date().toISOString(),
  };
}

function isValidSessionId(id: string): boolean {
  if (id.length < SESSION_ID_MIN_LENGTH || id.length > SESSION_ID_MAX_LENGTH) {
    return false;
  }

  return SESSION_ID_PATTERN.test(id);
}

function assertValidSessionId(id: string): void {
  if (!isValidSessionId(id)) {
    throw new Error(
      `Invalid session ID "${id}". Session IDs must be kebab-case, 2-50 chars, and match ^[a-z0-9][a-z0-9-]*[a-z0-9]$.`,
    );
  }
}

function generateSessionId(): string {
  const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  const random = Math.random().toString(36).slice(2, 6);
  return `session-${date}-${random}`;
}

function readSessionIndexFile(projectDir: string): SessionIndex {
  const indexPath = getSessionIndexPath(projectDir);
  if (!existsSync(indexPath)) {
    return createEmptyIndex();
  }

  try {
    const parsed = JSON.parse(readFileSync(indexPath, "utf-8")) as Partial<SessionIndex>;
    if (!Array.isArray(parsed.sessions)) {
      return createEmptyIndex();
    }

    return {
      sessions: parsed.sessions,
      lastUpdated:
        typeof parsed.lastUpdated === "string" ? parsed.lastUpdated : new Date().toISOString(),
    };
  } catch (error) {
    logError(`Failed to read session index at ${indexPath}`, error);
    return createEmptyIndex();
  }
}

export function getSessionIndex(projectDir: string): SessionIndex {
  return readSessionIndexFile(projectDir);
}

export function updateSessionIndex(projectDir: string, sessions: SessionInfo[]): SessionIndex {
  const sessionsRoot = getSessionsRoot(projectDir);
  ensureDirectory(sessionsRoot);

  const indexPath = getSessionIndexPath(projectDir);
  const index: SessionIndex = {
    sessions,
    lastUpdated: new Date().toISOString(),
  };

  const tempPath = `${indexPath}.tmp.${Date.now()}.${Math.random().toString(36).slice(2, 8)}`;
  writeFileSync(tempPath, JSON.stringify(index, null, 2), "utf-8");
  renameSync(tempPath, indexPath);

  return index;
}

export function createSession(
  projectDir: string,
  id?: string,
  description?: string,
  workflowId?: string,
): SessionInfo {
  const sessionsRoot = getSessionsRoot(projectDir);
  ensureDirectory(sessionsRoot);

  const existingIndex = getSessionIndex(projectDir);
  const activeIds = new Set(existingIndex.sessions.map((session) => session.id));

  let sessionId = id;
  if (!sessionId) {
    sessionId = generateSessionId();
    while (activeIds.has(sessionId)) {
      sessionId = generateSessionId();
    }
  }

  assertValidSessionId(sessionId);

  if (activeIds.has(sessionId)) {
    throw new Error(`Session "${sessionId}" already exists.`);
  }

  const sessionPath = getSessionPath(projectDir, sessionId);
  if (existsSync(sessionPath)) {
    throw new Error(`Session directory already exists for "${sessionId}".`);
  }

  ensureDirectory(sessionPath);

  const now = new Date().toISOString();
  const session: SessionInfo = {
    id: sessionId,
    description,
    phase: "idle",
    mode: "standard",
    lastActivity: now,
    createdAt: now,
    workflowId,
  };

  updateSessionIndex(projectDir, [...existingIndex.sessions, session]);
  return session;
}

export function listSessions(projectDir: string): SessionInfo[] {
  return getSessionIndex(projectDir).sessions;
}

export function archiveSession(projectDir: string, id: string): void {
  assertValidSessionId(id);

  const sessionPath = getSessionPath(projectDir, id);
  const archivePath = getArchivedSessionPath(projectDir, id);
  const archiveRoot = join(projectDir, ".goopspec", "archive", "sessions");
  const existingIndex = getSessionIndex(projectDir);
  const existsInIndex = existingIndex.sessions.some((session) => session.id === id);

  if (!existsSync(sessionPath) && !existsInIndex) {
    throw new Error(`Session "${id}" does not exist.`);
  }

  if (existsSync(archivePath)) {
    throw new Error(`Archived session already exists for "${id}".`);
  }

  if (existsSync(sessionPath)) {
    ensureDirectory(archiveRoot);
    renameSync(sessionPath, archivePath);
  }

  updateSessionIndex(
    projectDir,
    existingIndex.sessions.filter((session) => session.id !== id),
  );
}

export function deleteSession(projectDir: string, id: string): void {
  assertValidSessionId(id);

  const sessionPath = getSessionPath(projectDir, id);
  const existingIndex = getSessionIndex(projectDir);
  const existsInIndex = existingIndex.sessions.some((session) => session.id === id);

  if (!existsSync(sessionPath) && !existsInIndex) {
    throw new Error(`Session "${id}" does not exist.`);
  }

  if (existsSync(sessionPath)) {
    rmSync(sessionPath, { recursive: true, force: true });
  }

  updateSessionIndex(
    projectDir,
    existingIndex.sessions.filter((session) => session.id !== id),
  );
}
