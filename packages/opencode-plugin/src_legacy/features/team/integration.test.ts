/**
 * Integration tests for team coordination.
 * Tests end-to-end scenarios for parallel agent coordination.
 *
 * @module features/team/integration.test
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { join } from "path";
import { mkdirSync, writeFileSync, existsSync, rmSync } from "fs";
import {
  registerAgent,
  deregisterAgent,
  getActiveAgents,
  checkFileConflict,
  cleanupStaleAgents,
  cleanupAllAgents,
  generateAgentFilePath,
  mergeAgentOutputs,
} from "./index.js";

describe("team coordination integration", () => {
  let testDir: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    testDir = join("/tmp", `team-int-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(join(testDir, ".goopspec", "team"), { recursive: true });
    process.chdir(testDir);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    // Clean up registry before removing directory
    try {
      await cleanupAllAgents();
    } catch {
      // Ignore cleanup errors
    }
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe("parallel agent coordination", () => {
    it("allows two researchers to write to separate files", async () => {
      const agent1 = {
        id: "res-001",
        type: "goop-researcher",
        task: "Research A",
        claimedFiles: [] as string[],
        startedAt: Date.now(),
      };
      const agent2 = {
        id: "res-002",
        type: "goop-researcher",
        task: "Research B",
        claimedFiles: [] as string[],
        startedAt: Date.now(),
      };

      await registerAgent(agent1);
      await registerAgent(agent2);

      const active = await getActiveAgents();
      expect(active.length).toBe(2);

      // Each writes to their per-agent file (short ID normalizes: removes hyphens, truncates to 7 chars)
      const file1 = generateAgentFilePath("RESEARCH.md", "res-001");
      const file2 = generateAgentFilePath("RESEARCH.md", "res-002");

      expect(file1).not.toBe(file2);
      expect(file1).toContain("res001"); // Hyphens removed in short ID
      expect(file2).toContain("res002");
    });

    it("detects conflict when agent tries to write claimed file", async () => {
      const filePath = "src/index.ts";
      await registerAgent({
        id: "exec-001",
        type: "goop-executor",
        task: "Modify index",
        claimedFiles: [filePath],
        startedAt: Date.now(),
      });

      // Another agent tries to write same file
      const conflict = await checkFileConflict(filePath, "exec-002");
      expect(conflict.hasConflict).toBe(true);
      expect(conflict.claimedBy?.agentId).toBe("exec-001");
      expect(conflict.suggestedPath).toBeDefined();
    });

    it("allows same agent to write its own claimed file", async () => {
      const filePath = "src/my-file.ts";
      await registerAgent({
        id: "exec-001",
        type: "goop-executor",
        task: "Modify file",
        claimedFiles: [filePath],
        startedAt: Date.now(),
      });

      // Same agent writing to its own file
      const conflict = await checkFileConflict(filePath, "exec-001");
      expect(conflict.hasConflict).toBe(false);
    });
  });

  describe("merge workflow", () => {
    it("combines per-agent outputs into canonical file", async () => {
      const researchDir = join(testDir, ".goopspec");

      // Write per-agent files
      writeFileSync(
        join(researchDir, "RESEARCH-abc123.md"),
        "# Research from Agent A\n\nFindings A"
      );
      writeFileSync(
        join(researchDir, "RESEARCH-def456.md"),
        "# Research from Agent B\n\nFindings B"
      );

      // Merge
      const result = await mergeAgentOutputs({
        basePath: join(researchDir, "RESEARCH.md"),
        cleanup: false,
      });

      expect(result.mergedCount).toBe(2);
      expect(result.sourceFiles.length).toBe(2);
      expect(result.outputPath).toContain("RESEARCH.md");
    });
  });

  describe("cleanup workflow", () => {
    it("removes stale agents past TTL", async () => {
      const now = Date.now();

      // Register agent with short TTL (already expired)
      await registerAgent({
        id: "stale-001",
        type: "goop-executor",
        task: "Old task",
        claimedFiles: [] as string[],
        startedAt: now - 60000, // 1 minute ago
        ttl: 30000, // 30 second TTL (expired)
      });

      // Register fresh agent
      await registerAgent({
        id: "fresh-001",
        type: "goop-executor",
        task: "New task",
        claimedFiles: [] as string[],
        startedAt: now,
      });

      const result = await cleanupStaleAgents();
      expect(result.cleaned).toContain("stale-001");
      expect(result.remaining).toBe(1);
    });

    it("clears all agents on full cleanup", async () => {
      await registerAgent({
        id: "a1",
        type: "exec",
        task: "t1",
        claimedFiles: [] as string[],
        startedAt: Date.now(),
      });
      await registerAgent({
        id: "a2",
        type: "exec",
        task: "t2",
        claimedFiles: [] as string[],
        startedAt: Date.now(),
      });

      const result = await cleanupAllAgents();
      expect(result.cleaned.length).toBe(2);
      expect(result.remaining).toBe(0);
    });
  });

  describe("agent lifecycle", () => {
    it("registers and deregisters agents correctly", async () => {
      const agent = {
        id: "lifecycle-001",
        type: "goop-executor",
        task: "Test lifecycle",
        claimedFiles: ["file.ts"] as string[],
        startedAt: Date.now(),
      };

      // Register
      const regResult = await registerAgent(agent);
      expect(regResult.ok).toBe(true);

      let active = await getActiveAgents();
      expect(active.length).toBe(1);
      expect(active[0].id).toBe("lifecycle-001");

      // Deregister
      const deregResult = await deregisterAgent("lifecycle-001");
      expect(deregResult.ok).toBe(true);

      active = await getActiveAgents();
      expect(active.length).toBe(0);
    });

    it("tracks parent-child relationships", async () => {
      const parent = {
        id: "parent-001",
        type: "goop-orchestrator",
        task: "Orchestrate",
        claimedFiles: [] as string[],
        startedAt: Date.now(),
      };
      const child = {
        id: "child-001",
        type: "goop-executor",
        task: "Execute",
        claimedFiles: [] as string[],
        parentId: "parent-001",
        startedAt: Date.now(),
      };

      await registerAgent(parent);
      await registerAgent(child);

      const active = await getActiveAgents();
      const childAgent = active.find((a) => a.id === "child-001");
      expect(childAgent?.parentId).toBe("parent-001");
    });
  });

  describe("backward compatibility", () => {
    it("single-agent workflow works without registry", async () => {
      // No registration, just file operations (short ID normalizes: removes hyphens, truncates to 7 chars)
      const agentFile = generateAgentFilePath("output.txt", "solo-agent");
      expect(agentFile).toContain("soloage"); // "solo-agent" -> "soloagent" -> first 7 chars

      // Conflict check returns no conflict for unclaimed file
      const conflict = await checkFileConflict("any-file.ts", "solo-agent");
      expect(conflict.hasConflict).toBe(false);
    });

    it("works with empty registry", async () => {
      const active = await getActiveAgents();
      expect(active).toEqual([]);

      const conflict = await checkFileConflict("file.ts", "any-agent");
      expect(conflict.hasConflict).toBe(false);
    });
  });
});
