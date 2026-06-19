import { describe, it, expect, afterEach } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createGoopStateTool } from "./index.js";
import type { GoopPiContext, PiEventContext } from "../../core/types.js";

function makeCtx(): { ctx: GoopPiContext; tmpDir: string } {
  const tmpDir = path.join(
    os.tmpdir(),
    `gst-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  fs.mkdirSync(tmpDir, { recursive: true });
  const ctx: GoopPiContext = {
    projectDir: tmpDir,
    runtime: "pi",
    dbPath: path.join(tmpDir, ".goopspec", "goopspec.db"),
    goopspecDir: path.join(tmpDir, ".goopspec"),
  };
  return { ctx, tmpDir };
}

const noOp = () => {};
const piCtx: PiEventContext = { projectDir: "/tmp" };

describe("goop_state tool", () => {
  let tmpDir: string;

  afterEach(() => {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("creates a workflow", async () => {
    const { ctx, tmpDir: td } = makeCtx();
    tmpDir = td;
    const tool = createGoopStateTool(ctx);
    const result = await tool.execute(
      "1",
      { action: "create-workflow", workflow_id: "wf-test" },
      new AbortController().signal,
      noOp,
      piCtx,
    );
    expect(result).toContain("created");
  });

  it("gets state for a workflow", async () => {
    const { ctx, tmpDir: td } = makeCtx();
    tmpDir = td;
    const tool = createGoopStateTool(ctx);
    await tool.execute(
      "1",
      { action: "create-workflow", workflow_id: "wf-test" },
      new AbortController().signal,
      noOp,
      piCtx,
    );
    const result = await tool.execute(
      "2",
      { action: "get", workflow_id: "wf-test" },
      new AbortController().signal,
      noOp,
      piCtx,
    );
    expect(result).toContain("Phase:");
    expect(result).toContain("discuss");
  });

  it("transitions phase", async () => {
    const { ctx, tmpDir: td } = makeCtx();
    tmpDir = td;
    const tool = createGoopStateTool(ctx);
    await tool.execute(
      "1",
      { action: "create-workflow", workflow_id: "wf-1" },
      new AbortController().signal,
      noOp,
      piCtx,
    );
    const result = await tool.execute(
      "2",
      { action: "transition", workflow_id: "wf-1", phase: "plan" },
      new AbortController().signal,
      noOp,
      piCtx,
    );
    expect(result).toContain("plan");
  });

  it("rejects invalid phase transition", async () => {
    const { ctx, tmpDir: td } = makeCtx();
    tmpDir = td;
    const tool = createGoopStateTool(ctx);
    await tool.execute(
      "1",
      { action: "create-workflow", workflow_id: "wf-1" },
      new AbortController().signal,
      noOp,
      piCtx,
    );
    const result = await tool.execute(
      "2",
      { action: "transition", workflow_id: "wf-1", phase: "confirm" },
      new AbortController().signal,
      noOp,
      piCtx,
    );
    expect(result).toContain("Error");
    expect(result).toContain("Cannot transition");
  });

  it("requires phase for transition action", async () => {
    const { ctx, tmpDir: td } = makeCtx();
    tmpDir = td;
    const tool = createGoopStateTool(ctx);
    await tool.execute(
      "1",
      { action: "create-workflow", workflow_id: "wf-1" },
      new AbortController().signal,
      noOp,
      piCtx,
    );
    const result = await tool.execute(
      "2",
      { action: "transition", workflow_id: "wf-1" },
      new AbortController().signal,
      noOp,
      piCtx,
    );
    expect(result).toContain("'phase' is required");
  });

  it("locks and unlocks spec", async () => {
    const { ctx, tmpDir: td } = makeCtx();
    tmpDir = td;
    const tool = createGoopStateTool(ctx);
    await tool.execute(
      "1",
      { action: "create-workflow", workflow_id: "wf-1" },
      new AbortController().signal,
      noOp,
      piCtx,
    );
    const locked = await tool.execute(
      "2",
      { action: "lock-spec", workflow_id: "wf-1" },
      new AbortController().signal,
      noOp,
      piCtx,
    );
    expect(locked).toContain("locked");
    const unlocked = await tool.execute(
      "3",
      { action: "unlock-spec", workflow_id: "wf-1" },
      new AbortController().signal,
      noOp,
      piCtx,
    );
    expect(unlocked).toContain("unlocked");
  });

  it("lists workflows", async () => {
    const { ctx, tmpDir: td } = makeCtx();
    tmpDir = td;
    const tool = createGoopStateTool(ctx);
    await tool.execute(
      "1",
      { action: "create-workflow", workflow_id: "alpha" },
      new AbortController().signal,
      noOp,
      piCtx,
    );
    await tool.execute(
      "2",
      { action: "create-workflow", workflow_id: "beta" },
      new AbortController().signal,
      noOp,
      piCtx,
    );
    const result = await tool.execute(
      "3",
      { action: "list-workflows" },
      new AbortController().signal,
      noOp,
      piCtx,
    );
    expect(result).toContain("alpha");
    expect(result).toContain("beta");
  });

  it("updates wave progress", async () => {
    const { ctx, tmpDir: td } = makeCtx();
    tmpDir = td;
    const tool = createGoopStateTool(ctx);
    await tool.execute(
      "1",
      { action: "create-workflow", workflow_id: "wf-1" },
      new AbortController().signal,
      noOp,
      piCtx,
    );
    const result = await tool.execute(
      "2",
      { action: "update-wave", workflow_id: "wf-1", current_wave: 3, total_waves: 6 },
      new AbortController().signal,
      noOp,
      piCtx,
    );
    expect(result).toContain("3/6");
  });

  it("completes interview", async () => {
    const { ctx, tmpDir: td } = makeCtx();
    tmpDir = td;
    const tool = createGoopStateTool(ctx);
    await tool.execute(
      "1",
      { action: "create-workflow", workflow_id: "wf-1" },
      new AbortController().signal,
      noOp,
      piCtx,
    );
    const result = await tool.execute(
      "2",
      { action: "complete-interview", workflow_id: "wf-1" },
      new AbortController().signal,
      noOp,
      piCtx,
    );
    expect(result).toContain("complete");
  });

  it("confirms acceptance", async () => {
    const { ctx, tmpDir: td } = makeCtx();
    tmpDir = td;
    const tool = createGoopStateTool(ctx);
    await tool.execute(
      "1",
      { action: "create-workflow", workflow_id: "wf-1" },
      new AbortController().signal,
      noOp,
      piCtx,
    );
    const result = await tool.execute(
      "2",
      { action: "confirm-acceptance", workflow_id: "wf-1" },
      new AbortController().signal,
      noOp,
      piCtx,
    );
    expect(result).toContain("confirmed");
  });

  it("sets autopilot", async () => {
    const { ctx, tmpDir: td } = makeCtx();
    tmpDir = td;
    const tool = createGoopStateTool(ctx);
    await tool.execute(
      "1",
      { action: "create-workflow", workflow_id: "wf-1" },
      new AbortController().signal,
      noOp,
      piCtx,
    );
    const result = await tool.execute(
      "2",
      { action: "set-autopilot", workflow_id: "wf-1", autopilot: true, lazy: true },
      new AbortController().signal,
      noOp,
      piCtx,
    );
    expect(result).toContain("ON");
    expect(result).toContain("lazy");
  });

  it("sets active workflow", async () => {
    const { ctx, tmpDir: td } = makeCtx();
    tmpDir = td;
    const tool = createGoopStateTool(ctx);
    await tool.execute(
      "1",
      { action: "create-workflow", workflow_id: "my-wf" },
      new AbortController().signal,
      noOp,
      piCtx,
    );
    const result = await tool.execute(
      "2",
      { action: "set-active-workflow", workflow_id: "my-wf" },
      new AbortController().signal,
      noOp,
      piCtx,
    );
    expect(result).toContain("my-wf");
  });

  it("tool has correct name and description", () => {
    const { ctx, tmpDir: td } = makeCtx();
    tmpDir = td;
    const tool = createGoopStateTool(ctx);
    expect(tool.name).toBe("goop_state");
    expect(tool.description).toContain("workflow state");
  });
});
