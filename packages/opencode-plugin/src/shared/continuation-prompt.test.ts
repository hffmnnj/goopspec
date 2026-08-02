import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import type { CompactionHandoffSnapshot, PluginContext } from "../core/types.js";
import {
  createDefaultWorkflowState,
  createMockPluginContext,
  setupTestEnvironment,
} from "../test-utils.js";
import {
  MAX_CONTINUATION_PROMPT_CHARS,
  buildContinuationPrompt,
  collectContinuationDetail,
} from "./continuation-prompt.js";

const REQUIRED_HEADINGS = [
  "## Objective",
  "## GoopSpec Workflow State",
  "## Important Details",
  "## Work State",
  "### Completed",
  "### Active",
  "### Blocked",
  "## Next Move",
  "## Relevant Files",
];

function fullSnapshot(
  overrides: Partial<CompactionHandoffSnapshot> = {},
): CompactionHandoffSnapshot {
  return {
    workflowId: "workflow-42",
    phase: "execute",
    mode: "standard",
    depth: "deep",
    specLocked: true,
    interviewComplete: true,
    acceptanceConfirmed: false,
    currentWave: 2,
    totalWaves: 4,
    autopilot: true,
    lazyAutopilot: true,
    branch: "feat/continuation-prompt",
    nextStep: "Run `bun test packages/opencode-plugin/src/shared/continuation-prompt.test.ts`.",
    capturedAtMs: 1,
    currentWaveTitle: "Build formatter",
    currentWaveStatus: "in_progress",
    tasks: [
      {
        index: 2,
        description: "Render replacement prompt",
        status: "in_progress",
        agent: "executor",
      },
    ],
    openBlockers: [
      { id: 7, severity: "high", description: "Need a credential only if deployment begins" },
    ],
    prBranch: "feat/continuation-prompt",
    prUrl: "https://example.test/pr/42",
    ...overrides,
  };
}

