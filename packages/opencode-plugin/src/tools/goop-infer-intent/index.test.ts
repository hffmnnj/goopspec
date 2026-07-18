import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

import {
  createMockPluginContext,
  createMockToolContext,
  setupTestEnvironment,
} from "../../test-utils.js";
import type { PluginContext } from "../../test-utils.js";
import { classifyByKeywords, createGoopInferIntentTool } from "./index.js";

interface ParsedIntent {
  command: string;
  confidence: number;
  slots: Record<string, string>;
  autoRun: boolean;
  commandString: string;
  mutation?: {
    applied: boolean;
    action: string;
    result?: string;
    error?: string;
  };
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

  it("preserves the legacy result when mutation options are omitted", async () => {
    const tool = createGoopInferIntentTool(ctx);
    const result = (await tool.execute(
      { transcript: "make a plan for the implementation", hasActiveWorkflow: false },
      createMockToolContext(),
    )) as string;

    expect(result).toBe(`## Intent Classification

**Transcript:** "make a plan for the implementation"
${"**Command:** `/goop-plan` (plan)  "}
**Confidence:** 0.85 (HIGH)
**Slots:** none

**Reasoning:** Keyword match for plan

---
**Auto-run:** ✅ Running \`/goop-plan\` automatically...

<!-- JSON for programmatic use:
{"command":"plan","confidence":0.85,"slots":{},"autoRun":true,"commandString":"/goop-plan"}
-->`);
    expect(parseResult(result).mutation).toBeUndefined();
  });

  it("classifies workflow creation and phase transition keywords with required slots", () => {
    expect(classifyByKeywords("create workflow auth-refresh")).toMatchObject({
      command: "create-workflow",
      slots: { workflowId: "auth-refresh" },
    });
    expect(classifyByKeywords("transition to plan")).toMatchObject({
      command: "transition",
      slots: { targetPhase: "plan" },
    });
  });

  it("does not auto-apply below the confidence threshold", async () => {
    const createWorkflow = mock(ctx.stateManager.createWorkflow);
    const sdkCtx = withSdkClassification(ctx, {
      command: "create-workflow",
      confidence: 0.89,
      slots: { workflowId: "auth-refresh" },
      reasoning: "Explicit workflow request.",
    });
    sdkCtx.stateManager.createWorkflow = createWorkflow;
    const result = (await createGoopInferIntentTool(sdkCtx).execute(
      { transcript: "create workflow auth-refresh", autoApply: true },
      createMockToolContext(),
    )) as string;

    expect(parseResult(result).mutation).toMatchObject({
      applied: false,
      action: "create-workflow",
    });
    expect(createWorkflow).not.toHaveBeenCalled();
  });

  it("auto-applies a high-confidence workflow creation and logs an observation", async () => {
    const createWorkflow = mock(ctx.stateManager.createWorkflow);
    const setActiveWorkflow = mock(ctx.stateManager.setActiveWorkflow);
    const appendADL = mock(ctx.stateManager.appendADL);
    const sdkCtx = withSdkClassification(ctx, {
      command: "create-workflow",
      confidence: 0.95,
      slots: { workflowId: "auth-refresh" },
      reasoning: "Explicit workflow request.",
    });
    sdkCtx.stateManager.createWorkflow = createWorkflow;
    sdkCtx.stateManager.setActiveWorkflow = setActiveWorkflow;
    sdkCtx.stateManager.appendADL = appendADL;
    const result = (await createGoopInferIntentTool(sdkCtx).execute(
      { transcript: "create workflow auth-refresh", autoApply: true },
      createMockToolContext(),
    )) as string;

    expect(parseResult(result).mutation).toMatchObject({
      applied: true,
      action: "create-workflow",
    });
    expect(createWorkflow).toHaveBeenCalledWith("auth-refresh");
    expect(setActiveWorkflow).toHaveBeenCalledWith("auth-refresh");
    expect(appendADL).toHaveBeenCalledWith(expect.objectContaining({ type: "observation" }));
  });

  it("rejects auto-apply when workflow slots are missing", async () => {
    const createWorkflow = mock(ctx.stateManager.createWorkflow);
    const sdkCtx = withSdkClassification(ctx, {
      command: "create-workflow",
      confidence: 0.95,
      slots: {},
      reasoning: "Workflow name was omitted.",
    });
    sdkCtx.stateManager.createWorkflow = createWorkflow;
    const result = (await createGoopInferIntentTool(sdkCtx).execute(
      { transcript: "create a workflow", autoApply: true },
      createMockToolContext(),
    )) as string;

    expect(parseResult(result).mutation).toMatchObject({
      applied: false,
      error: "A single kebab-case workflowId slot is required.",
    });
    expect(createWorkflow).not.toHaveBeenCalled();
  });

