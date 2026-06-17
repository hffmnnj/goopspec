import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { setupTestEnvironment } from "../../test-utils.js";
import { generateAgentFilePath } from "./file-patterns.js";
import { mergeAgentOutputs } from "./merge.js";
import { registerAgent } from "./registry.js";
import type { AgentRegistration } from "./types.js";

const createRegistration = (
  overrides: Partial<AgentRegistration> = {}
): AgentRegistration => ({
  id: overrides.id ?? "agent-1",
  type: overrides.type ?? "goop-researcher",
  task: overrides.task ?? "Test task",
  claimedFiles: overrides.claimedFiles ?? [],
  startedAt: overrides.startedAt ?? Date.now(),
  parentId: overrides.parentId,
  ttl: overrides.ttl,
});

describe("merge utilities", () => {
  let cleanup: () => void;
  let testDir: string;
  let originalCwd: string;

  beforeEach(() => {
    const env = setupTestEnvironment("merge-tests");
    cleanup = env.cleanup;
    testDir = env.testDir;
    originalCwd = process.cwd();
    process.chdir(testDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    cleanup();
  });

  it("merges multiple per-agent files", async () => {
    const basePath = join(testDir, "RESEARCH.md");
    const firstPath = generateAgentFilePath(basePath, "agent-alpha");
    const secondPath = generateAgentFilePath(basePath, "agent-beta");

    writeFileSync(firstPath, "Alpha content");
    writeFileSync(secondPath, "Beta content");

    await registerAgent(createRegistration({
      id: "agent-alpha",
      task: "Alpha task",
    }));
    await registerAgent(createRegistration({
      id: "agent-beta",
      task: "Beta task",
    }));

    const result = await mergeAgentOutputs({ basePath });
    expect(result.mergedCount).toBe(2);
    expect(result.sourceFiles.sort()).toEqual([firstPath, secondPath].sort());

    const output = readFileSync(basePath, "utf-8");
    expect(output).toContain("## Agent agent-alpha");
    expect(output).toContain("Task: Alpha task");
    expect(output).toContain("Alpha content");
    expect(output).toContain("## Agent agent-beta");
    expect(output).toContain("Task: Beta task");
    expect(output).toContain("Beta content");
  });

  it("merges a single file", async () => {
    const basePath = join(testDir, "NOTES.md");
    const agentPath = generateAgentFilePath(basePath, "agent-solo");

    writeFileSync(agentPath, "Solo content");
    await registerAgent(createRegistration({
      id: "agent-solo",
      task: "Solo task",
    }));

    const result = await mergeAgentOutputs({ basePath });
    expect(result.mergedCount).toBe(1);

    const output = readFileSync(basePath, "utf-8");
    expect(output).toContain("## Agent agent-solo");
    expect(output).toContain("Task: Solo task");
    expect(output).toContain("Solo content");
  });

  it("handles empty merges when no files are found", async () => {
    const basePath = join(testDir, "EMPTY.md");

    const result = await mergeAgentOutputs({ basePath });
    expect(result.mergedCount).toBe(0);
    expect(result.sourceFiles).toHaveLength(0);
    expect(existsSync(basePath)).toBe(false);
  });

  it("removes source files when cleanup is enabled", async () => {
    const basePath = join(testDir, "CLEANUP.md");
    const agentPath = generateAgentFilePath(basePath, "agent-clean");

    writeFileSync(agentPath, "Cleanup content");
    await registerAgent(createRegistration({ id: "agent-clean" }));

    const result = await mergeAgentOutputs({ basePath, cleanup: true });
    expect(result.cleanedUp).toBe(true);
    expect(existsSync(agentPath)).toBe(false);
  });

  it("preserves source files when cleanup is disabled", async () => {
    const basePath = join(testDir, "KEEP.md");
    const agentPath = generateAgentFilePath(basePath, "agent-keep");

    writeFileSync(agentPath, "Keep content");
    await registerAgent(createRegistration({ id: "agent-keep" }));

    const result = await mergeAgentOutputs({ basePath });
    expect(result.cleanedUp).toBe(false);
    expect(existsSync(agentPath)).toBe(true);
  });
});
