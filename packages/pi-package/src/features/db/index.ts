/**
 * GoopSpecDB — unified SQLite database for GoopSpec state, events,
 * documents, and field notes.
 *
 * Follows the same patterns as features/memory (bun:sqlite, FTS5 with
 * LIKE fallback, WAL mode, typed CRUD methods).
 */

import { Database } from "bun:sqlite";
import fs from "node:fs";
import path from "node:path";

import { runMigrations } from "./migrations.js";
import { initSchema } from "./schema.js";
import type {
  ChronicleEventRow,
  DocType,
  DocumentRow,
  EventRow,
  FieldNoteRow,
  FtsNoteSearchRow,
  WorkflowRow,
} from "./types.js";

/** Named parameter bindings accepted by bun:sqlite. */
type NamedBindings = Record<string, string | bigint | number | boolean | null>;

// ---------------------------------------------------------------------------
// FTS5 query sanitisation
// ---------------------------------------------------------------------------

/**
 * Escape a user query for safe use in an FTS5 MATCH expression.
 *
 * Strips FTS5 operators, wraps each token in double-quotes with a
 * prefix wildcard, and joins with OR.
 */
function sanitiseFtsQuery(raw: string): string {
  return raw
    .replace(/[*"(){}:^~<>]/g, " ")
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0)
    .map((w) => `"${w}"*`)
    .join(" OR ");
}

// ---------------------------------------------------------------------------
// GoopSpecDB
// ---------------------------------------------------------------------------

export class GoopSpecDB {
  private readonly db: Database;
  public readonly fts5Enabled: boolean;

  constructor(dbPath: string) {
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    this.db = new Database(dbPath, { create: true });
    const result = initSchema(this.db);
    runMigrations(this.db);
    this.fts5Enabled = result.fts5Enabled;
  }

  close(): void {
    try {
      this.db.close();
    } catch {
      // Already closed or never opened.
    }
  }

  /**
   * Return the highest applied schema version, or null if the
   * schema_version table is empty or unreadable.
   */
  getSchemaVersion(): number | null {
    try {
      const row = this.db
        .query<{ v: number | null }, []>("SELECT MAX(version) as v FROM schema_version")
        .get();
      return row?.v ?? null;
    } catch {
      return null;
    }
  }

  // -----------------------------------------------------------------------
  // Workflows
  // -----------------------------------------------------------------------

  getWorkflow(id: string): WorkflowRow | null {
    return (
      this.db
        .query<WorkflowRow, NamedBindings>("SELECT * FROM workflows WHERE id = $id")
        .get({ $id: id }) ?? null
    );
  }

  getAllWorkflows(): WorkflowRow[] {
    return this.db.query<WorkflowRow, []>("SELECT * FROM workflows ORDER BY updated_at DESC").all();
  }

  upsertWorkflow(id: string, state: object): void {
    const now = Math.floor(Date.now() / 1000);
    this.db
      .query<WorkflowRow, NamedBindings>(
        `INSERT INTO workflows (id, state, created_at, updated_at)
         VALUES ($id, $state, $now, $now)
         ON CONFLICT(id) DO UPDATE SET state = $state, updated_at = $now`,
      )
      .run({ $id: id, $state: JSON.stringify(state), $now: now });
  }

  deleteWorkflow(id: string): void {
    this.db
      .query<WorkflowRow, NamedBindings>("DELETE FROM workflows WHERE id = $id")
      .run({ $id: id });
  }

  // -----------------------------------------------------------------------
  // Events
  // -----------------------------------------------------------------------

  appendEvent(workflowId: string, eventType: string, payload: object): number {
    const result = this.db
      .query<EventRow, NamedBindings>(
        `INSERT INTO events (workflow_id, event_type, payload)
         VALUES ($workflowId, $eventType, $payload)
         RETURNING id`,
      )
      .get({
        $workflowId: workflowId,
        $eventType: eventType,
        $payload: JSON.stringify(payload),
      });

    return result?.id ?? -1;
  }

  getEvents(workflowId: string, eventType?: string): EventRow[] {
    if (eventType) {
      return this.db
        .query<EventRow, NamedBindings>(
          `SELECT * FROM events
           WHERE workflow_id = $workflowId AND event_type = $eventType
           ORDER BY created_at ASC`,
        )
        .all({ $workflowId: workflowId, $eventType: eventType });
    }

    return this.db
      .query<EventRow, NamedBindings>(
        `SELECT * FROM events
         WHERE workflow_id = $workflowId
         ORDER BY created_at ASC`,
      )
      .all({ $workflowId: workflowId });
  }

  // -----------------------------------------------------------------------
  // Documents
  // -----------------------------------------------------------------------

  getDocument(workflowId: string, docType: DocType): DocumentRow | null {
    return (
      this.db
        .query<DocumentRow, NamedBindings>(
          "SELECT * FROM documents WHERE workflow_id = $workflowId AND doc_type = $docType",
        )
        .get({ $workflowId: workflowId, $docType: docType }) ?? null
    );
  }

  getAllDocuments(workflowId: string): DocumentRow[] {
    return this.db
      .query<DocumentRow, NamedBindings>(
        "SELECT * FROM documents WHERE workflow_id = $workflowId ORDER BY doc_type ASC",
      )
      .all({ $workflowId: workflowId });
  }

  upsertDocument(workflowId: string, docType: DocType, content: string): void {
    const now = Math.floor(Date.now() / 1000);
    this.db
      .query<DocumentRow, NamedBindings>(
        `INSERT INTO documents (workflow_id, doc_type, content, created_at, updated_at)
         VALUES ($workflowId, $docType, $content, $now, $now)
         ON CONFLICT(workflow_id, doc_type) DO UPDATE SET content = $content, updated_at = $now`,
      )
      .run({
        $workflowId: workflowId,
        $docType: docType,
        $content: content,
        $now: now,
      });
  }

  appendDocument(workflowId: string, docType: DocType, content: string): void {
    const existing = this.getDocument(workflowId, docType);
    if (existing) {
      const updated = existing.content + "\n\n" + content;
      this.upsertDocument(workflowId, docType, updated);
    } else {
      this.upsertDocument(workflowId, docType, content);
    }
  }

  // -----------------------------------------------------------------------
  // Chronicle Events
  // -----------------------------------------------------------------------

  appendChronicleEvent(workflowId: string, entry: string): number {
    const result = this.db
      .query<ChronicleEventRow, NamedBindings>(
        `INSERT INTO chronicle_events (workflow_id, entry)
         VALUES ($workflowId, $entry)
         RETURNING id`,
      )
      .get({ $workflowId: workflowId, $entry: entry });
    return result?.id ?? -1;
  }

  getChronicleEvents(workflowId: string): ChronicleEventRow[] {
    return this.db
      .query<ChronicleEventRow, NamedBindings>(
        `SELECT id, workflow_id, entry, created_at FROM chronicle_events
         WHERE workflow_id = $workflowId
         ORDER BY created_at ASC`,
      )
      .all({ $workflowId: workflowId });
  }

  listDocTypes(workflowId: string): DocType[] {
    const rows = this.db
      .query<{ doc_type: string }, NamedBindings>(
        "SELECT doc_type FROM documents WHERE workflow_id = $workflowId ORDER BY doc_type ASC",
      )
      .all({ $workflowId: workflowId });

    return rows.map((r) => r.doc_type as DocType);
  }

  // -----------------------------------------------------------------------
  // Markdown sidecar rendering
  // -----------------------------------------------------------------------

  renderMarkdownSidecar(
    projectDir: string,
    workflowId: string,
    docType: DocType,
    content: string,
  ): void {
    const dir = path.join(projectDir, ".goopspec", workflowId);
    fs.mkdirSync(dir, { recursive: true });
    const filename = docType.toUpperCase().replace(/-/g, "_") + ".md";
    fs.writeFileSync(path.join(dir, filename), content, "utf8");
  }

  // -----------------------------------------------------------------------
  // Field Notes
  // -----------------------------------------------------------------------

  saveNote(note: Omit<FieldNoteRow, "created_at">): void {
    this.db
      .query<FieldNoteRow, NamedBindings>(
        `INSERT INTO field_notes (id, title, body, tags, source_agent, importance, workflow_id, project_id)
         VALUES ($id, $title, $body, $tags, $sourceAgent, $importance, $workflowId, $projectId)`,
      )
      .run({
        $id: note.id,
        $title: note.title,
        $body: note.body,
        $tags: note.tags,
        $sourceAgent: note.source_agent,
        $importance: note.importance,
        $workflowId: note.workflow_id,
        $projectId: note.project_id,
      });
  }

  searchNotes(
    query: string,
    opts?: {
      projectId?: string | null;
      workflowId?: string | null;
      tags?: string[];
      limit?: number;
    },
  ): FieldNoteRow[] {
    const limit = opts?.limit ?? 10;

    if (this.fts5Enabled && query.trim()) {
      return this.searchNotesFts(query, opts, limit);
    }

    return this.searchNotesLike(query, opts, limit);
  }

  getNoteById(id: string): FieldNoteRow | null {
    return (
      this.db
        .query<FieldNoteRow, NamedBindings>("SELECT * FROM field_notes WHERE id = $id")
        .get({ $id: id }) ?? null
    );
  }

  // -----------------------------------------------------------------------
  // Private: FTS5 note search
  // -----------------------------------------------------------------------

  private searchNotesFts(
    query: string,
    opts: { projectId?: string | null; workflowId?: string | null; tags?: string[] } | undefined,
    limit: number,
  ): FieldNoteRow[] {
    const ftsQuery = sanitiseFtsQuery(query);
    if (!ftsQuery) return [];

    const { whereClause, params } = this.buildNoteFilters(opts);
    params.$ftsQuery = ftsQuery;
    params.$limit = limit;

    const sql = `
      SELECT fn.*, bm25(field_notes_fts, 10.0, 5.0, 2.0) AS rank
      FROM field_notes fn
      JOIN field_notes_fts ON fn.rowid = field_notes_fts.rowid
      WHERE field_notes_fts MATCH $ftsQuery ${whereClause}
      ORDER BY (ABS(rank) * (fn.importance / 10.0)) DESC
      LIMIT $limit
    `;

    const rows = this.db.query<FtsNoteSearchRow, NamedBindings>(sql).all(params);
    return rows.map(({ rank: _rank, ...note }) => note);
  }

  // -----------------------------------------------------------------------
  // Private: LIKE fallback note search
  // -----------------------------------------------------------------------

  private searchNotesLike(
    query: string,
    opts: { projectId?: string | null; workflowId?: string | null; tags?: string[] } | undefined,
    limit: number,
  ): FieldNoteRow[] {
    const { whereClause, params } = this.buildNoteFilters(opts);
    params.$limit = limit;

    let matchClause = "";
    if (query.trim()) {
      const pattern = `%${query.replace(/%/g, "\\%").replace(/_/g, "\\_")}%`;
      params.$pattern = pattern;
      matchClause = `(fn.title LIKE $pattern ESCAPE '\\' OR fn.body LIKE $pattern ESCAPE '\\') AND`;
    }

    const sql = `
      SELECT fn.* FROM field_notes fn
      WHERE ${matchClause} 1=1 ${whereClause}
      ORDER BY fn.importance DESC, fn.created_at DESC
      LIMIT $limit
    `;

    return this.db.query<FieldNoteRow, NamedBindings>(sql).all(params);
  }

  // -----------------------------------------------------------------------
  // Private: Note filter builder
  // -----------------------------------------------------------------------

  private buildNoteFilters(
    opts: { projectId?: string | null; workflowId?: string | null; tags?: string[] } | undefined,
  ): { whereClause: string; params: NamedBindings } {
    const clauses: string[] = [];
    const params: NamedBindings = {};

    if (opts?.projectId != null) {
      clauses.push("fn.project_id = $projectId");
      params.$projectId = opts.projectId;
    }

    if (opts?.workflowId != null) {
      clauses.push("fn.workflow_id = $workflowId");
      params.$workflowId = opts.workflowId;
    }

    if (opts?.tags?.length) {
      const tagClauses = opts.tags.map((_, i) => `fn.tags LIKE $tag${i}`);
      clauses.push(`(${tagClauses.join(" OR ")})`);
      for (const [i, tag] of opts.tags.entries()) {
        params[`$tag${i}`] = `%"${tag}"%`;
      }
    }

    const whereClause = clauses.length > 0 ? ` AND ${clauses.join(" AND ")}` : "";
    return { whereClause, params };
  }
}
