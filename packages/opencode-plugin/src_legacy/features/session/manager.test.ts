import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { setupTestEnvironment } from "../../test-utils.js";
import {
  archiveSession,
  createSession,
  deleteSession,
  getSessionIndex,
  listSessions,
  updateSessionIndex,
} from "./manager.js";
import type { SessionInfo } from "./types.js";
import * as sessionModule from "./index.js";

describe("session manager", () => {
  let testDir: string;
  let cleanup: () => void;

  beforeEach(() => {
    const env = setupTestEnvironment("session-manager");
    testDir = env.testDir;
    cleanup = env.cleanup;
  });

  afterEach(() => {
    cleanup();
  });

  it("returns an empty list for a fresh project", () => {
    expect(listSessions(testDir)).toEqual([]);

    const index = getSessionIndex(testDir);
    expect(index.sessions).toEqual([]);
    expect(typeof index.lastUpdated).toBe("string");
  });

  it("creates a session and returns metadata in list", () => {
    const created = createSession(testDir, "feature-auth", "Auth work");
    const sessions = listSessions(testDir);

    expect(created.id).toBe("feature-auth");
    expect(created.description).toBe("Auth work");
    expect(created.phase).toBe("idle");
    expect(created.mode).toBe("standard");
    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.id).toBe("feature-auth");
    expect(sessions[0]?.description).toBe("Auth work");
    expect(typeof sessions[0]?.createdAt).toBe("string");
    expect(typeof sessions[0]?.lastActivity).toBe("string");
  });

  it("stores workflowId when creating a session", () => {
    const created = createSession(testDir, "feature-workflow", "Workflow work", "feat-x");
    const sessions = listSessions(testDir);

    expect(created.workflowId).toBe("feat-x");
    expect(sessions[0]?.workflowId).toBe("feat-x");
  });

  it("archives a session and removes it from active index", () => {
    createSession(testDir, "feature-archive");
    const activePath = join(testDir, ".goopspec", "sessions", "feature-archive");
    const archivedPath = join(
      testDir,
      ".goopspec",
      "archive",
      "sessions",
      "feature-archive",
    );

    expect(existsSync(activePath)).toBe(true);

    archiveSession(testDir, "feature-archive");

    expect(existsSync(activePath)).toBe(false);
    expect(existsSync(archivedPath)).toBe(true);
    expect(listSessions(testDir)).toEqual([]);
  });

  it("deletes a session directory and removes index entry", () => {
    createSession(testDir, "feature-delete");
    const sessionPath = join(testDir, ".goopspec", "sessions", "feature-delete");

    expect(existsSync(sessionPath)).toBe(true);
    deleteSession(testDir, "feature-delete");

    expect(existsSync(sessionPath)).toBe(false);
    expect(listSessions(testDir)).toEqual([]);
  });

  it("uses atomic writes for _active.json updates", () => {
    const sessions: SessionInfo[] = [
      {
        id: "feature-atomic",
        description: "Atomic write test",
        phase: "idle",
        mode: "standard",
        lastActivity: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      },
    ];

    updateSessionIndex(testDir, sessions);

    const sessionsDir = join(testDir, ".goopspec", "sessions");
    const files = readdirSync(sessionsDir);
    expect(files).toContain("_active.json");
    expect(files.some((file) => file.startsWith("_active.json.tmp."))).toBe(false);

    const index = JSON.parse(
      readFileSync(join(sessionsDir, "_active.json"), "utf-8"),
    ) as { sessions: SessionInfo[] };
    expect(index.sessions).toHaveLength(1);
    expect(index.sessions[0]?.id).toBe("feature-atomic");
  });

  it("auto-generates valid IDs when no id is provided", () => {
    const created = createSession(testDir);
    expect(created.id).toMatch(/^session-[0-9]{8}-[a-z0-9]{4}$/);
    expect(created.id).toMatch(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/);
    expect(created.id.length).toBeGreaterThanOrEqual(2);
    expect(created.id.length).toBeLessThanOrEqual(50);
  });

  it("rejects invalid session IDs with a clear message", () => {
    expect(() => createSession(testDir, "a")).toThrow("Invalid session ID");
    expect(() => createSession(testDir, "bad_id")).toThrow("Invalid session ID");
    expect(() => createSession(testDir, "-leading")).toThrow("Invalid session ID");
    expect(() => createSession(testDir, "trailing-")).toThrow("Invalid session ID");
    expect(() => createSession(testDir, "UPPER")).toThrow("Invalid session ID");
  });

  it("reads session index from disk on demand", () => {
    createSession(testDir, "feature-disk");

    const indexPath = join(testDir, ".goopspec", "sessions", "_active.json");
    writeFileSync(
      indexPath,
      JSON.stringify({ sessions: [], lastUpdated: new Date().toISOString() }, null, 2),
      "utf-8",
    );

    expect(listSessions(testDir)).toEqual([]);
  });

  it("barrel export re-exports public session manager functions", () => {
    expect(typeof sessionModule.createSession).toBe("function");
    expect(typeof sessionModule.listSessions).toBe("function");
    expect(typeof sessionModule.archiveSession).toBe("function");
    expect(typeof sessionModule.deleteSession).toBe("function");
    expect(typeof sessionModule.getSessionIndex).toBe("function");
    expect(typeof sessionModule.updateSessionIndex).toBe("function");
  });
});
