import { afterEach, beforeEach, describe, expect, it } from "bun:test";

import type { PluginContext } from "../../test-utils.js";
import {
  createMockPluginContext,
  createMockToolContext,
  setupTestEnvironment,
} from "../../test-utils.js";
import { createGoopCheckpointTool } from "./index.js";

describe("goop_checkpoint tool", () => {
  let ctx: PluginContext;
  let cleanup: () => void;

  beforeEach(() => {
    const env = setupTestEnvironment("goop-checkpoint");
    cleanup = env.cleanup;
    ctx = createMockPluginContext({ testDir: env.testDir });
  });

  afterEach(() => cleanup());

  const toolCtx = createMockToolContext();

  // -----------------------------------------------------------------------
  // list action
  // -----------------------------------------------------------------------

  describe("action: list", () => {
    it("returns empty message when no checkpoints", async () => {
      const tool = createGoopCheckpointTool(ctx);
      const result = await tool.execute({ action: "list" }, toolCtx);

      expect(result).toContain("No checkpoints saved");
    });

    it("lists saved checkpoints", async () => {
      const tool = createGoopCheckpointTool(ctx);

      await tool.execute({ action: "save", id: "wave-1-done" }, toolCtx);
      await tool.execute({ action: "save", id: "wave-2-done" }, toolCtx);

      const result = await tool.execute({ action: "list" }, toolCtx);

      expect(result).toContain("Saved Checkpoints");
      expect(result).toContain("wave-1-done");
      expect(result).toContain("wave-2-done");
    });
  });

  // -----------------------------------------------------------------------
  // save action
  // -----------------------------------------------------------------------

  describe("action: save", () => {
    it("saves a checkpoint", async () => {
      const tool = createGoopCheckpointTool(ctx);
      const result = await tool.execute({ action: "save", id: "my-checkpoint" }, toolCtx);

      expect(result).toContain("Checkpoint saved: my-checkpoint");
    });

    it("saves a checkpoint with context", async () => {
      const tool = createGoopCheckpointTool(ctx);
      const result = await tool.execute(
        {
          action: "save",
          id: "with-ctx",
          context: { note: "halfway through wave 2", files: "3 modified" },
        },
        toolCtx,
      );

      expect(result).toContain("Checkpoint saved: with-ctx");

      // Verify context is preserved on load
      const loaded = await tool.execute({ action: "load", id: "with-ctx" }, toolCtx);
      expect(loaded).toContain("halfway through wave 2");
    });

    it("requires id for save", async () => {
      const tool = createGoopCheckpointTool(ctx);
      const result = await tool.execute({ action: "save" }, toolCtx);

      expect(result).toContain("Error");
      expect(result).toContain("id");
    });
  });

  // -----------------------------------------------------------------------
  // load action
  // -----------------------------------------------------------------------

  describe("action: load", () => {
    it("loads a saved checkpoint", async () => {
      const tool = createGoopCheckpointTool(ctx);

      // Save first
      await tool.execute({ action: "save", id: "test-cp" }, toolCtx);

      // Load
      const result = await tool.execute({ action: "load", id: "test-cp" }, toolCtx);

      expect(result).toContain("Checkpoint Loaded: test-cp");
      expect(result).toContain("Saved at:");
      expect(result).toContain("Workflow:");
      expect(result).toContain("Phase:");
    });

    it("restores state from checkpoint", async () => {
      const tool = createGoopCheckpointTool(ctx);

      // Modify state, then save
      ctx.stateManager.transitionPhase("plan", true);
      ctx.stateManager.lockSpec();
      await tool.execute({ action: "save", id: "locked-state" }, toolCtx);

      // Change state further
      ctx.stateManager.unlockSpec();
      ctx.stateManager.transitionPhase("idle", true);

      // Load should restore
      await tool.execute({ action: "load", id: "locked-state" }, toolCtx);

      const restored = ctx.stateManager.getActiveWorkflow();
      expect(restored.phase).toBe("plan");
      expect(restored.specLocked).toBe(true);
    });

    it("returns not found for missing checkpoint", async () => {
      const tool = createGoopCheckpointTool(ctx);
      const result = await tool.execute({ action: "load", id: "nonexistent" }, toolCtx);

      expect(result).toContain("not found");
    });

    it("requires id for load", async () => {
      const tool = createGoopCheckpointTool(ctx);
      const result = await tool.execute({ action: "load" }, toolCtx);

      expect(result).toContain("Error");
      expect(result).toContain("id");
    });

    it("shows context in loaded checkpoint", async () => {
      const tool = createGoopCheckpointTool(ctx);

      await tool.execute(
        {
          action: "save",
          id: "ctx-cp",
          context: { task: "W2.T3", progress: "50%" },
        },
        toolCtx,
      );

      const result = await tool.execute({ action: "load", id: "ctx-cp" }, toolCtx);

      expect(result).toContain("Context:");
      expect(result).toContain("W2.T3");
      expect(result).toContain("50%");
    });
  });

  // -----------------------------------------------------------------------
  // error handling
  // -----------------------------------------------------------------------

  it("handles errors gracefully", async () => {
    const broken = createMockPluginContext({ testDir: "/tmp/nonexistent" });
    broken.stateManager.getState = () => {
      throw new Error("state corrupted");
    };

    const tool = createGoopCheckpointTool(broken);
    const result = await tool.execute({ action: "save", id: "fail" }, toolCtx);

    expect(result).toContain("Error in goop_checkpoint");
    expect(result).toContain("state corrupted");
  });
});
