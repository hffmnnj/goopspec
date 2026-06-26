import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

import {
  createMockPluginContext,
  createMockToolContext,
  setupTestEnvironment,
} from "../../test-utils.js";
import type { PluginContext } from "../../test-utils.js";
import { createGoopInferIntentTool } from "./index.js";

interface ParsedIntent {
  command: string;
  confidence: number;
  slots: Record<string, string>;
  autoRun: boolean;
  commandString: string;
}

function parseResult(result: string): ParsedIntent {
  const match = result.match(/<!--\s*JSON for programmatic use:\n?([\s\S]+?)\n?-->/);
  if (!match) throw new Error("No JSON comment in result");
  return JSON.parse(match[1].trim()) as ParsedIntent;
}

function withSdkClassification(
  ctx: PluginContext,
  classification: Record<string, unknown>,
): PluginContext {
  const response = JSON.stringify(classification);
  return {
    ...ctx,
    sdk: {
      ...ctx.sdk,
      complete: mock(() => Promise.resolve(response)),
    } as unknown as PluginContext["sdk"],
  };
}

describe("goop_infer_intent tool", () => {
  let ctx: PluginContext;
  let cleanup: () => void;

  beforeEach(() => {
    const env = setupTestEnvironment("goop-infer-intent");
    cleanup = env.cleanup;
    ctx = createMockPluginContext({ testDir: env.testDir });
  });

  afterEach(() => cleanup());

  it("classifies clear discuss intent without active workflow info", async () => {
    const tool = createGoopInferIntentTool(ctx);
    const result = (await tool.execute(
      { transcript: "I want to add user authentication to my app" },
      createMockToolContext(),
    )) as string;
    const parsed = parseResult(result);

    expect(parsed.command).toBe("discuss");
    expect(parsed.confidence).toBeGreaterThanOrEqual(0.7);
    expect(parsed.autoRun).toBe(false);
  });

  it("auto-runs discuss intent when no active workflow", async () => {
    const tool = createGoopInferIntentTool(ctx);
    const result = (await tool.execute(
      { transcript: "I want to add user authentication to my app", hasActiveWorkflow: false },
      createMockToolContext(),
    )) as string;
    const parsed = parseResult(result);

    expect(parsed.command).toBe("discuss");
    expect(parsed.confidence).toBeGreaterThanOrEqual(0.75);
    expect(parsed.autoRun).toBe(true);
    expect(parsed.commandString).toBe("/goop-discuss");
  });

  it("classifies clear plan intent via keywords", async () => {
    const tool = createGoopInferIntentTool(ctx);
    const result = (await tool.execute(
      { transcript: "make a plan for the implementation" },
      createMockToolContext(),
    )) as string;
    const parsed = parseResult(result);

    expect(parsed.command).toBe("plan");
    expect(parsed.confidence).toBeGreaterThanOrEqual(0.7);
  });

  it("classifies clear execute intent", async () => {
    const tool = createGoopInferIntentTool(ctx);
    const result = (await tool.execute(
      { transcript: "go ahead and implement it" },
      createMockToolContext(),
    )) as string;
    const parsed = parseResult(result);

    expect(parsed.command).toBe("execute");
    expect(parsed.confidence).toBeGreaterThanOrEqual(0.7);
  });

  it("classifies clear accept intent", async () => {
    const tool = createGoopInferIntentTool(ctx);
    const result = (await tool.execute(
      { transcript: "looks good ship it" },
      createMockToolContext(),
    )) as string;
    const parsed = parseResult(result);

    expect(parsed.command).toBe("accept");
    expect(parsed.confidence).toBeGreaterThanOrEqual(0.8);
  });

  it("classifies quick fix intent", async () => {
    const tool = createGoopInferIntentTool(ctx);
    const result = (await tool.execute(
      { transcript: "just change the button color" },
      createMockToolContext(),
    )) as string;
    const parsed = parseResult(result);

    expect(parsed.command).toBe("quick");
    expect(parsed.confidence).toBeGreaterThanOrEqual(0.7);
  });

  it("classifies ambiguous general chat", async () => {
    const tool = createGoopInferIntentTool(ctx);
    const result = (await tool.execute(
      { transcript: "what do you think about this?" },
      createMockToolContext(),
    )) as string;
    const parsed = parseResult(result);

    expect(parsed.command).toBe("chat");
    expect(parsed.autoRun).toBe(false);
  });

  it("classifies empty transcript as chat with low confidence", async () => {
    const tool = createGoopInferIntentTool(ctx);
    const result = (await tool.execute({ transcript: "" }, createMockToolContext())) as string;
    const parsed = parseResult(result);

    expect(parsed.command).toBe("chat");
    expect(parsed.confidence).toBeLessThanOrEqual(0.2);
    expect(parsed.autoRun).toBe(false);
  });

  it("classifies gibberish as chat", async () => {
    const tool = createGoopInferIntentTool(ctx);
    const result = (await tool.execute(
      { transcript: "asdfgh jkl qwerty" },
      createMockToolContext(),
    )) as string;
    const parsed = parseResult(result);

    expect(parsed.command).toBe("chat");
    expect(parsed.autoRun).toBe(false);
  });

  it("does not auto-run when active workflow is in execute phase", async () => {
    const tool = createGoopInferIntentTool(ctx);
    const result = (await tool.execute(
      {
        transcript: "I want to add user authentication to my app",
        hasActiveWorkflow: true,
        workflowPhase: "execute",
      },
      createMockToolContext(),
    )) as string;
    const parsed = parseResult(result);

    expect(parsed.command).toBe("discuss");
    expect(parsed.autoRun).toBe(false);
  });

  it("auto-runs when active workflow phase is idle", async () => {
    const tool = createGoopInferIntentTool(ctx);
    const result = (await tool.execute(
      {
        transcript: "I want to add user authentication to my app",
        hasActiveWorkflow: true,
        workflowPhase: "idle",
      },
      createMockToolContext(),
    )) as string;
    const parsed = parseResult(result);

    expect(parsed.command).toBe("discuss");
    expect(parsed.autoRun).toBe(true);
    expect(parsed.commandString).toBe("/goop-discuss");
  });

  it("does not auto-run when confidence is below threshold", async () => {
    const sdkCtx = withSdkClassification(ctx, {
      command: "discuss",
      confidence: 0.6,
      slots: {},
      reasoning: "Mentions a feature but weakly.",
    });
    const tool = createGoopInferIntentTool(sdkCtx);
    const result = (await tool.execute(
      { transcript: "maybe talk about auth", hasActiveWorkflow: false },
      createMockToolContext(),
    )) as string;
    const parsed = parseResult(result);

    expect(parsed.command).toBe("discuss");
    expect(parsed.confidence).toBe(0.6);
    expect(parsed.autoRun).toBe(false);
  });

  it("uses SDK classification when available", async () => {
    const sdkCtx = withSdkClassification(ctx, {
      command: "plan",
      confidence: 0.95,
      slots: { feature: "authentication" },
      reasoning: "Explicitly requests a plan.",
    });
    const tool = createGoopInferIntentTool(sdkCtx);
    const result = (await tool.execute(
      { transcript: "let's plan the auth flow", hasActiveWorkflow: false },
      createMockToolContext(),
    )) as string;
    const parsed = parseResult(result);

    expect(parsed.command).toBe("plan");
    expect(parsed.confidence).toBe(0.95);
    expect(parsed.autoRun).toBe(true);
    expect(parsed.commandString).toBe("/goop-plan");
    expect(parsed.slots).toEqual({ feature: "authentication" });
  });

  it("handles malformed SDK response gracefully", async () => {
    const sdkCtx = {
      ...ctx,
      sdk: {
        ...ctx.sdk,
        complete: mock(() => Promise.resolve("not valid json")),
      },
    };
    const tool = createGoopInferIntentTool(sdkCtx);
    const result = (await tool.execute(
      { transcript: "I want to add user authentication to my app" },
      createMockToolContext(),
    )) as string;
    const parsed = parseResult(result);

    expect(parsed.command).toBe("chat");
    expect(parsed.autoRun).toBe(false);
  });

  it("handles SDK failure gracefully without throwing", async () => {
    const sdkCtx = {
      ...ctx,
      sdk: {
        ...ctx.sdk,
        complete: mock(() => Promise.reject(new Error("sdk unavailable"))),
      },
    };
    const tool = createGoopInferIntentTool(sdkCtx);
    const result = (await tool.execute(
      { transcript: "I want to add user authentication to my app" },
      createMockToolContext(),
    )) as string;
    const parsed = parseResult(result);

    expect(parsed.command).toBe("chat");
    expect(parsed.autoRun).toBe(false);
  });

  it("clamps confidence to valid range for SDK responses", async () => {
    const sdkCtx = withSdkClassification(ctx, {
      command: "execute",
      confidence: 1.5,
      slots: {},
      reasoning: "Confidently above range.",
    });
    const tool = createGoopInferIntentTool(sdkCtx);
    const result = (await tool.execute(
      { transcript: "go build it", hasActiveWorkflow: false },
      createMockToolContext(),
    )) as string;
    const parsed = parseResult(result);

    expect(parsed.command).toBe("execute");
    expect(parsed.confidence).toBeLessThanOrEqual(1);
  });

  it("treats invalid SDK command as failed classification", async () => {
    const sdkCtx = withSdkClassification(ctx, {
      command: "invalid_command",
      confidence: 0.9,
      slots: {},
      reasoning: "Invalid command name.",
    });
    const tool = createGoopInferIntentTool(sdkCtx);
    const result = (await tool.execute(
      { transcript: "go ahead and implement it", hasActiveWorkflow: false },
      createMockToolContext(),
    )) as string;
    const parsed = parseResult(result);

    expect(parsed.command).toBe("chat");
    expect(parsed.confidence).toBe(0.1);
    expect(parsed.autoRun).toBe(false);
  });
});
