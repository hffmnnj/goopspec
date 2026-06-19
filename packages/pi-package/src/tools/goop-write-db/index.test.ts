import { describe, it, expect, afterEach } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { GoopSpecDB } from "../../features/db/index.js";
import { createGoopWriteDbTool } from "./index.js";
import type { GoopPiContext, PiEventContext } from "../../core/types.js";

function makeCtx(): { ctx: GoopPiContext; tmpDir: string } {
  const tmpDir = path.join(
    os.tmpdir(),
    `wdbt-${Date.now()}-${Math.random().toString(36).slice(2)}`,
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

describe("goop_write_db tool", () => {
  let tmpDir: string;

  afterEach(() => {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("writes a document and returns confirmation", async () => {
    const { ctx, tmpDir: td } = makeCtx();
    tmpDir = td;
    const tool = createGoopWriteDbTool(ctx);
    const result = await tool.execute(
      "1",
      { doc_type: "spec", content: "# Spec", workflow_id: "wf-1" },
      new AbortController().signal,
      noOp,
      piCtx,
    );
    expect(result).toContain("Written spec");
    expect(result).toContain("replace");
  });

  it("persists content to DB", async () => {
    const { ctx, tmpDir: td } = makeCtx();
    tmpDir = td;
    const tool = createGoopWriteDbTool(ctx);
    await tool.execute(
      "1",
      { doc_type: "spec", content: "# Spec Content", workflow_id: "wf-1" },
      new AbortController().signal,
      noOp,
      piCtx,
    );
    const db = new GoopSpecDB(ctx.dbPath);
    const doc = db.getDocument("wf-1", "spec");
    db.close();
    expect(doc?.content).toBe("# Spec Content");
  });

  it("renders markdown sidecar file", async () => {
    const { ctx, tmpDir: td } = makeCtx();
    tmpDir = td;
    const tool = createGoopWriteDbTool(ctx);
    await tool.execute(
      "1",
      { doc_type: "blueprint", content: "# Blueprint", workflow_id: "wf-1" },
      new AbortController().signal,
      noOp,
      piCtx,
    );
    const sidecar = path.join(tmpDir, ".goopspec", "wf-1", "BLUEPRINT.md");
    expect(fs.existsSync(sidecar)).toBe(true);
    expect(fs.readFileSync(sidecar, "utf8")).toBe("# Blueprint");
  });

  it("appends to existing document", async () => {
    const { ctx, tmpDir: td } = makeCtx();
    tmpDir = td;
    const tool = createGoopWriteDbTool(ctx);
    await tool.execute(
      "1",
      { doc_type: "chronicle", content: "## Entry 1", workflow_id: "wf-1" },
      new AbortController().signal,
      noOp,
      piCtx,
    );
    await tool.execute(
      "2",
      { doc_type: "chronicle", content: "## Entry 2", workflow_id: "wf-1", mode: "append" },
      new AbortController().signal,
      noOp,
      piCtx,
    );
    const db = new GoopSpecDB(ctx.dbPath);
    const doc = db.getDocument("wf-1", "chronicle");
    db.close();
    expect(doc?.content).toContain("## Entry 1");
    expect(doc?.content).toContain("## Entry 2");
  });

  it("append mode renders updated sidecar", async () => {
    const { ctx, tmpDir: td } = makeCtx();
    tmpDir = td;
    const tool = createGoopWriteDbTool(ctx);
    await tool.execute(
      "1",
      { doc_type: "chronicle", content: "## Entry 1", workflow_id: "wf-1" },
      new AbortController().signal,
      noOp,
      piCtx,
    );
    await tool.execute(
      "2",
      { doc_type: "chronicle", content: "## Entry 2", workflow_id: "wf-1", mode: "append" },
      new AbortController().signal,
      noOp,
      piCtx,
    );
    const sidecar = path.join(tmpDir, ".goopspec", "wf-1", "CHRONICLE.md");
    const content = fs.readFileSync(sidecar, "utf8");
    expect(content).toContain("## Entry 1");
    expect(content).toContain("## Entry 2");
  });

  it("returns error for invalid doc type", async () => {
    const { ctx, tmpDir: td } = makeCtx();
    tmpDir = td;
    const tool = createGoopWriteDbTool(ctx);
    const result = await tool.execute(
      "1",
      { doc_type: "invalid", content: "x" },
      new AbortController().signal,
      noOp,
      piCtx,
    );
    expect(result).toContain("Invalid doc_type");
  });

  it("defaults workflow_id to 'default' when omitted", async () => {
    const { ctx, tmpDir: td } = makeCtx();
    tmpDir = td;
    const tool = createGoopWriteDbTool(ctx);
    const result = await tool.execute(
      "1",
      { doc_type: "spec", content: "# Default Spec" },
      new AbortController().signal,
      noOp,
      piCtx,
    );
    expect(result).toContain("workflow 'default'");
    const db = new GoopSpecDB(ctx.dbPath);
    const doc = db.getDocument("default", "spec");
    db.close();
    expect(doc?.content).toBe("# Default Spec");
  });

  it("tool has correct name and description", () => {
    const { ctx, tmpDir: td } = makeCtx();
    tmpDir = td;
    const tool = createGoopWriteDbTool(ctx);
    expect(tool.name).toBe("goop_write_db");
    expect(tool.description).toContain("workflow document");
  });
});
