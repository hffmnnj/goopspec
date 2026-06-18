import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import type { SdkPart } from "../core/sdk-compat.js";
import {
  type PluginContext,
  createDefaultWorkflowState,
  createMockPluginContext,
  setupTestEnvironment,
} from "../test-utils.js";
import {
  buildPrimingText,
  createCommandProcessorHook,
  isGoopspecCommand,
} from "./command-processor.js";

// ---------------------------------------------------------------------------
// Helper — extract the handler and assert it exists
// ---------------------------------------------------------------------------

function getHandler(ctx: PluginContext) {
  const hooks = createCommandProcessorHook(ctx);
  const handler = hooks["command.execute.before"];
  if (!handler) throw new Error("command.execute.before handler not defined");
  return handler;
}

// ---------------------------------------------------------------------------
// isGoopspecCommand
// ---------------------------------------------------------------------------

describe("isGoopspecCommand", () => {
  it("returns true for goop- prefixed commands", () => {
    expect(isGoopspecCommand("goop-plan")).toBe(true);
    expect(isGoopspecCommand("goop-execute")).toBe(true);
    expect(isGoopspecCommand("goop-accept")).toBe(true);
    expect(isGoopspecCommand("goop-status")).toBe(true);
    expect(isGoopspecCommand("goop-quick")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(isGoopspecCommand("GOOP-PLAN")).toBe(true);
    expect(isGoopspecCommand("Goop-Execute")).toBe(true);
  });

  it("returns false for non-goop commands", () => {
    expect(isGoopspecCommand("help")).toBe(false);
    expect(isGoopspecCommand("status")).toBe(false);
    expect(isGoopspecCommand("git-push")).toBe(false);
    expect(isGoopspecCommand("goopstatus")).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(isGoopspecCommand("")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// buildPrimingText
// ---------------------------------------------------------------------------

describe("buildPrimingText", () => {
  it("includes workflow ID and phase", () => {
    const text = buildPrimingText("my-workflow", "execute");
    expect(text).toContain("my-workflow");
    expect(text).toContain("execute");
  });
});

// ---------------------------------------------------------------------------
// createCommandProcessorHook
// ---------------------------------------------------------------------------

describe("createCommandProcessorHook", () => {
  let ctx: PluginContext;
  let cleanup: () => void;

  beforeEach(() => {
    const env = setupTestEnvironment("cmd-processor");
    cleanup = env.cleanup;
    ctx = createMockPluginContext({
      testDir: env.testDir,
      state: {
        activeWorkflowId: "default",
        workflows: {
          default: createDefaultWorkflowState({ phase: "execute" }),
        },
      },
    });
  });

  afterEach(() => cleanup());

  it("returns a command.execute.before handler", () => {
    const hooks = createCommandProcessorHook(ctx);
    expect(hooks["command.execute.before"]).toBeDefined();
    expect(typeof hooks["command.execute.before"]).toBe("function");
  });

  it("does not inject parts (system-transform handles context injection)", async () => {
    const handler = getHandler(ctx);

    const input = {
      command: "goop-execute",
      sessionID: "session-1",
      arguments: "",
    };
    const output: { parts: SdkPart[] } = { parts: [] };

    await handler(input, output);

    expect(output.parts.length).toBe(0);
  });

  it("ignores non-GoopSpec commands", async () => {
    const handler = getHandler(ctx);

    const input = {
      command: "help",
      sessionID: "session-1",
      arguments: "",
    };
    const output: { parts: SdkPart[] } = { parts: [] };

    await handler(input, output);

    expect(output.parts.length).toBe(0);
  });

  it("syncs active workflow when session has a different binding", async () => {
    ctx.stateManager.createWorkflow("feature-x");
    (ctx.session as { workflowId?: string }).workflowId = "feature-x";

    const handler = getHandler(ctx);

    const input = {
      command: "goop-status",
      sessionID: "session-1",
      arguments: "",
    };
    const output: { parts: SdkPart[] } = { parts: [] };

    await handler(input, output);

    expect(ctx.stateManager.getActiveWorkflowId()).toBe("feature-x");
  });

  it("does not switch workflow when session has no binding", async () => {
    (ctx.session as { workflowId?: string }).workflowId = undefined;

    const handler = getHandler(ctx);

    const input = {
      command: "goop-plan",
      sessionID: "session-1",
      arguments: "",
    };
    const output: { parts: SdkPart[] } = { parts: [] };

    await handler(input, output);

    expect(ctx.stateManager.getActiveWorkflowId()).toBe("default");
  });

  it("does not switch to a non-existent workflow", async () => {
    (ctx.session as { workflowId?: string }).workflowId = "does-not-exist";

    const handler = getHandler(ctx);

    const input = {
      command: "goop-execute",
      sessionID: "session-1",
      arguments: "",
    };
    const output: { parts: SdkPart[] } = { parts: [] };

    await handler(input, output);

    expect(ctx.stateManager.getActiveWorkflowId()).toBe("default");
  });

  it("does not switch when already on the correct workflow", async () => {
    (ctx.session as { workflowId?: string }).workflowId = "default";

    const setActiveSpy = spyOn(ctx.stateManager, "setActiveWorkflow");

    const handler = getHandler(ctx);

    const input = {
      command: "goop-accept",
      sessionID: "session-1",
      arguments: "",
    };
    const output: { parts: SdkPart[] } = { parts: [] };

    await handler(input, output);

    expect(setActiveSpy).not.toHaveBeenCalled();
    setActiveSpy.mockRestore();
  });

  it("handles errors gracefully without throwing", async () => {
    const consoleSpy = spyOn(console, "error").mockImplementation(() => {});

    const originalGetActive = ctx.stateManager.getActiveWorkflow;
    ctx.stateManager.getActiveWorkflow = () => {
      throw new Error("state corrupted");
    };

    const handler = getHandler(ctx);

    const input = {
      command: "goop-execute",
      sessionID: "session-1",
      arguments: "",
    };
    const output: { parts: SdkPart[] } = { parts: [] };

    // safeHandler catches the error — should not throw
    await handler(input, output);

    ctx.stateManager.getActiveWorkflow = originalGetActive;
    consoleSpy.mockRestore();
  });

  it("priming part includes the correct workflow after binding switch", async () => {
    ctx.stateManager.createWorkflow("my-feature");
    ctx.stateManager.setActiveWorkflow("my-feature");
    ctx.stateManager.updateWorkflow({ phase: "plan" });
    ctx.stateManager.setActiveWorkflow("default");

    (ctx.session as { workflowId?: string }).workflowId = "my-feature";

    const handler = getHandler(ctx);

    const input = {
      command: "goop-plan",
      sessionID: "session-1",
      arguments: "deep",
    };
    const output: { parts: SdkPart[] } = { parts: [] };

    await handler(input, output);

    expect(ctx.stateManager.getActiveWorkflowId()).toBe("my-feature");
    expect(output.parts.length).toBe(0);
  });
});
