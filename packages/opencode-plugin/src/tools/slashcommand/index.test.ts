/**
 * Tests for the slashcommand tool.
 *
 * Verifies:
 * - Known command returns its markdown content
 * - Unknown command returns an error string listing available commands
 * - Leading-slash tolerance (/goop-plan → goop-plan)
 * - goop- prefix tolerance (plan → goop-plan)
 * - No session side-effects (ctx is not mutated)
 *
 * @module tools/slashcommand/index.test
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  type PluginContext,
  createMockPluginContext,
  createMockToolContext,
  setupTestEnvironment,
} from "../../test-utils.js";
import { createSlashcommandTool } from "./index.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Scaffold a temp commands dir with sample .md files and return a context. */
function setupCommandsContext(testDir: string): {
  ctx: PluginContext;
  commandsDir: string;
} {
  const commandsDir = join(testDir, ".goopspec", "commands");
  mkdirSync(commandsDir, { recursive: true });

  writeFileSync(
    join(commandsDir, "goop-plan.md"),
    "# /goop-plan\n\nCreate specification and blueprint.\n",
  );

  writeFileSync(
    join(commandsDir, "goop-status.md"),
    "# /goop-status\n\nShow current workflow status.\n",
  );

  writeFileSync(
    join(commandsDir, "goop-execute.md"),
    "# /goop-execute\n\nBegin wave-based execution.\n",
  );

  const ctx = createMockPluginContext({ testDir });
  return { ctx, commandsDir };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("slashcommand tool", () => {
  let testDir: string;
  let cleanup: () => void;
  let ctx: PluginContext;

  beforeEach(() => {
    const env = setupTestEnvironment("slashcommand-test");
    testDir = env.testDir;
    cleanup = env.cleanup;
    ({ ctx } = setupCommandsContext(testDir));
  });

  afterEach(() => cleanup());

  describe("known command resolution", () => {
    it("returns markdown content for a known command", async () => {
      const tool = createSlashcommandTool(ctx);
      const result = await tool.execute({ command: "goop-plan" }, createMockToolContext());

      expect(result).toContain("# /goop-plan");
      expect(result).toContain("Create specification and blueprint");
    });

    it("returns content for goop-status", async () => {
      const tool = createSlashcommandTool(ctx);
      const result = await tool.execute({ command: "goop-status" }, createMockToolContext());

      expect(result).toContain("# /goop-status");
      expect(result).toContain("Show current workflow status");
    });

    it("returns content for goop-execute", async () => {
      const tool = createSlashcommandTool(ctx);
      const result = await tool.execute({ command: "goop-execute" }, createMockToolContext());

      expect(result).toContain("# /goop-execute");
    });
  });

  describe("leading-slash tolerance", () => {
    it("strips leading slash: /goop-plan → goop-plan", async () => {
      const tool = createSlashcommandTool(ctx);
      const result = await tool.execute({ command: "/goop-plan" }, createMockToolContext());

      expect(result).toContain("# /goop-plan");
      expect(result).not.toContain("not found");
    });

    it("strips leading slash: /goop-status → goop-status", async () => {
      const tool = createSlashcommandTool(ctx);
      const result = await tool.execute({ command: "/goop-status" }, createMockToolContext());

      expect(result).toContain("# /goop-status");
    });
  });

  describe("goop- prefix tolerance", () => {
    it("adds goop- prefix when missing: plan → goop-plan", async () => {
      const tool = createSlashcommandTool(ctx);
      const result = await tool.execute({ command: "plan" }, createMockToolContext());

      expect(result).toContain("# /goop-plan");
      expect(result).not.toContain("not found");
    });

    it("adds goop- prefix when missing: status → goop-status", async () => {
      const tool = createSlashcommandTool(ctx);
      const result = await tool.execute({ command: "status" }, createMockToolContext());

      expect(result).toContain("# /goop-status");
    });
  });

  describe("unknown command error", () => {
    it("returns error string for unknown command", async () => {
      const tool = createSlashcommandTool(ctx);
      const result = await tool.execute(
        { command: "goop-nonexistent-xyz" },
        createMockToolContext(),
      );

      expect(result).toContain("not found");
      expect(result).toContain("Available commands");
    });

    it("lists available commands in the error", async () => {
      const tool = createSlashcommandTool(ctx);
      const result = await tool.execute({ command: "goop-unknown" }, createMockToolContext());

      // Should list the commands we created in the temp dir
      expect(result).toContain("goop-plan");
      expect(result).toContain("goop-status");
    });

    it("returns error for empty command string", async () => {
      const tool = createSlashcommandTool(ctx);
      const result = await tool.execute({ command: "" }, createMockToolContext());

      expect(result).toContain("not found");
      expect(result).toContain("Available commands");
    });
  });

  describe("no session side-effects", () => {
    it("does not mutate ctx after executing a known command", async () => {
      const tool = createSlashcommandTool(ctx);
      const stateBefore = JSON.stringify(ctx.stateManager.getState());

      await tool.execute({ command: "goop-plan" }, createMockToolContext());

      const stateAfter = JSON.stringify(ctx.stateManager.getState());
      expect(stateAfter).toBe(stateBefore);
    });

    it("does not mutate ctx after executing an unknown command", async () => {
      const tool = createSlashcommandTool(ctx);
      const stateBefore = JSON.stringify(ctx.stateManager.getState());

      await tool.execute({ command: "goop-unknown" }, createMockToolContext());

      const stateAfter = JSON.stringify(ctx.stateManager.getState());
      expect(stateAfter).toBe(stateBefore);
    });

    it("session info is unchanged after command execution", async () => {
      const tool = createSlashcommandTool(ctx);
      const sessionBefore = { ...ctx.session };

      await tool.execute({ command: "/goop-plan" }, createMockToolContext());

      expect(ctx.session.id).toBe(sessionBefore.id);
      expect(ctx.session.agent).toBe(sessionBefore.agent);
    });
  });

  describe("graceful error handling", () => {
    it("never throws — returns error string on unexpected failure", async () => {
      // Use a context pointing at a non-existent directory to force a read error
      const badCtx = createMockPluginContext({ testDir: "/nonexistent/path/xyz" });
      const tool = createSlashcommandTool(badCtx);

      // Should not throw
      const result = await tool.execute({ command: "goop-plan" }, createMockToolContext());
      expect(typeof result).toBe("string");
    });
  });
});
