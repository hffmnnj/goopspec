import type { Database } from "bun:sqlite";
import type { Project, ProjectCreate, ProjectUpdate } from "@goopspec/core";
import { directoryExists, generateId, isGoopSpecProject } from "@goopspec/core";

interface ProjectRow {
  id: string;
  name: string;
  path: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export class ProjectService {
  constructor(private db: Database) {}

  list(): Project[] {
    const rows = this.db
      .query("SELECT * FROM projects ORDER BY created_at DESC")
      .all() as ProjectRow[];
    return rows.map((row) => this.rowToProject(row));
  }

  get(id: string): Project | null {
    const row = this.db
      .query("SELECT * FROM projects WHERE id = ?")
      .get(id) as ProjectRow | null;
    return row ? this.rowToProject(row) : null;
  }

  getByPath(path: string): Project | null {
    const row = this.db
      .query("SELECT * FROM projects WHERE path = ?")
      .get(path) as ProjectRow | null;
    return row ? this.rowToProject(row) : null;
  }

  register(data: ProjectCreate): Project {
    if (!directoryExists(data.path)) {
      throw new ProjectValidationError(`Directory does not exist: ${data.path}`);
    }

    if (!isGoopSpecProject(data.path)) {
      throw new ProjectValidationError(
        `Directory is not a GoopSpec project (missing .goopspec/): ${data.path}`,
      );
    }

    const existing = this.getByPath(data.path);
    if (existing) {
      throw new ProjectValidationError(
        `A project is already registered at this path: ${data.path}`,
      );
    }

    const id = generateId();
    const now = new Date().toISOString();

    this.db
      .query(
        `INSERT INTO projects (id, name, path, description, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(id, data.name, data.path, data.description ?? null, now, now);

    return this.get(id)!;
  }

  update(id: string, data: ProjectUpdate): Project | null {
    const existing = this.get(id);
    if (!existing) return null;

    const now = new Date().toISOString();
    const name = data.name ?? existing.name;
    const description = data.description ?? existing.description;

    this.db
      .query(
        `UPDATE projects SET name = ?, description = ?, updated_at = ? WHERE id = ?`,
      )
      .run(name, description ?? null, now, id);

    return this.get(id)!;
  }

  deregister(id: string): boolean {
    const result = this.db.query("DELETE FROM projects WHERE id = ?").run(id);
    return result.changes > 0;
  }

  private rowToProject(row: ProjectRow): Project {
    return {
      id: row.id,
      name: row.name,
      path: row.path,
      description: row.description ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

export class ProjectValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProjectValidationError";
  }
}
