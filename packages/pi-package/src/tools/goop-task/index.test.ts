import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { OMP_DETECTION_ENV } from "../../core/constants.js";
import type { GoopPiContext, PiEventContext } from "../../core/types.js";
import { createGoopTaskTool } from "./index.js";

function makeCtx(): { ctx: GoopPiContext; tmpDir: string } {
  const tmpDir = path.join(os.tmpdir(), `gtt-${Date.now()}-${Math.random().toString(36).slice(2)}`);
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

describe("goop_task tool", () => {
  let tmpDir: string;
  let savedOmpVersion: string | undefined;

  beforeEach(() => {
    savedOmpVersion = process.env[OMP_DETECTION_ENV];
    delete process.env[OMP_DETECTION_ENV];
  });

  afterEach(() => {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
    if (savedOmpVersion === undefined) {
      delete process.env[OMP_DETECTION_ENV];
    } else {
      process.env[OMP_DETECTION_ENV] = savedOmpVersion;
    }
  });

  it("has correct name and description", () => {
    const { ctx, tmpDir: td } = makeCtx();
    tmpDir = td;
    const tool = createGoopTaskTool(ctx);
    expect(tool.name).toBe("goop_task");
    expect(tool.description).toContain("subagent");
  });

  it("delegates using pi mode (base Pi)", async () => {
    const { ctx, tmpDir: td } = makeCtx();
    tmpDir = td;
    const tool = createGoopTaskTool(ctx);
    const result = await tool.execute(
      "1",
      {
        description: "Research Pi agent",
        prompt: "Research the Pi agent ecosystem",
        subagent_type: "goop-researcher",
      },
      new AbortController().signal,
      noOp,
      piCtx,
    );
    expect(result).toContain("pi mode");
    expect(result).toContain("goop-researcher");
  });

  it("delegates using omp mode when OMP_VERSION is set", async () => {
    process.env[OMP_DETECTION_ENV] = "16.0.0";
    const { ctx, tmpDir: td } = makeCtx();
    tmpDir = td;
    const tool = createGoopTaskTool(ctx);
    const result = await tool.execute(
      "1",
      {
        description: "Write DB tools",
        prompt: "Create the database tools",
        subagent_type: "goop-executor-medium",
      },
      new AbortController().signal,
      noOp,
      piCtx,
    );
    expect(result).toContain("omp mode");
    expect(result).toContain("task");
  });

  it("passes workflow context to delegation", async () => {
    const { ctx, tmpDir: td } = makeCtx();
    tmpDir = td;
    const tool = createGoopTaskTool(ctx);
    const result = await tool.execute(
      "1",
      {
        description: "Test task",
        prompt: "Do something",
        subagent_type: "goop-executor-low",
        workflow_id: "my-workflow",
      },
      new AbortController().signal,
      noOp,
      piCtx,
    );
    expect(result).toContain("my-workflow");
  });

  it("includes project dir in delegation output", async () => {
    const { ctx, tmpDir: td } = makeCtx();
    tmpDir = td;
    const tool = createGoopTaskTool(ctx);
    const result = await tool.execute(
      "1",
      {
        description: "Build feature",
        prompt: "Implement the feature module",
        subagent_type: "goop-executor-high",
      },
      new AbortController().signal,
      noOp,
      piCtx,
    );
    expect(result).toContain(tmpDir);
  });

  it("includes description in delegation output", async () => {
    const { ctx, tmpDir: td } = makeCtx();
    tmpDir = td;
    const tool = createGoopTaskTool(ctx);
    const result = await tool.execute(
      "1",
      {
        description: "Refactor state manager",
        prompt: "Refactor the state manager to use new DB schema",
        subagent_type: "goop-executor-medium",
      },
      new AbortController().signal,
      noOp,
      piCtx,
    );
    expect(result).toContain("Refactor state manager");
  });

  it("falls back to active workflow when workflow_id not provided", async () => {
    const { ctx, tmpDir: td } = makeCtx();
    tmpDir = td;
    const tool = createGoopTaskTool(ctx);
    // Without workflow_id, it should still produce output (using default workflow)
    const result = await tool.execute(
      "1",
      {
        description: "Simple task",
        prompt: "Do a simple thing",
        subagent_type: "goop-executor-low",
      },
      new AbortController().signal,
      noOp,
      piCtx,
    );
    expect(result).toContain("Subagent Task Delegation");
  });
});