  it("never auto-applies an invalid transition target", async () => {
    const transitionPhase = mock(ctx.stateManager.transitionPhase);
    const sdkCtx = withSdkClassification(ctx, {
      command: "transition",
      confidence: 0.99,
      slots: { targetPhase: "reset" },
      reasoning: "Requests an irreversible reset.",
    });
    sdkCtx.stateManager.transitionPhase = transitionPhase;
    const result = (await createGoopInferIntentTool(sdkCtx).execute(
      { transcript: "reset the workflow", autoApply: true },
      createMockToolContext(),
    )) as string;

    expect(parseResult(result).mutation).toMatchObject({
      applied: false,
      action: "transition",
      error: "A single valid targetPhase slot is required.",
    });
    expect(transitionPhase).not.toHaveBeenCalled();
  });

  it("rejects auto-apply transition to accept because it requires an explicit audit", async () => {
    const transitionPhase = mock(ctx.stateManager.transitionPhase);
    const sdkCtx = withSdkClassification(ctx, {
      command: "transition",
      confidence: 0.99,
      slots: { targetPhase: "accept" },
      reasoning: "Wants to approve the workflow.",
    });
    sdkCtx.stateManager.transitionPhase = transitionPhase;
    const state = sdkCtx.stateManager.getState();
    state.workflows[state.activeWorkflowId].phase = "execute";
    const result = (await createGoopInferIntentTool(sdkCtx).execute(
      { transcript: "accept the workflow", autoApply: true },
      createMockToolContext(),
    )) as string;

    expect(parseResult(result).mutation).toMatchObject({
      applied: false,
      action: "transition",
      error:
        "Cannot auto-apply transition to accept because execution-gate evidence requires an explicit audit.",
    });
    expect(transitionPhase).not.toHaveBeenCalled();
  });

  it("rejects auto-apply transition to plan before interview is complete", async () => {
    const transitionPhase = mock(ctx.stateManager.transitionPhase);
    const sdkCtx = withSdkClassification(ctx, {
      command: "transition",
      confidence: 0.99,
      slots: { targetPhase: "plan" },
      reasoning: "Wants to start planning.",
    });
    sdkCtx.stateManager.transitionPhase = transitionPhase;
    const state = sdkCtx.stateManager.getState();
    state.workflows[state.activeWorkflowId].phase = "discuss";
    state.workflows[state.activeWorkflowId].interviewComplete = false;
    const result = (await createGoopInferIntentTool(sdkCtx).execute(
      { transcript: "transition to plan", autoApply: true },
      createMockToolContext(),
    )) as string;

    expect(parseResult(result).mutation).toMatchObject({
      applied: false,
      action: "transition",
      error: "Cannot transition to plan before the interview is complete.",
    });
    expect(transitionPhase).not.toHaveBeenCalled();
  });

  it("rejects auto-apply transition to plan when requirements document is missing", async () => {
    const transitionPhase = mock(ctx.stateManager.transitionPhase);
    const appendADL = mock(ctx.stateManager.appendADL);
    const sdkCtx = withSdkClassification(ctx, {
      command: "transition",
      confidence: 0.99,
      slots: { targetPhase: "plan" },
      reasoning: "Wants to start planning.",
    });
    sdkCtx.stateManager.transitionPhase = transitionPhase;
    sdkCtx.stateManager.appendADL = appendADL;
    const state = sdkCtx.stateManager.getState();
    state.workflows[state.activeWorkflowId].phase = "discuss";
    state.workflows[state.activeWorkflowId].interviewComplete = true;
    // No requirements document for the active workflow.
    const result = (await createGoopInferIntentTool(sdkCtx).execute(
      { transcript: "transition to plan", autoApply: true },
      createMockToolContext(),
    )) as string;

    expect(parseResult(result).mutation).toMatchObject({
      applied: false,
      action: "transition",
      error: "Cannot transition to plan before a requirements document exists.",
    });
    expect(transitionPhase).not.toHaveBeenCalled();
  });

