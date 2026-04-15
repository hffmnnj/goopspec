import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { writeFileSync } from "fs";
import { join } from "path";
import { setupTestEnvironment } from "../../test-utils.js";
import {
  DEFAULT_SHORT_ID_LENGTH,
  extractAgentId,
  findAgentFiles,
  generateAgentFilePath,
  getCanonicalPath,
} from "./file-patterns.js";

const normalizeAgentId = (agentId: string): string => agentId.replace(/[^a-zA-Z0-9]/g, "");

describe("team file patterns", () => {
  let cleanup: () => void;
  let testDir: string;

  beforeEach(() => {
    const env = setupTestEnvironment("file-pattern-tests");
    cleanup = env.cleanup;
    testDir = env.testDir;
  });

  afterEach(() => cleanup());

  it("generates per-agent file paths for all agent types", () => {
    const basePath = join(testDir, "RESEARCH.md");
    const agentIds = [
      "goop-executor",
      "goop-researcher",
      "goop-explorer",
      "goop-verifier",
      "goop-planner",
      "goop-writer",
      "goop-designer",
      "goop-tester",
      "goop-debugger",
      "goop-librarian",
    ];

    agentIds.forEach((agentId) => {
      const shortId = normalizeAgentId(agentId).slice(0, DEFAULT_SHORT_ID_LENGTH);
      const path = generateAgentFilePath(basePath, agentId);
      expect(path).toBe(join(testDir, `RESEARCH-${shortId}.md`));
      expect(extractAgentId(path)).toBe(shortId);
    });
  });

  it("clamps short id length within bounds", () => {
    const basePath = join(testDir, "NOTES.md");
    const path = generateAgentFilePath(basePath, "abc123456", 2);
    expect(extractAgentId(path)).toBe("abc123");

    const nanPath = generateAgentFilePath(basePath, "abc123456", Number.NaN);
    expect(extractAgentId(nanPath)?.length).toBe(DEFAULT_SHORT_ID_LENGTH);
  });

  it("returns base path when agent id normalizes to empty", () => {
    const basePath = join(testDir, "SUMMARY.md");
    const path = generateAgentFilePath(basePath, "***");
    expect(path).toBe(basePath);
    expect(extractAgentId(path)).toBeNull();
  });

  it("extracts canonical paths", () => {
    const basePath = join(testDir, "REPORT.md");
    const agentPath = generateAgentFilePath(basePath, "agent-123");
    expect(getCanonicalPath(agentPath)).toBe(basePath);
    expect(getCanonicalPath(basePath)).toBe(basePath);
  });

  it("finds agent files with optional filters", () => {
    const basePath = join(testDir, "RESEARCH.md");
    const firstPath = generateAgentFilePath(basePath, "agent-111");
    const secondPath = generateAgentFilePath(basePath, "agent-222");
    const unrelatedPath = join(testDir, "README.md");

    writeFileSync(firstPath, "one");
    writeFileSync(secondPath, "two");
    writeFileSync(unrelatedPath, "skip");

    const allMatches = findAgentFiles(basePath);
    expect(allMatches.sort()).toEqual([firstPath, secondPath].sort());

    const firstShortId = extractAgentId(firstPath) ?? "";
    const secondShortId = extractAgentId(secondPath) ?? "";

    const stringFilter = findAgentFiles(basePath, firstShortId);
    expect(stringFilter).toEqual([firstPath]);

    const regexFilter = findAgentFiles(basePath, new RegExp(secondShortId));
    expect(regexFilter).toEqual([secondPath]);
  });
});