describe("continuation prompt", () => {
  let ctx: PluginContext;
  let cleanup: () => void;

  beforeEach(() => {
    const env = setupTestEnvironment("continuation-prompt");
    cleanup = env.cleanup;
    ctx = createMockPluginContext({ testDir: env.testDir, db: env.db });
  });
  afterEach(() => cleanup());

  it("renders every required heading and a complete snapshot verbatim block", () => {
    const detail = collectContinuationDetail(ctx, fullSnapshot());
    const prompt = buildContinuationPrompt(detail!);

    for (const heading of REQUIRED_HEADINGS) expect(prompt).toContain(heading);
    expect(prompt).toContain("Reproduce the following block verbatim, changing nothing:");
    expect(prompt).toContain("Workflow ID: workflow-42");
    expect(prompt).toContain("Git Branch: feat/continuation-prompt");
    expect(prompt).toContain("PR URL: https://example.test/pr/42");
    expect(prompt).toContain("Lazy Autopilot: true");
    expect(prompt).toContain(
      "1. Run `bun test packages/opencode-plugin/src/shared/continuation-prompt.test.ts`.",
    );
  });

  it("prioritizes recent user instructions and the last explicit task direction for snapshots and live state", () => {
    const snapshotPrompt = buildContinuationPrompt(collectContinuationDetail(ctx, fullSnapshot())!);

    ctx = createMockPluginContext({
      testDir: ctx.sdk.directory,
      db: ctx.db,
      state: {
        activeWorkflowId: "live-workflow",
        workflows: {
          "live-workflow": createDefaultWorkflowState({ currentWave: 1, totalWaves: 2 }),
        },
      },
    });
    const livePrompt = buildContinuationPrompt(collectContinuationDetail(ctx)!);

    for (const prompt of [snapshotPrompt, livePrompt]) {
      expect(prompt).toContain("most recent user instructions");
      expect(prompt).toContain("last explicit task direction");
    }
  });

  it("retains both the anchored baseline and no-verbatim-reproduction directives", () => {
    const prompt = buildContinuationPrompt(collectContinuationDetail(ctx, fullSnapshot())!);

    expect(prompt).toContain(
      "use it as the anchored baseline: preserve still-true details, drop stale ones, and merge new facts.",
    );
    expect(prompt).toContain(
      "Never reproduce an earlier GoopSpec continuation brief verbatim; use it only as the anchored baseline.",
    );
  });

  it("requires authoritative live-state re-queries through both workflow tools", () => {
    const prompt = buildContinuationPrompt(collectContinuationDetail(ctx, fullSnapshot())!);

    expect(prompt).toContain("workspace and GoopSpecDB persist and are authoritative");
    expect(prompt).toContain("`goop_status`");
    expect(prompt).toContain("`goop_read_db`");
  });

  it("prohibits tool use during continuation-brief generation", () => {
    const prompt = buildContinuationPrompt(collectContinuationDetail(ctx, fullSnapshot())!);

    expect(prompt).toContain("No tools are available or should be invoked on this turn");
  });

  it("keeps the frozen formatter caps unchanged", async () => {
    const source = await Bun.file(new URL("./continuation-prompt.ts", import.meta.url)).text();

    expect(MAX_CONTINUATION_PROMPT_CHARS).toBe(10_000);
    expect(source).toMatch(/const MAX_TEXT_CHARS = 340;/);
    expect(source).toMatch(/const MAX_IDENTIFIER_CHARS = 160;/);
    expect(source).toMatch(/const MAX_TASKS = 8;/);
    expect(source).toMatch(/const MAX_BLOCKERS = 5;/);
  });

  it("collects live state and guarded current-wave data without a snapshot", () => {
    const workflowId = "live-workflow";
    ctx.db.upsertWave(workflowId, {
      wave_number: 1,
      title: "Live wave",
      status: "in_progress",
    });
    const waveId = ctx.db.getWave(workflowId, 1)?.id;
    ctx.db.upsertWaveTask({
      wave_id: waveId!,
      workflow_id: workflowId,
      task_index: 1,
      description: "Live task",
      status: "in_progress",
    });
    ctx = createMockPluginContext({
      testDir: ctx.sdk.directory,
      db: ctx.db,
      state: {
        activeWorkflowId: workflowId,
        workflows: { [workflowId]: createDefaultWorkflowState({ currentWave: 1, totalWaves: 2 }) },
      },
    });

    const detail = collectContinuationDetail(ctx);
    const prompt = buildContinuationPrompt(detail!);
    expect(detail?.tasks[0]?.description).toBe("Live task");
    expect(prompt).toContain(
      "Run `goop_status` and derive the gate-appropriate action before acting.",
    );
  });

  it("stands down when neither a snapshot nor an active workflow is valid", () => {
    ctx = createMockPluginContext({ state: { activeWorkflowId: "missing", workflows: {} } });
    expect(collectContinuationDetail(ctx)).toBeUndefined();
    expect(
      collectContinuationDetail(ctx, { workflowId: "bad" } as CompactionHandoffSnapshot),
    ).toBeUndefined();
  });

  it("preserves strict and lazy autopilot directives but omits them otherwise", () => {
    const lazy = buildContinuationPrompt(collectContinuationDetail(ctx, fullSnapshot())!);
    const strict = buildContinuationPrompt(
      collectContinuationDetail(ctx, fullSnapshot({ lazyAutopilot: false }))!,
    );
    const disabled = buildContinuationPrompt(
      collectContinuationDetail(ctx, fullSnapshot({ autopilot: false, lazyAutopilot: false }))!,
    );
    expect(lazy).toContain("LAZY AUTOPILOT ACTIVE");
    expect(lazy).toContain("Decide Rule 4 architectural questions autonomously");
    expect(strict).toContain("AUTOPILOT ACTIVE: Do not pause between phases");
    expect(strict).not.toContain("LAZY AUTOPILOT ACTIVE");
    expect(disabled).not.toContain("AUTOPILOT ACTIVE");
    expect(disabled).not.toContain("AUTOPILOT SESSION RULES");
  });

  it("renders empty task and blocker collections without placeholder noise", () => {
    const prompt = buildContinuationPrompt(
      collectContinuationDetail(ctx, fullSnapshot({ tasks: [], openBlockers: [] }))!,
    );
    expect(prompt).toContain("Current-Wave Tasks: none");
    expect(prompt).toContain("Open Blockers: none");
  });

  it("bounds oversized variable data deterministically while retaining every heading", () => {
    const long = "overflow ".repeat(200);
    const snapshot = fullSnapshot({
      nextStep: long,
      tasks: Array.from({ length: 30 }, (_, index) => ({
        index,
        description: long,
        status: long,
        agent: long,
      })),
      openBlockers: Array.from({ length: 30 }, (_, index) => ({
        id: index,
        severity: long,
        description: long,
      })),
    });
    const prompt = buildContinuationPrompt(collectContinuationDetail(ctx, snapshot)!);
    expect(prompt.length).toBeLessThanOrEqual(MAX_CONTINUATION_PROMPT_CHARS);
    expect(prompt).toContain("…");
    for (const heading of REQUIRED_HEADINGS) expect(prompt).toContain(heading);
    expect(prompt).not.toContain("#8 [");
  });

  it("has no environment or filesystem imports", async () => {
    const source = await Bun.file(new URL("./continuation-prompt.ts", import.meta.url)).text();
    expect(source).not.toMatch(/process\.env|node:fs|from ["']fs["']/);
  });
});
