import { describe, it, expect, afterEach } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { GoopSpecDB } from "../../features/db/index.js";
import { createGoopSaveNoteTool } from "./index.js";
import type { GoopPiContext, PiEventContext } from "../../core/types.js";

function makeCtx(): { ctx: GoopPiContext; tmpDir: string } {
  const tmpDir = path.join(
    os.tmpdir(),
    `snt-${Date.now()}-${Math.random().toString(36).slice(2)}`,
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

describe("goop_save_note tool", () => {
  let tmpDir: string;

  afterEach(() => {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("saves a note and returns confirmation with ID", async () => {
    const { ctx, tmpDir: td } = makeCtx();
    tmpDir = td;
    const tool = createGoopSaveNoteTool(ctx);
    const result = await tool.execute(
      "1",
      { title: "Test note", body: "Body", tags: ["test"], source_agent: "tester" },
      new AbortController().signal,
      noOp,
      piCtx,
    );
    expect(result).toContain("[OK]");
    expect(result).toContain("fn_");
    expect(result).toContain("Test note");
  });

  it("persists note to DB", async () => {
    const { ctx, tmpDir: td } = makeCtx();
    tmpDir = td;
    const tool = createGoopSaveNoteTool(ctx);
    await tool.execute(
      "1",
      { title: "Persisted", body: "Content", tags: ["pi"], source_agent: "test", importance: 8 },
      new AbortController().signal,
      noOp,
      piCtx,
    );
    const db = new GoopSpecDB(ctx.dbPath);
    const results = db.searchNotes("Persisted");
    db.close();
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]!.title).toBe("Persisted");
    expect(results[0]!.importance).toBe(8);
  });

  it("clamps importance to 1-10", async () => {
    const { ctx, tmpDir: td } = makeCtx();
    tmpDir = td;
    const tool = createGoopSaveNoteTool(ctx);
    await tool.execute(
      "1",
      { title: "High", body: "B", tags: [], source_agent: "t", importance: 99 },
      new AbortController().signal,
      noOp,
      piCtx,
    );
    const db = new GoopSpecDB(ctx.dbPath);
    const results = db.searchNotes("High");
    db.close();
    expect(results[0]!.importance).toBe(10);
  });

  it("clamps importance below 1 to 1", async () => {
    const { ctx, tmpDir: td } = makeCtx();
    tmpDir = td;
    const tool = createGoopSaveNoteTool(ctx);
    await tool.execute(
      "1",
      { title: "Low", body: "B", tags: [], source_agent: "t", importance: -5 },
      new AbortController().signal,
      noOp,
      piCtx,
    );
    const db = new GoopSpecDB(ctx.dbPath);
    const results = db.searchNotes("Low");
    db.close();
    expect(results[0]!.importance).toBe(1);
  });

  it("truncates title to 100 chars", async () => {
    const { ctx, tmpDir: td } = makeCtx();
    tmpDir = td;
    const longTitle = "A".repeat(150);
    const tool = createGoopSaveNoteTool(ctx);
    await tool.execute(
      "1",
      { title: longTitle, body: "B", tags: [], source_agent: "t" },
      new AbortController().signal,
      noOp,
      piCtx,
    );
    const db = new GoopSpecDB(ctx.dbPath);
    const results = db.searchNotes("AAAA");
    db.close();
    expect(results[0]!.title.length).toBe(100);
  });

  it("defaults importance to 5 when omitted", async () => {
    const { ctx, tmpDir: td } = makeCtx();
    tmpDir = td;
    const tool = createGoopSaveNoteTool(ctx);
    await tool.execute(
      "1",
      { title: "Default imp", body: "B", tags: [], source_agent: "t" },
      new AbortController().signal,
      noOp,
      piCtx,
    );
    const db = new GoopSpecDB(ctx.dbPath);
    const results = db.searchNotes("Default imp");
    db.close();
    expect(results[0]!.importance).toBe(5);
  });

  it("tool has correct name and description", () => {
    const { ctx, tmpDir: td } = makeCtx();
    tmpDir = td;
    const tool = createGoopSaveNoteTool(ctx);
    expect(tool.name).toBe("goop_save_note");
    expect(tool.description).toContain("Field Note");
  });
});
