import { describe, it, expect, afterEach } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { GoopSpecDB } from "../../features/db/index.js";
import { createGoopReadDbTool } from "./index.js";
import type { GoopPiContext, PiEventContext } from "../../core/types.js";

function makeCtx(): { ctx: GoopPiContext; tmpDir: string } {
  const tmpDir = path.join(
    os.tmpdir(),
    `rdbt-${Date.now()}-${Math.random().toString(36).slice(2)}`,
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

describe("goop_read_db tool", () => {
  let tmpDir: string;

  afterEach(() => {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns not-found for missing doc", async () => {
    const { ctx, tmpDir: td } = makeCtx();
    tmpDir = td;
    const tool = createGoopReadDbTool(ctx);
    const result = await tool.execute(
      "1",
      { doc_type: "spec", workflow_id: "wf-1" },
      new AbortController().signal,
      noOp,
      piCtx,
    );
    expect(result).toContain("not found");
  });

  it("reads an existing document", async () => {
    const { ctx, tmpDir: td } = makeCtx();
    tmpDir = td;
    const db = new GoopSpecDB(ctx.dbPath);
    db.upsertDocument("wf-1", "spec", "# My Spec");
    db.close();
    const tool = createGoopReadDbTool(ctx);
    const result = await tool.execute(
      "1",
      { doc_type: "spec", workflow_id: "wf-1" },
      new AbortController().signal,
      noOp,
      piCtx,
    );
    expect(result).toBe("# My Spec");
  });

  it("reads multiple doc types in batch", async () => {
    const { ctx, tmpDir: td } = makeCtx();
    tmpDir = td;
    const db = new GoopSpecDB(ctx.dbPath);
    db.upsertDocument("wf-1", "spec", "spec content");
    db.upsertDocument("wf-1", "blueprint", "blueprint content");
    db.close();
    const tool = createGoopReadDbTool(ctx);
    const result = await tool.execute(
      "1",
      { doc_types: ["spec", "blueprint"], workflow_id: "wf-1" },
      new AbortController().signal,
      noOp,
      piCtx,
    );
    expect(result).toContain("spec content");
    expect(result).toContain("blueprint content");
  });

  it("returns error for invalid doc type", async () => {
    const { ctx, tmpDir: td } = makeCtx();
    tmpDir = td;
    const tool = createGoopReadDbTool(ctx);
    const result = await tool.execute(
      "1",
      { doc_type: "nonexistent" },
      new AbortController().signal,
      noOp,
      piCtx,
    );
    expect(result).toContain("No valid doc_type");
  });

  it("defaults workflow_id to 'default' when omitted", async () => {
    const { ctx, tmpDir: td } = makeCtx();
    tmpDir = td;
    const db = new GoopSpecDB(ctx.dbPath);
    db.upsertDocument("default", "spec", "default spec");
    db.close();
    const tool = createGoopReadDbTool(ctx);
    const result = await tool.execute(
      "1",
      { doc_type: "spec" },
      new AbortController().signal,
      noOp,
      piCtx,
    );
    expect(result).toBe("default spec");
  });

  it("filters out invalid types from batch request", async () => {
    const { ctx, tmpDir: td } = makeCtx();
    tmpDir = td;
    const db = new GoopSpecDB(ctx.dbPath);
    db.upsertDocument("wf-1", "spec", "spec content");
    db.close();
    const tool = createGoopReadDbTool(ctx);
    const result = await tool.execute(
      "1",
      { doc_types: ["spec", "invalid-type"], workflow_id: "wf-1" },
      new AbortController().signal,
      noOp,
      piCtx,
    );
    expect(result).toBe("spec content");
  });

  it("returns no-valid-type when all batch types are invalid", async () => {
    const { ctx, tmpDir: td } = makeCtx();
    tmpDir = td;
    const tool = createGoopReadDbTool(ctx);
    const result = await tool.execute(
      "1",
      { doc_types: ["bad1", "bad2"] },
      new AbortController().signal,
      noOp,
      piCtx,
    );
    expect(result).toContain("No valid doc_type");
  });

  it("tool has correct name and description", () => {
    const { ctx, tmpDir: td } = makeCtx();
    tmpDir = td;
    const tool = createGoopReadDbTool(ctx);
    expect(tool.name).toBe("goop_read_db");
    expect(tool.description).toContain("workflow documents");
  });
});
