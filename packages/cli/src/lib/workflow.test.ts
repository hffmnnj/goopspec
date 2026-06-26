import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Database } from "bun:sqlite";
import { getActiveWorkflow } from "./workflow.js";

describe("workflow", () => {
  let originalCwd: string;
  let testDir: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    testDir = mkdtempSync(join(tmpdir(), "goopspec-workflow-test-"));
    process.chdir(testDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(testDir, { recursive: true, force: true });
  });

  it("returns null state when database is absent", async () => {
    const state = await getActiveWorkflow();
    expect(state).toEqual({ workflowId: null, phase: null });
  });

  it("reads the most recently updated workflow", async () => {
    const goopspecDir = join(testDir, ".goopspec");
    const { mkdirSync } = await import("node:fs");
    mkdirSync(goopspecDir, { recursive: true });

    const db = new Database(join(goopspecDir, "goopspec.db"));
    db.run(`
      CREATE TABLE workflows (
        id TEXT PRIMARY KEY,
        state TEXT NOT NULL DEFAULT '{}',
        created_at INTEGER DEFAULT (unixepoch()),
        updated_at INTEGER DEFAULT (unixepoch())
      )
    `);
    db
      .query("INSERT INTO workflows (id, state, updated_at) VALUES ($id, $state, $updated)")
      .run({ $id: "alpha", $state: JSON.stringify({ phase: "plan" }), $updated: 100 });
    db
      .query("INSERT INTO workflows (id, state, updated_at) VALUES ($id, $state, $updated)")
      .run({ $id: "beta", $state: JSON.stringify({ phase: "execute" }), $updated: 200 });
    db.close();

    const state = await getActiveWorkflow();
    expect(state.workflowId).toBe("beta");
    expect(state.phase).toBe("execute");
  });

  it("falls back to currentPhase when phase is absent", async () => {
    const goopspecDir = join(testDir, ".goopspec");
    const { mkdirSync } = await import("node:fs");
    mkdirSync(goopspecDir, { recursive: true });

    const db = new Database(join(goopspecDir, "goopspec.db"));
    db.run(`
      CREATE TABLE workflows (
        id TEXT PRIMARY KEY,
        state TEXT NOT NULL DEFAULT '{}',
        created_at INTEGER DEFAULT (unixepoch()),
        updated_at INTEGER DEFAULT (unixepoch())
      )
    `);
    db
      .query("INSERT INTO workflows (id, state) VALUES ($id, $state)")
      .run({ $id: "gamma", $state: JSON.stringify({ currentPhase: "accept" }) });
    db.close();

    const state = await getActiveWorkflow();
    expect(state.workflowId).toBe("gamma");
    expect(state.phase).toBe("accept");
  });
});
