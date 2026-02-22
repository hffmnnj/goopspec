import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync } from "fs";
import { join } from "path";

import { createSession } from "../../features/session/manager.js";
import { setSession } from "../../features/session/binding.js";
import { createStateManager } from "../../features/state-manager/manager.js";
import {
  createMockPluginContext,
  createMockToolContext,
  setupTestEnvironment,
  type PluginContext,
} from "../../test-utils.js";

import { createGoopStateTool } from "./index.js";

describe("goop_state tool", () => {
  let ctx: PluginContext;
  let cleanup: () => void;

  beforeEach(() => {
    const env = setupTestEnvironment("goop-state-test");
    cleanup = env.cleanup;
    ctx = createMockPluginContext({ testDir: env.testDir });
    ctx.stateManager = createStateManager(env.testDir, "test-project", ctx.config);
  });

  afterEach(() => {
    cleanup();
  });

  it("shows state output when no session is bound", async () => {
    const tool = createGoopStateTool(ctx);
    const result = await tool.execute({ action: "get" }, createMockToolContext());

    expect(result).toContain("GoopSpec");
    expect(result).toContain("Phase:");
  });

  it("uses session-bound state manager when a session is active", async () => {
    createSession(ctx.input.directory, "feat-auth");
    setSession(ctx, "feat-auth");

    const tool = createGoopStateTool(ctx);
    await tool.execute({ action: "transition", phase: "plan" }, createMockToolContext());
    const result = await tool.execute({ action: "get" }, createMockToolContext());

    const sessionStatePath = join(ctx.input.directory, ".goopspec", "sessions", "feat-auth", "state.json");
    const rootStatePath = join(ctx.input.directory, ".goopspec", "state.json");

    expect(result).toContain("Phase:");
    expect(result).toContain("plan");
    expect(existsSync(sessionStatePath)).toBe(true);
    expect(existsSync(rootStatePath)).toBe(false);
  });

  describe("set-autopilot action", () => {
    it("enables autopilot when autopilot is true", async () => {
      const tool = createGoopStateTool(ctx);
      const result = await tool.execute(
        { action: "set-autopilot", autopilot: true },
        createMockToolContext()
      );

      expect(result).toContain("Autopilot enabled");
      const state = ctx.stateManager.getState();
      expect(state.workflow.autopilot).toBe(true);
    });

    it("disables autopilot when autopilot is false", async () => {
      const tool = createGoopStateTool(ctx);
      const result = await tool.execute(
        { action: "set-autopilot", autopilot: false },
        createMockToolContext()
      );

      expect(result).toContain("Autopilot disabled");
      const state = ctx.stateManager.getState();
      expect(state.workflow.autopilot).toBe(false);
    });

    it("returns error when autopilot param is missing", async () => {
      const tool = createGoopStateTool(ctx);
      const result = await tool.execute(
        { action: "set-autopilot" },
        createMockToolContext()
      );

      expect(result).toContain("Error");
      expect(result).toContain("autopilot");
    });
  });
});