  it("rejects auto-apply transition to execute before the specification is locked", async () => {
    const transitionPhase = mock(ctx.stateManager.transitionPhase);
    const sdkCtx = withSdkClassification(ctx, {
      command: "transition",
      confidence: 0.99,
      slots: { targetPhase: "execute" },
      reasoning: "Wants to start executing.",
    });
    sdkCtx.stateManager.transitionPhase = transitionPhase;
    const state = sdkCtx.stateManager.getState();
    state.workflows[state.activeWorkflowId].phase = "plan";
    state.workflows[state.activeWorkflowId].specLocked = false;
    const result = (await createGoopInferIntentTool(sdkCtx).execute(
      { transcript: "transition to execute", autoApply: true },
      createMockToolContext(),
    )) as string;

    expect(parseResult(result).mutation).toMatchObject({
      applied: false,
      action: "transition",
      error: "Cannot transition to execute before the specification is locked.",
    });
    expect(transitionPhase).not.toHaveBeenCalled();
  });

  it("auto-applies a valid transition to plan and logs an observation", async () => {
    const transitionPhase = mock(ctx.stateManager.transitionPhase);
    const appendADL = mock(ctx.stateManager.appendADL);
    const sdkCtx = withSdkClassification(ctx, {
      command: "transition",
      confidence: 0.95,
      slots: { targetPhase: "plan" },
      reasoning: "Wants to start planning.",
    });
    sdkCtx.stateManager.transitionPhase = transitionPhase;
    sdkCtx.stateManager.appendADL = appendADL;
    const state = sdkCtx.stateManager.getState();
    state.workflows[state.activeWorkflowId].phase = "discuss";
    state.workflows[state.activeWorkflowId].interviewComplete = true;
    sdkCtx.db.upsertDocument(state.activeWorkflowId, "requirements", "# Requirements\n\nItems.");

    const result = (await createGoopInferIntentTool(sdkCtx).execute(
      { transcript: "transition to plan", autoApply: true },
      createMockToolContext(),
    )) as string;

    expect(parseResult(result).mutation).toMatchObject({
      applied: true,
      action: "transition",
      result: 'Phase transitioned to "plan".',
    });
    expect(transitionPhase).toHaveBeenCalledWith("plan");
    expect(appendADL).toHaveBeenCalledWith(expect.objectContaining({ type: "observation" }));
  });

  it("rejects auto-apply when confidence is at or below the hard floor of 0.85", async () => {
    const createWorkflow = mock(ctx.stateManager.createWorkflow);
    const transitionPhase = mock(ctx.stateManager.transitionPhase);
    const sdkCtx = withSdkClassification(ctx, {
      command: "create-workflow",
      confidence: 0.85,
      slots: { workflowId: "auth-refresh" },
      reasoning: "Explicit workflow request but at the floor.",
    });
    sdkCtx.stateManager.createWorkflow = createWorkflow;
    sdkCtx.stateManager.transitionPhase = transitionPhase;

    const result = (await createGoopInferIntentTool(sdkCtx).execute(
      {
        transcript: "create workflow auth-refresh",
        autoApply: true,
        confidenceThreshold: 0.8,
      },
      createMockToolContext(),
    )) as string;

    expect(parseResult(result).mutation).toMatchObject({
      applied: false,
      action: "create-workflow",
      error: "Confidence must be greater than 0.85 for auto-apply.",
    });
    expect(createWorkflow).not.toHaveBeenCalled();
    expect(transitionPhase).not.toHaveBeenCalled();
  });

  it("does not auto-apply when autoApply is false even if confidenceThreshold is set", async () => {
    const createWorkflow = mock(ctx.stateManager.createWorkflow);
    const setActiveWorkflow = mock(ctx.stateManager.setActiveWorkflow);
    const sdkCtx = withSdkClassification(ctx, {
      command: "create-workflow",
      confidence: 0.99,
      slots: { workflowId: "auth-refresh" },
      reasoning: "Explicit workflow request.",
    });
    sdkCtx.stateManager.createWorkflow = createWorkflow;
    sdkCtx.stateManager.setActiveWorkflow = setActiveWorkflow;

    const result = (await createGoopInferIntentTool(sdkCtx).execute(
      {
        transcript: "create workflow auth-refresh",
        autoApply: false,
        confidenceThreshold: 0.9,
      },
      createMockToolContext(),
    )) as string;

    expect(parseResult(result).mutation).toMatchObject({
      applied: false,
      action: "transition",
      error: "autoApply is disabled.",
    });
    expect(createWorkflow).not.toHaveBeenCalled();
    expect(setActiveWorkflow).not.toHaveBeenCalled();
  });
});
