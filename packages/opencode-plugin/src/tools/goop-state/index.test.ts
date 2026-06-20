import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import {
  createMockPluginContext,
  createMockToolContext,
  setupTestEnvironment,
} from "../../test-utils.js";
import type { PluginContext } from "../../test-utils.js";
import { formatStatus } from "../goop-status/index.js";
import { createGoopStateTool } from "./index.js";

describe("goop_state tool", () => {
  let ctx: PluginContext;
  let cleanup: () => void;

  beforeEach(() => {
    const env = setupTestEnvironment("goop-state");
    cleanup = env.cleanup;
    ctx = createMockPluginContext({ testDir: env.testDir });
  });

  afterEach(() => cleanup());

  // -----------------------------------------------------------------------
  // get
  // -----------------------------------------------------------------------

  describe("action: get", () => {
    it("returns formatted state", async () => {
      const tool = createGoopStateTool(ctx);
      const result = await tool.execute({ action: "get" }, createMockToolContext());
      expect(result).toContain("GoopSpec");
      expect(result).toContain("State");
      expect(result).toContain("idle");
      expect(result).toContain("default");
    });

    it("shows spec lock status", async () => {
      ctx.stateManager.lockSpec();
      const tool = createGoopStateTool(ctx);
      const result = await tool.execute({ action: "get" }, createMockToolContext());
      expect(result).toContain("\u{1F512}");
      expect(result).toContain("Locked");
    });
  });

  // -----------------------------------------------------------------------
  // transition
  // -----------------------------------------------------------------------

  describe("action: transition", () => {
    it("transitions to a valid phase", async () => {
      const tool = createGoopStateTool(ctx);
      const result = await tool.execute(
        { action: "transition", phase: "discuss" },
        createMockToolContext(),
      );
      expect(result).toContain("discuss");
      expect(ctx.stateManager.getActiveWorkflow().phase).toBe("discuss");
    });

    it("rejects missing phase", async () => {
      const tool = createGoopStateTool(ctx);
      const result = await tool.execute({ action: "transition" }, createMockToolContext());
      expect(result).toContain("Error");
      expect(result).toContain("phase");
    });

    it("rejects invalid phase", async () => {
      const tool = createGoopStateTool(ctx);
      const result = await tool.execute(
        { action: "transition", phase: "bogus" },
        createMockToolContext(),
      );
      expect(result).toContain("Error");
      expect(result).toContain("Invalid phase");
    });

    it("rejects invalid transition without force", async () => {
      const tool = createGoopStateTool(ctx);
      // idle -> execute is not a valid transition
      const result = await tool.execute(
        { action: "transition", phase: "execute" },
        createMockToolContext(),
      );
      expect(result).toContain("Error");
      expect(result).toContain("Invalid phase transition");
    });

    it("allows forced transition", async () => {
      const tool = createGoopStateTool(ctx);
      const result = await tool.execute(
        { action: "transition", phase: "execute", force: true },
        createMockToolContext(),
      );
      expect(result).toContain("execute");
      expect(ctx.stateManager.getActiveWorkflow().phase).toBe("execute");
    });

    it("renders STATUS.md after phase transition and spec lock mutations", async () => {
      const tool = createGoopStateTool(ctx);
      const statusPath = join(ctx.sdk.directory, ".goopspec", "STATUS.md");

      await tool.execute({ action: "transition", phase: "discuss" }, createMockToolContext());
      expect(existsSync(statusPath)).toBe(true);
      expect(readFileSync(statusPath, "utf-8")).toContain("💬 discuss");

      await tool.execute({ action: "lock-spec" }, createMockToolContext());

      const state = ctx.stateManager.getState();
      const activeId = state.activeWorkflowId;
      const activeWorkflow = state.workflows[activeId];
      expect(readFileSync(statusPath, "utf-8")).toBe(
        formatStatus(activeId, activeWorkflow, ctx.stateManager.listWorkflowIds(), ctx.sdk.directory),
      );
      expect(readFileSync(statusPath, "utf-8")).toContain("✓ Spec Locked");
    });

    it("does not render STATUS.md for read-only get", async () => {
      const tool = createGoopStateTool(ctx);
      const statusPath = join(ctx.sdk.directory, ".goopspec", "STATUS.md");

      await tool.execute({ action: "get" }, createMockToolContext());

      expect(existsSync(statusPath)).toBe(false);
    });

    it("does not refresh STATUS.md for read-only get after a mutation render", async () => {
      const tool = createGoopStateTool(ctx);
      const statusPath = join(ctx.sdk.directory, ".goopspec", "STATUS.md");

      await tool.execute({ action: "transition", phase: "discuss" }, createMockToolContext());
      const beforeStat = statSync(statusPath);
      const beforeContent = readFileSync(statusPath, "utf-8");

      await new Promise((resolve) => setTimeout(resolve, 5));
      await tool.execute({ action: "get" }, createMockToolContext());

      const afterStat = statSync(statusPath);
      expect(afterStat.mtimeMs).toBe(beforeStat.mtimeMs);
      expect(readFileSync(statusPath, "utf-8")).toBe(beforeContent);
    });

    it("includes open blockers in rendered STATUS.md after mutation", async () => {
      const tool = createGoopStateTool(ctx);
      const statusPath = join(ctx.sdk.directory, ".goopspec", "STATUS.md");
      const blockerId = ctx.db.upsertBlocker("default", {
        description: "Waiting for schema approval",
        severity: "high",
        status: "open",
      });

      await tool.execute({ action: "transition", phase: "discuss" }, createMockToolContext());

      const content = readFileSync(statusPath, "utf-8");
      expect(content).toContain("### Open Blockers");
      expect(content).toContain(`#${blockerId}`);
      expect(content).toContain("[high]");
      expect(content).toContain("Waiting for schema approval");
    });
  });

  // -----------------------------------------------------------------------
  // interview
  // -----------------------------------------------------------------------

  describe("action: complete-interview / reset-interview", () => {
    it("marks interview complete", async () => {
      const tool = createGoopStateTool(ctx);
      const result = await tool.execute({ action: "complete-interview" }, createMockToolContext());
      expect(result).toContain("complete");
      expect(ctx.stateManager.getActiveWorkflow().interviewComplete).toBe(true);
    });

    it("resets interview", async () => {
      ctx.stateManager.completeInterview();
      const tool = createGoopStateTool(ctx);
      const result = await tool.execute({ action: "reset-interview" }, createMockToolContext());
      expect(result).toContain("reset");
      expect(ctx.stateManager.getActiveWorkflow().interviewComplete).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // spec lock
  // -----------------------------------------------------------------------

  describe("action: lock-spec / unlock-spec", () => {
    it("locks the spec", async () => {
      const tool = createGoopStateTool(ctx);
      const result = await tool.execute({ action: "lock-spec" }, createMockToolContext());
      expect(result).toContain("locked");
      expect(ctx.stateManager.getActiveWorkflow().specLocked).toBe(true);
    });

    it("unlocks the spec", async () => {
      ctx.stateManager.lockSpec();
      const tool = createGoopStateTool(ctx);
      const result = await tool.execute({ action: "unlock-spec" }, createMockToolContext());
      expect(result).toContain("unlocked");
      expect(ctx.stateManager.getActiveWorkflow().specLocked).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // acceptance
  // -----------------------------------------------------------------------

  describe("action: confirm-acceptance / reset-acceptance", () => {
    it("confirms acceptance", async () => {
      const tool = createGoopStateTool(ctx);
      const result = await tool.execute({ action: "confirm-acceptance" }, createMockToolContext());
      expect(result).toContain("confirmed");
      expect(ctx.stateManager.getActiveWorkflow().acceptanceConfirmed).toBe(true);
    });

    it("resets acceptance", async () => {
      ctx.stateManager.confirmAcceptance();
      const tool = createGoopStateTool(ctx);
      const result = await tool.execute({ action: "reset-acceptance" }, createMockToolContext());
      expect(result).toContain("reset");
      expect(ctx.stateManager.getActiveWorkflow().acceptanceConfirmed).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // set-mode
  // -----------------------------------------------------------------------

  describe("action: set-mode", () => {
    it("sets a valid mode", async () => {
      const tool = createGoopStateTool(ctx);
      const result = await tool.execute(
        { action: "set-mode", mode: "comprehensive" },
        createMockToolContext(),
      );
      expect(result).toContain("comprehensive");
      expect(ctx.stateManager.getActiveWorkflow().mode).toBe("comprehensive");
    });

    it("rejects missing mode", async () => {
      const tool = createGoopStateTool(ctx);
      const result = await tool.execute({ action: "set-mode" }, createMockToolContext());
      expect(result).toContain("Error");
      expect(result).toContain("mode");
    });

    it("rejects invalid mode", async () => {
      const tool = createGoopStateTool(ctx);
      const result = await tool.execute(
        { action: "set-mode", mode: "turbo" },
        createMockToolContext(),
      );
      expect(result).toContain("Error");
      expect(result).toContain("Invalid mode");
    });
  });

  // -----------------------------------------------------------------------
  // set-depth
  // -----------------------------------------------------------------------

  describe("action: set-depth", () => {
    it("sets a valid depth", async () => {
      const tool = createGoopStateTool(ctx);
      const result = await tool.execute(
        { action: "set-depth", depth: "deep" },
        createMockToolContext(),
      );
      expect(result).toContain("deep");
      expect(ctx.stateManager.getActiveWorkflow().depth).toBe("deep");
    });

    it("rejects missing depth", async () => {
      const tool = createGoopStateTool(ctx);
      const result = await tool.execute({ action: "set-depth" }, createMockToolContext());
      expect(result).toContain("Error");
    });

    it("rejects invalid depth", async () => {
      const tool = createGoopStateTool(ctx);
      const result = await tool.execute(
        { action: "set-depth", depth: "ultra" },
        createMockToolContext(),
      );
      expect(result).toContain("Error");
      expect(result).toContain("Invalid depth");
    });
  });

  // -----------------------------------------------------------------------
  // set-autopilot
  // -----------------------------------------------------------------------

  describe("action: set-autopilot", () => {
    it("enables autopilot", async () => {
      const tool = createGoopStateTool(ctx);
      const result = await tool.execute(
        { action: "set-autopilot", autopilot: true },
        createMockToolContext(),
      );
      expect(result).toContain("ON");
      expect(ctx.stateManager.getActiveWorkflow().autopilot).toBe(true);
    });

    it("enables lazy autopilot", async () => {
      const tool = createGoopStateTool(ctx);
      const result = await tool.execute(
        { action: "set-autopilot", autopilot: true, lazy: true },
        createMockToolContext(),
      );
      expect(result).toContain("lazy");
      expect(ctx.stateManager.getActiveWorkflow().lazyAutopilot).toBe(true);
    });

    it("disables autopilot and clears lazy", async () => {
      ctx.stateManager.updateWorkflow({ autopilot: true, lazyAutopilot: true });
      const tool = createGoopStateTool(ctx);
      const result = await tool.execute(
        { action: "set-autopilot", autopilot: false },
        createMockToolContext(),
      );
      expect(result).toContain("OFF");
      expect(ctx.stateManager.getActiveWorkflow().autopilot).toBe(false);
      expect(ctx.stateManager.getActiveWorkflow().lazyAutopilot).toBe(false);
    });

    it("rejects missing autopilot param", async () => {
      const tool = createGoopStateTool(ctx);
      const result = await tool.execute({ action: "set-autopilot" }, createMockToolContext());
      expect(result).toContain("Error");
      expect(result).toContain("autopilot");
    });
  });

  // -----------------------------------------------------------------------
  // update-wave
  // -----------------------------------------------------------------------

  describe("action: update-wave", () => {
    it("updates wave progress", async () => {
      const tool = createGoopStateTool(ctx);
      const result = await tool.execute(
        { action: "update-wave", currentWave: 3, totalWaves: 8 },
        createMockToolContext(),
      );
      expect(result).toContain("3/8");
      const wf = ctx.stateManager.getActiveWorkflow();
      expect(wf.currentWave).toBe(3);
      expect(wf.totalWaves).toBe(8);
    });

    it("rejects missing wave params", async () => {
      const tool = createGoopStateTool(ctx);
      const result = await tool.execute(
        { action: "update-wave", currentWave: 1 },
        createMockToolContext(),
      );
      expect(result).toContain("Error");
      expect(result).toContain("totalWaves");
    });
  });

  // -----------------------------------------------------------------------
  // reset
  // -----------------------------------------------------------------------

  describe("action: reset", () => {
    it("resets the active workflow", async () => {
      ctx.stateManager.transitionPhase("discuss");
      ctx.stateManager.lockSpec();
      ctx.stateManager.setMode("comprehensive");

      const tool = createGoopStateTool(ctx);
      const result = await tool.execute({ action: "reset" }, createMockToolContext());
      expect(result).toContain("reset");

      const wf = ctx.stateManager.getActiveWorkflow();
      expect(wf.phase).toBe("idle");
      expect(wf.specLocked).toBe(false);
      expect(wf.mode).toBe("standard");
    });
  });

  // -----------------------------------------------------------------------
  // workflow CRUD
  // -----------------------------------------------------------------------

  describe("action: list-workflows", () => {
    it("lists all workflows in a table", async () => {
      ctx.stateManager.createWorkflow("feat-auth");
      const tool = createGoopStateTool(ctx);
      const result = await tool.execute({ action: "list-workflows" }, createMockToolContext());
      expect(result).toContain("Workflows");
      expect(result).toContain("default");
      expect(result).toContain("feat-auth");
      expect(result).toContain("|");
    });
  });

  describe("action: set-active-workflow", () => {
    it("switches the active workflow", async () => {
      ctx.stateManager.createWorkflow("feat-auth");
      const tool = createGoopStateTool(ctx);
      const result = await tool.execute(
        { action: "set-active-workflow", workflowId: "feat-auth" },
        createMockToolContext(),
      );
      expect(result).toContain("feat-auth");
      expect(ctx.stateManager.getActiveWorkflowId()).toBe("feat-auth");
    });

    it("rejects missing workflowId", async () => {
      const tool = createGoopStateTool(ctx);
      const result = await tool.execute({ action: "set-active-workflow" }, createMockToolContext());
      expect(result).toContain("Error");
      expect(result).toContain("workflowId");
    });

    it("rejects nonexistent workflow", async () => {
      const tool = createGoopStateTool(ctx);
      const result = await tool.execute(
        { action: "set-active-workflow", workflowId: "nope" },
        createMockToolContext(),
      );
      expect(result).toContain("Error");
    });
  });

  describe("action: create-workflow", () => {
    it("creates a new workflow", async () => {
      const tool = createGoopStateTool(ctx);
      const result = await tool.execute(
        { action: "create-workflow", workflowId: "feat-payments" },
        createMockToolContext(),
      );
      expect(result).toContain("feat-payments");
      expect(result).toContain("created");
      expect(ctx.stateManager.listWorkflowIds()).toContain("feat-payments");
    });

    it("rejects missing workflowId", async () => {
      const tool = createGoopStateTool(ctx);
      const result = await tool.execute({ action: "create-workflow" }, createMockToolContext());
      expect(result).toContain("Error");
      expect(result).toContain("workflowId");
    });

    it("is idempotent for existing workflow", async () => {
      ctx.stateManager.createWorkflow("feat-auth");
      const tool = createGoopStateTool(ctx);
      const result = await tool.execute(
        { action: "create-workflow", workflowId: "feat-auth" },
        createMockToolContext(),
      );
      expect(result).toContain("feat-auth");
      // Should not throw or duplicate
      expect(ctx.stateManager.listWorkflowIds().filter((id) => id === "feat-auth")).toHaveLength(1);
    });
  });

  // -----------------------------------------------------------------------
  // error handling
  // -----------------------------------------------------------------------

  describe("error handling", () => {
    it("catches and returns errors without throwing", async () => {
      const brokenCtx: PluginContext = {
        ...ctx,
        stateManager: {
          ...ctx.stateManager,
          getState: () => {
            throw new Error("corrupt state");
          },
        },
      };

      const tool = createGoopStateTool(brokenCtx);
      const result = await tool.execute({ action: "get" }, createMockToolContext());
      expect(result).toContain("Error");
      expect(result).toContain("corrupt state");
    });
  });
});
