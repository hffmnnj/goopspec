import { describe, it, expect, afterEach } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { GoopSpecDB } from "./index.js";

function makeTmpDir(): string {
  const tmp = path.join(
    os.tmpdir(),
    `goopspec-pi-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  fs.mkdirSync(tmp, { recursive: true });
  return tmp;
}

describe("GoopSpecDB (Pi)", () => {
  let tmpDir: string;
  let db: GoopSpecDB;

  afterEach(() => {
    db?.close();
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("initialises with schema version 2", () => {
    tmpDir = makeTmpDir();
    db = new GoopSpecDB(path.join(tmpDir, "test.db"));
    expect(db.getSchemaVersion()).toBe(2);
  });

  it("creates and retrieves a workflow", () => {
    tmpDir = makeTmpDir();
    db = new GoopSpecDB(path.join(tmpDir, "test.db"));
    db.upsertWorkflow("wf-1", { phase: "discuss" });
    const row = db.getWorkflow("wf-1");
    expect(row).not.toBeNull();
    expect(JSON.parse(row!.state).phase).toBe("discuss");
  });

  it("lists all workflows", () => {
    tmpDir = makeTmpDir();
    db = new GoopSpecDB(path.join(tmpDir, "test.db"));
    db.upsertWorkflow("a", {});
    db.upsertWorkflow("b", {});
    expect(db.getAllWorkflows().length).toBe(2);
  });

  it("upserts a workflow (update path)", () => {
    tmpDir = makeTmpDir();
    db = new GoopSpecDB(path.join(tmpDir, "test.db"));
    db.upsertWorkflow("wf-1", { phase: "discuss" });
    db.upsertWorkflow("wf-1", { phase: "plan" });
    const row = db.getWorkflow("wf-1");
    expect(JSON.parse(row!.state).phase).toBe("plan");
  });

  it("deletes a workflow", () => {
    tmpDir = makeTmpDir();
    db = new GoopSpecDB(path.join(tmpDir, "test.db"));
    db.upsertWorkflow("wf-del", {});
    db.deleteWorkflow("wf-del");
    expect(db.getWorkflow("wf-del")).toBeNull();
  });

  it("upserts and gets a document", () => {
    tmpDir = makeTmpDir();
    db = new GoopSpecDB(path.join(tmpDir, "test.db"));
    db.upsertDocument("wf-1", "spec", "# Spec");
    const doc = db.getDocument("wf-1", "spec");
    expect(doc?.content).toBe("# Spec");
  });

  it("appends to a document", () => {
    tmpDir = makeTmpDir();
    db = new GoopSpecDB(path.join(tmpDir, "test.db"));
    db.upsertDocument("wf-1", "chronicle", "## Start");
    db.appendDocument("wf-1", "chronicle", "## Entry");
    const doc = db.getDocument("wf-1", "chronicle");
    expect(doc?.content).toContain("## Start");
    expect(doc?.content).toContain("## Entry");
  });

  it("appends document to empty creates new", () => {
    tmpDir = makeTmpDir();
    db = new GoopSpecDB(path.join(tmpDir, "test.db"));
    db.appendDocument("wf-1", "requirements", "First content");
    const doc = db.getDocument("wf-1", "requirements");
    expect(doc?.content).toBe("First content");
  });

  it("lists doc types for a workflow", () => {
    tmpDir = makeTmpDir();
    db = new GoopSpecDB(path.join(tmpDir, "test.db"));
    db.upsertDocument("wf-1", "spec", "s");
    db.upsertDocument("wf-1", "blueprint", "b");
    const types = db.listDocTypes("wf-1");
    expect(types).toContain("spec");
    expect(types).toContain("blueprint");
  });

  it("saves and retrieves a field note by id", () => {
    tmpDir = makeTmpDir();
    db = new GoopSpecDB(path.join(tmpDir, "test.db"));
    db.saveNote({
      id: "fn_001",
      title: "Test",
      body: "Body",
      tags: '["test"]',
      source_agent: "test-agent",
      importance: 5,
      workflow_id: null,
      project_id: null,
    });
    const note = db.getNoteById("fn_001");
    expect(note?.title).toBe("Test");
    expect(note?.source_agent).toBe("test-agent");
  });

  it("searches field notes by query", () => {
    tmpDir = makeTmpDir();
    db = new GoopSpecDB(path.join(tmpDir, "test.db"));
    db.saveNote({
      id: "fn_001",
      title: "Pi agent architecture",
      body: "How Pi works internally",
      tags: '["pi","research"]',
      source_agent: "researcher",
      importance: 7,
      workflow_id: null,
      project_id: null,
    });
    db.saveNote({
      id: "fn_002",
      title: "Unrelated note",
      body: "Something else entirely",
      tags: '[]',
      source_agent: "test",
      importance: 5,
      workflow_id: null,
      project_id: null,
    });
    const results = db.searchNotes("Pi agent");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]!.id).toBe("fn_001");
  });

  it("searches field notes with tag filter", () => {
    tmpDir = makeTmpDir();
    db = new GoopSpecDB(path.join(tmpDir, "test.db"));
    db.saveNote({
      id: "fn_t1",
      title: "Tagged",
      body: "has research tag",
      tags: '["research"]',
      source_agent: "a",
      importance: 5,
      workflow_id: null,
      project_id: null,
    });
    db.saveNote({
      id: "fn_t2",
      title: "Untagged",
      body: "no research tag",
      tags: '[]',
      source_agent: "a",
      importance: 5,
      workflow_id: null,
      project_id: null,
    });
    const results = db.searchNotes("", { tags: ["research"] });
    expect(results.some((r) => r.id === "fn_t1")).toBe(true);
    expect(results.some((r) => r.id === "fn_t2")).toBe(false);
  });

  it("appends and retrieves chronicle events", () => {
    tmpDir = makeTmpDir();
    db = new GoopSpecDB(path.join(tmpDir, "test.db"));
    db.appendChronicleEvent("wf-1", "Wave 1 started");
    db.appendChronicleEvent("wf-1", "Task 1.1 complete");
    const events = db.getChronicleEvents("wf-1");
    expect(events.length).toBe(2);
    expect(events[0]!.entry).toBe("Wave 1 started");
    expect(events[1]!.entry).toBe("Task 1.1 complete");
  });

  it("renders markdown sidecar file", () => {
    tmpDir = makeTmpDir();
    db = new GoopSpecDB(path.join(tmpDir, "test.db"));
    db.renderMarkdownSidecar(tmpDir, "wf-1", "spec", "# Test Spec\nContent");
    const filePath = path.join(tmpDir, ".goopspec", "wf-1", "SPEC.md");
    expect(fs.existsSync(filePath)).toBe(true);
    expect(fs.readFileSync(filePath, "utf8")).toBe("# Test Spec\nContent");
  });

  it("appends events to the events table", () => {
    tmpDir = makeTmpDir();
    db = new GoopSpecDB(path.join(tmpDir, "test.db"));
    const id = db.appendEvent("wf-1", "phase_transition", { from: "discuss", to: "plan" });
    expect(id).toBeGreaterThan(0);
    const events = db.getEvents("wf-1");
    expect(events.length).toBe(1);
    expect(events[0]!.event_type).toBe("phase_transition");
  });
});
