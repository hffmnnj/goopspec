import type { Database } from "bun:sqlite";
import type {
  WorkItem,
  WorkItemCreate,
  WorkItemFilter,
  WorkItemUpdate,
} from "@goopspec/core";
import { generateId } from "@goopspec/core";

interface WorkItemRow {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  tags: string;
  created_at: string;
  updated_at: string;
}

type SortField = "createdAt" | "updatedAt" | "priority" | "title" | "status";
type SortOrder = "asc" | "desc";

interface ListOptions {
  filter?: WorkItemFilter;
  sort?: SortField;
  order?: SortOrder;
}

const SORT_COLUMN_MAP: Record<SortField, string> = {
  createdAt: "created_at",
  updatedAt: "updated_at",
  title: "title",
  status: "status",
  priority: "priority",
};

export class ItemService {
  constructor(private db: Database) {}

  list(projectId: string, options?: ListOptions): WorkItem[] {
    const conditions: string[] = ["project_id = ?"];
    const params: string[] = [projectId];

    if (options?.filter?.status) {
      conditions.push("status = ?");
      params.push(options.filter.status);
    }

    if (options?.filter?.priority) {
      conditions.push("priority = ?");
      params.push(options.filter.priority);
    }

    if (options?.filter?.search) {
      conditions.push("(title LIKE ? OR description LIKE ?)");
      const pattern = `%${options.filter.search}%`;
      params.push(pattern, pattern);
    }

    const where = conditions.join(" AND ");

    let orderClause: string;
    const sortField = options?.sort ?? "createdAt";
    const sortOrder = options?.order ?? "desc";
    const direction = sortOrder === "asc" ? "ASC" : "DESC";

    if (sortField === "priority") {
      orderClause = `ORDER BY CASE priority WHEN 'critical' THEN 4 WHEN 'high' THEN 3 WHEN 'medium' THEN 2 WHEN 'low' THEN 1 ELSE 0 END ${direction}`;
    } else {
      const column = SORT_COLUMN_MAP[sortField];
      orderClause = `ORDER BY ${column} ${direction}`;
    }

    const sql = `SELECT * FROM work_items WHERE ${where} ${orderClause}`;
    const rows = this.db.query(sql).all(...params) as WorkItemRow[];

    let items = rows.map((row) => this.rowToWorkItem(row));

    if (options?.filter?.tags && options.filter.tags.length > 0) {
      const filterTags = options.filter.tags;
      items = items.filter((item) =>
        filterTags.some((tag) => item.tags.includes(tag)),
      );
    }

    return items;
  }

  get(projectId: string, id: string): WorkItem | null {
    const row = this.db
      .query("SELECT * FROM work_items WHERE id = ? AND project_id = ?")
      .get(id, projectId) as WorkItemRow | null;
    return row ? this.rowToWorkItem(row) : null;
  }

  create(projectId: string, data: WorkItemCreate): WorkItem {
    const id = generateId();
    const now = new Date().toISOString();
    const status = data.status ?? "todo";
    const priority = data.priority ?? "medium";
    const tags = JSON.stringify(data.tags ?? []);

    this.db
      .query(
        `INSERT INTO work_items (id, project_id, title, description, status, priority, tags, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        projectId,
        data.title,
        data.description ?? null,
        status,
        priority,
        tags,
        now,
        now,
      );

    return this.get(projectId, id)!;
  }

  update(projectId: string, id: string, data: WorkItemUpdate): WorkItem | null {
    const existing = this.get(projectId, id);
    if (!existing) return null;

    const now = new Date().toISOString();
    const title = data.title ?? existing.title;
    const description = data.description ?? existing.description;
    const status = data.status ?? existing.status;
    const priority = data.priority ?? existing.priority;
    const tags = data.tags ? JSON.stringify(data.tags) : JSON.stringify(existing.tags);

    this.db
      .query(
        `UPDATE work_items SET title = ?, description = ?, status = ?, priority = ?, tags = ?, updated_at = ?
         WHERE id = ? AND project_id = ?`,
      )
      .run(title, description ?? null, status, priority, tags, now, id, projectId);

    return this.get(projectId, id)!;
  }

  delete(projectId: string, id: string): boolean {
    const result = this.db
      .query("DELETE FROM work_items WHERE id = ? AND project_id = ?")
      .run(id, projectId);
    return result.changes > 0;
  }

  private rowToWorkItem(row: WorkItemRow): WorkItem {
    let tags: string[] = [];
    try {
      tags = JSON.parse(row.tags);
    } catch {
      tags = [];
    }

    return {
      id: row.id,
      projectId: row.project_id,
      title: row.title,
      description: row.description ?? undefined,
      status: row.status as WorkItem["status"],
      priority: row.priority as WorkItem["priority"],
      tags,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
