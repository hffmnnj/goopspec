import type { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { createTestDatabase } from "./connection.js";

interface TableRow {
  name: string;
}

interface ProjectRow {
  id: string;
  name: string;
  path: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

describe("daemon db schema", () => {
  let db: Database;

  beforeEach(() => {
    db = createTestDatabase();
  });

  afterEach(() => {
    db.close();
  });

  it("creates all required tables", () => {
    const tableRows = db
      .query(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('projects', 'work_items', 'workflow_sessions', 'workflow_events', 'sqlite_sequence')",
      )
      .all() as TableRow[];

    const tableNames = new Set(tableRows.map((row) => row.name));

    expect(tableNames.has("projects")).toBe(true);
    expect(tableNames.has("work_items")).toBe(true);
    expect(tableNames.has("workflow_sessions")).toBe(true);
    expect(tableNames.has("workflow_events")).toBe(true);
  });

  it("supports basic project CRUD", () => {
    db.query("INSERT INTO projects (id, name, path, description) VALUES (?, ?, ?, ?)").run(
      "project-1",
      "Daemon Project",
      "/tmp/daemon-project",
      "SQLite schema validation",
    );

    const project = db.query("SELECT * FROM projects WHERE id = ?").get("project-1") as
      | ProjectRow
      | null;

    expect(project).not.toBeNull();
    expect(project?.id).toBe("project-1");
    expect(project?.name).toBe("Daemon Project");
    expect(project?.path).toBe("/tmp/daemon-project");
    expect(project?.description).toBe("SQLite schema validation");
    expect(project?.created_at.length).toBeGreaterThan(0);
    expect(project?.updated_at.length).toBeGreaterThan(0);
  });

  it("cascades project delete to work items", () => {
    db.query("INSERT INTO projects (id, name, path) VALUES (?, ?, ?)").run(
      "project-cascade",
      "Cascade Project",
      "/tmp/project-cascade",
    );

    db.query("INSERT INTO work_items (id, project_id, title) VALUES (?, ?, ?)").run(
      "item-1",
      "project-cascade",
      "Cascade item",
    );

    db.query("DELETE FROM projects WHERE id = ?").run("project-cascade");

    const workItemCount = db.query("SELECT COUNT(*) AS count FROM work_items").get() as
      | { count: number }
      | null;
    expect(workItemCount?.count).toBe(0);
  });

  it("enforces foreign key constraints for work items", () => {
    expect(() => {
      db.query("INSERT INTO work_items (id, project_id, title) VALUES (?, ?, ?)").run(
        "item-invalid",
        "missing-project",
        "Should fail",
      );
    }).toThrow();
  });

  it("stores and reads work item tags as JSON", () => {
    const tags = ["daemon", "sqlite", "schema"];

    db.query("INSERT INTO projects (id, name, path) VALUES (?, ?, ?)").run(
      "project-tags",
      "Tags Project",
      "/tmp/project-tags",
    );

    db.query("INSERT INTO work_items (id, project_id, title, tags) VALUES (?, ?, ?, ?)").run(
      "item-tags",
      "project-tags",
      "JSON tags",
      JSON.stringify(tags),
    );

    const row = db.query("SELECT tags FROM work_items WHERE id = ?").get("item-tags") as
      | { tags: string }
      | null;
    expect(row).not.toBeNull();
    expect(JSON.parse(row?.tags ?? "[]")).toEqual(tags);
  });
});
