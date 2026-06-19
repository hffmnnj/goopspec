import { describe, it, expect, afterEach } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { GoopSpecDB } from "../../features/db/index.js";
import { createGoopSearchNotesTool } from "./index.js";
import type { GoopPiContext, PiEventContext } from "../../core/types.js";

function makeCtx(): { ctx: GoopPiContext; tmpDir: string } {
  const tmpDir = path.join(
    os.tmpdir(),
    `srn-${Date.now()}-${Math.random().toString(36).slice(2)}`,
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

describe("goop_search_notes tool", () => {
  let tmpDir: string;

  afterEach(() => {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns empty message when no notes", async () => {
    const { ctx, tmpDir: td } = makeCtx();
    tmpDir = td;
    const tool = createGoopSearchNotesTool(ctx);
    const result = await tool.execute(
      "1",
      { query: "something" },
      new AbortController().signal,
      noOp,
      piCtx,
    );
    expect(result).toContain("0 results");
  });

  it("finds notes by query", async () => {
    const { ctx, tmpDir: td } = makeCtx();
    tmpDir = td;
    const db = new GoopSpecDB(ctx.dbPath);
    db.saveNote({
      id: "fn_001",
      title: "Pi architecture",
      body: "How Pi loads extensions",
      tags: '["pi"]',
      source_agent: "researcher",
      importance: 7,
      workflow_id: null,
      project_id: null,
    });
    db.close();
    const tool = createGoopSearchNotesTool(ctx);
    const result = await tool.execute(
      "1",
      { query: "Pi architecture" },
      new AbortController().signal,
      noOp,
      piCtx,
    );
    expect(result).toContain("Pi architecture");
    expect(result).toContain("1 result");
  });

  it("filters by tags", async () => {
    const { ctx, tmpDir: td } = makeCtx();
    tmpDir = td;
    const db = new GoopSpecDB(ctx.dbPath);
    db.saveNote({
      id: "fn_001",
      title: "Pi note",
      body: "body",
      tags: '["pi"]',
      source_agent: "a",
      importance: 5,
      workflow_id: null,
      project_id: null,
    });
    db.saveNote({
      id: "fn_002",
      title: "Other",
      body: "body",
      tags: '["other"]',
      source_agent: "a",
      importance: 5,
      workflow_id: null,
      project_id: null,
    });
    db.close();
    const tool = createGoopSearchNotesTool(ctx);
    const result = await tool.execute(
      "1",
      { query: "", tags: ["pi"] },
      new AbortController().signal,
      noOp,
      piCtx,
    );
    expect(result).toContain("Pi note");
    expect(result).not.toContain("Other");
  });

  it("respects limit parameter", async () => {
    const { ctx, tmpDir: td } = makeCtx();
    tmpDir = td;
    const db = new GoopSpecDB(ctx.dbPath);
    for (let i = 0; i < 5; i++) {
      db.saveNote({
        id: `fn_${i}`,
        title: `Note ${i}`,
        body: "body content",
        tags: '["test"]',
        source_agent: "a",
        importance: 5,
        workflow_id: null,
        project_id: null,
      });
    }
    db.close();
    const tool = createGoopSearchNotesTool(ctx);
    const result = await tool.execute(
      "1",
      { query: "", tags: ["test"], limit: 2 },
      new AbortController().signal,
      noOp,
      piCtx,
    );
    expect(result).toContain("2 results");
  });

  it("truncates long note bodies in output", async () => {
    const { ctx, tmpDir: td } = makeCtx();
    tmpDir = td;
    const longBody = "X".repeat(600);
    const db = new GoopSpecDB(ctx.dbPath);
    db.saveNote({
      id: "fn_long",
      title: "Long note",
      body: longBody,
      tags: '["test"]',
      source_agent: "a",
      importance: 5,
      workflow_id: null,
      project_id: null,
    });
    db.close();
    const tool = createGoopSearchNotesTool(ctx);
    const result = await tool.execute(
      "1",
      { query: "", tags: ["test"] },
      new AbortController().signal,
      noOp,
      piCtx,
    );
    expect(result).toContain("...");
    expect(result).not.toContain("X".repeat(600));
  });

  it("tool has correct name and description", () => {
    const { ctx, tmpDir: td } = makeCtx();
    tmpDir = td;
    const tool = createGoopSearchNotesTool(ctx);
    expect(tool.name).toBe("goop_search_notes");
    expect(tool.description).toContain("Field Notes");
  });
});
