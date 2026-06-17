import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { join } from "path";
import { setupTestEnvironment } from "../../test-utils.js";
import { generateAgentFilePath } from "./file-patterns.js";
import {
  checkFileConflict,
  generateConflictWarning,
  suggestAgentFilePath,
} from "./conflict.js";
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

describe("conflict detection", () => {
  let cleanup: () => void;
  let testDir: string;
  let originalCwd: string;

  beforeEach(() => {
    const env = setupTestEnvironment("conflict-tests");
    cleanup = env.cleanup;
    testDir = env.testDir;
    originalCwd = process.cwd();
    process.chdir(testDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    cleanup();
  });

  it("returns no conflict when file is unclaimed", async () => {
    const filePath = join(testDir, "UNCLAIMED.md");
    const result = await checkFileConflict(filePath, "agent-a");
    expect(result.hasConflict).toBe(false);
  });

  it("detects conflict when file is claimed by another agent", async () => {
    const filePath = join(testDir, "CLAIMED.md");
    await registerAgent(createRegistration({
      id: "agent-owner",
      type: "goop-explorer",
      task: "Mapping",
      claimedFiles: [filePath],
    }));

    const result = await checkFileConflict(filePath, "agent-requester");
    expect(result.hasConflict).toBe(true);
    expect(result.claimedBy?.agentId).toBe("agent-owner");
    expect(result.claimedBy?.agentType).toBe("goop-explorer");
    expect(result.claimedBy?.task).toBe("Mapping");
    expect(result.suggestedPath).toBe(generateAgentFilePath(filePath, "agent-requester"));
    expect(result.warningMessage).toContain("agent-owner");
  });

  it("does not flag conflict when file is claimed by the same agent", async () => {
    const filePath = join(testDir, "SELF.md");
    await registerAgent(createRegistration({
      id: "agent-self",
      claimedFiles: [filePath],
    }));

    const result = await checkFileConflict(filePath, "agent-self");
    expect(result.hasConflict).toBe(false);
  });

  it("suggests per-agent file paths", () => {
    const filePath = join(testDir, "SUGGEST.md");
    const suggested = suggestAgentFilePath(filePath, "agent-7");
    expect(suggested).toBe(generateAgentFilePath(filePath, "agent-7"));
  });

  it("builds warning messages with owner details", () => {
    const suggestedPath = join(testDir, "SUGGESTED.md");
    const message = generateConflictWarning({
      hasConflict: true,
      claimedBy: {
        agentId: "agent-9",
        agentType: "goop-verifier",
        task: "Audit",
      },
      suggestedPath,
    });

    expect(message).toContain("WARNING: File Conflict Detected");
    expect(message).toContain("agent-9");
    expect(message).toContain("goop-verifier");
    expect(message).toContain("Audit");
    expect(message).toContain(suggestedPath);
  });
});
