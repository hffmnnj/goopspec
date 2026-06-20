/**
 * GoopSpecDB — unified SQLite database for GoopSpec state, events,
 * documents, and field notes.
 *
 * Follows the same patterns as features/memory (bun:sqlite, FTS5 with
 * LIKE fallback, WAL mode, typed CRUD methods).
 */

import { Database } from "bun:sqlite";

import { runMigrations } from "./migrations.js";
import { initSchema } from "./schema.js";
import type {
  BlockerRow,
  ChronicleEventRow,
  DecisionRow,
  DocSectionRow,
  DocSectionSearchRow,
  DocType,
  DocumentRow,
  EventRow,
  FieldNoteRow,
  FtsNoteSearchRow,
  TraceabilityRow,
  VerificationRow,
  WaveProgressRow,
  WaveRow,
  WaveTaskRow,
  WorkflowRow,
  WorkflowSummaryRow,
} from "./types.js";

/** Named parameter bindings accepted by bun:sqlite. */
type NamedBindings = Record<string, string | bigint | number | boolean | null>;

type DocumentSearchRow = {
  source: "document" | "section";
  workflow_id: string;
  doc_type: string;
  section_key: string | null;
  content: string;
  created_at: number;
  rank: number;
};

export type DocumentSearchResult = Omit<DocumentSearchRow, "rank"> & {
  section_key?: string | null;
};

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
      const updated = `${existing.content}\n\n${content}`;
      this.upsertDocument(workflowId, docType, updated);
    } else {
      this.upsertDocument(workflowId, docType, content);
    }
  }

  // -----------------------------------------------------------------------
  // Waves
  // -----------------------------------------------------------------------

  upsertWave(
    workflowId: string,
    wave: {
      wave_number: number;
      title?: string;
      status?: string;
      pr_branch?: string;
      pr_url?: string;
      started_at?: number;
      completed_at?: number;
    },
  ): void {
    const now = Math.floor(Date.now() / 1000);
    const updates = ["updated_at = $now"];
    if (wave.title !== undefined) updates.push("title = $title");
    if (wave.status !== undefined) updates.push("status = $status");
    if (wave.pr_branch !== undefined) updates.push("pr_branch = $prBranch");
    if (wave.pr_url !== undefined) updates.push("pr_url = $prUrl");
    if (wave.started_at !== undefined) updates.push("started_at = $startedAt");
    if (wave.completed_at !== undefined) updates.push("completed_at = $completedAt");

    this.db
      .query<WaveRow, NamedBindings>(
        `INSERT INTO waves (
           workflow_id, wave_number, title, status, pr_branch, pr_url,
           started_at, completed_at, created_at, updated_at
         )
         VALUES (
           $workflowId, $waveNumber, $title, $status, $prBranch, $prUrl,
           $startedAt, $completedAt, $now, $now
         )
         ON CONFLICT(workflow_id, wave_number) DO UPDATE SET ${updates.join(", ")}`,
      )
      .run({
        $workflowId: workflowId,
        $waveNumber: wave.wave_number,
        $title: wave.title ?? "",
        $status: wave.status ?? "pending",
        $prBranch: wave.pr_branch ?? null,
        $prUrl: wave.pr_url ?? null,
        $startedAt: wave.started_at ?? null,
        $completedAt: wave.completed_at ?? null,
        $now: now,
      });
  }

  getWave(workflowId: string, waveNumber: number): WaveRow | null {
    return (
      this.db
        .query<WaveRow, NamedBindings>(
          "SELECT * FROM waves WHERE workflow_id = $workflowId AND wave_number = $waveNumber",
        )
        .get({ $workflowId: workflowId, $waveNumber: waveNumber }) ?? null
    );
  }

  getWaves(workflowId: string): WaveRow[] {
    return this.db
      .query<WaveRow, NamedBindings>(
        "SELECT * FROM waves WHERE workflow_id = $workflowId ORDER BY wave_number ASC",
      )
      .all({ $workflowId: workflowId });
  }

  getWaveProgress(workflowId: string, waveNumber?: number): WaveProgressRow[] {
    if (waveNumber !== undefined) {
      return this.db
        .query<WaveProgressRow, NamedBindings>(
          `SELECT * FROM v_wave_progress
           WHERE workflow_id = $workflowId AND wave_number = $waveNumber
           ORDER BY wave_number ASC`,
        )
        .all({ $workflowId: workflowId, $waveNumber: waveNumber });
    }

    return this.db
      .query<WaveProgressRow, NamedBindings>(
        `SELECT * FROM v_wave_progress
         WHERE workflow_id = $workflowId
         ORDER BY wave_number ASC`,
      )
      .all({ $workflowId: workflowId });
  }

  getWorkflowSummaries(): WorkflowSummaryRow[] {
    return this.db
      .query<WorkflowSummaryRow, []>(
        `SELECT workflow_id, total_waves, completed_waves, open_blockers, last_activity
         FROM v_workflow_summary
         ORDER BY last_activity DESC`,
      )
      .all();
  }

  // -----------------------------------------------------------------------
  // Wave tasks
  // -----------------------------------------------------------------------

  upsertWaveTask(task: {
    wave_id: number;
    workflow_id: string;
    task_index: number;
    description?: string;
    agent?: string;
    status?: string;
    started_at?: number;
    completed_at?: number;
  }): void {
    const now = Math.floor(Date.now() / 1000);
    const updates = ["updated_at = $now"];
    if (task.description !== undefined) updates.push("description = $description");
    if (task.agent !== undefined) updates.push("agent = $agent");
    if (task.status !== undefined) updates.push("status = $status");
    if (task.started_at !== undefined) updates.push("started_at = $startedAt");
    if (task.completed_at !== undefined) updates.push("completed_at = $completedAt");

    this.db
      .query<WaveTaskRow, NamedBindings>(
        `INSERT INTO wave_tasks (
           wave_id, workflow_id, task_index, description, agent, status,
           started_at, completed_at, created_at, updated_at
         )
         VALUES (
           $waveId, $workflowId, $taskIndex, $description, $agent, $status,
           $startedAt, $completedAt, $now, $now
         )
         ON CONFLICT(wave_id, task_index) DO UPDATE SET ${updates.join(", ")}`,
      )
      .run({
        $waveId: task.wave_id,
        $workflowId: task.workflow_id,
        $taskIndex: task.task_index,
        $description: task.description ?? "",
        $agent: task.agent ?? null,
        $status: task.status ?? "pending",
        $startedAt: task.started_at ?? null,
        $completedAt: task.completed_at ?? null,
        $now: now,
      });
  }

  getWaveTasks(waveId: number): WaveTaskRow[] {
    return this.db
      .query<WaveTaskRow, NamedBindings>(
        "SELECT * FROM wave_tasks WHERE wave_id = $waveId ORDER BY task_index ASC",
      )
      .all({ $waveId: waveId });
  }

  setWaveTaskStatus(waveId: number, taskIndex: number, status: string): void {
    const now = Math.floor(Date.now() / 1000);
    this.db
      .query<WaveTaskRow, NamedBindings>(
        `UPDATE wave_tasks
         SET status = $status, updated_at = $now
         WHERE wave_id = $waveId AND task_index = $taskIndex`,
      )
      .run({ $waveId: waveId, $taskIndex: taskIndex, $status: status, $now: now });
  }

  // -----------------------------------------------------------------------
  // Document sections
  // -----------------------------------------------------------------------

  upsertSection(
    workflowId: string,
    docType: DocType,
    sectionKey: string,
    content: string,
    position?: number,
  ): void {
    const now = Math.floor(Date.now() / 1000);
    const resolvedPosition = position ?? this.nextSectionPosition(workflowId, docType);

    this.db
      .query<DocSectionRow, NamedBindings>(
        `INSERT INTO doc_sections (
           workflow_id, doc_type, section_key, content, position, created_at, updated_at
         )
         VALUES ($workflowId, $docType, $sectionKey, $content, $position, $now, $now)
         ON CONFLICT(workflow_id, doc_type, section_key) DO UPDATE SET
           content = $content,
           position = $position,
           updated_at = $now`,
      )
      .run({
        $workflowId: workflowId,
        $docType: docType,
        $sectionKey: sectionKey,
        $content: content,
        $position: resolvedPosition,
        $now: now,
      });
  }

  getSection(workflowId: string, docType: DocType, sectionKey: string): DocSectionRow | null {
    return (
      this.db
        .query<DocSectionRow, NamedBindings>(
          `SELECT * FROM doc_sections
           WHERE workflow_id = $workflowId AND doc_type = $docType AND section_key = $sectionKey`,
        )
        .get({ $workflowId: workflowId, $docType: docType, $sectionKey: sectionKey }) ?? null
    );
  }

  getSections(workflowId: string, docType: DocType): DocSectionRow[] {
    return this.db
      .query<DocSectionRow, NamedBindings>(
        `SELECT * FROM doc_sections
         WHERE workflow_id = $workflowId AND doc_type = $docType
         ORDER BY position ASC, id ASC`,
      )
      .all({ $workflowId: workflowId, $docType: docType });
  }

  assembleDocument(workflowId: string, docType: DocType): string {
    return this.getSections(workflowId, docType)
      .map((section) => section.content)
      .join("\n\n");
  }

  searchSections(
    query: string,
    opts?: { workflowId?: string; docType?: DocType; sectionKey?: string; limit?: number },
  ): DocSectionRow[] {
    const limit = opts?.limit ?? 10;

    if (this.fts5Enabled && query.trim()) {
      return this.searchSectionsFts(query, opts, limit);
    }

    return this.searchSectionsLike(query, opts, limit);
  }

  // -----------------------------------------------------------------------
  // Tracking
  // -----------------------------------------------------------------------

  insertDecision(
    workflowId: string,
    d: { rule?: number; type?: string; description: string; action: string; files?: string[] },
  ): number {
    const result = this.db
      .query<DecisionRow, NamedBindings>(
        `INSERT INTO decisions (workflow_id, rule, type, description, action, files)
         VALUES ($workflowId, $rule, $type, $description, $action, $files)
         RETURNING id`,
      )
      .get({
        $workflowId: workflowId,
        $rule: d.rule ?? null,
        $type: d.type ?? "decision",
        $description: d.description,
        $action: d.action,
        $files: JSON.stringify(d.files ?? []),
      });
    return result?.id ?? -1;
  }

  getDecisions(opts?: {
    workflowId?: string;
    rule?: number;
    type?: string;
    limit?: number;
  }): DecisionRow[] {
    const clauses: string[] = [];
    const params: NamedBindings = { $limit: opts?.limit ?? 50 };
    if (opts?.workflowId !== undefined) {
      clauses.push("workflow_id = $workflowId");
      params.$workflowId = opts.workflowId;
    }
    if (opts?.rule !== undefined) {
      clauses.push("rule = $rule");
      params.$rule = opts.rule;
    }
    if (opts?.type !== undefined) {
      clauses.push("type = $type");
      params.$type = opts.type;
    }

    const whereClause = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
    return this.db
      .query<DecisionRow, NamedBindings>(
        `SELECT * FROM decisions ${whereClause} ORDER BY created_at DESC, id DESC LIMIT $limit`,
      )
      .all(params);
  }

  insertVerification(
    workflowId: string,
    v: { wave_id?: number; check_name: string; status: string; detail?: string },
  ): number {
    const result = this.db
      .query<VerificationRow, NamedBindings>(
        `INSERT INTO verifications (workflow_id, wave_id, check_name, status, detail)
         VALUES ($workflowId, $waveId, $checkName, $status, $detail)
         RETURNING id`,
      )
      .get({
        $workflowId: workflowId,
        $waveId: v.wave_id ?? null,
        $checkName: v.check_name,
        $status: v.status,
        $detail: v.detail ?? null,
      });
    return result?.id ?? -1;
  }

  getVerifications(workflowId: string, waveId?: number): VerificationRow[] {
    if (waveId !== undefined) {
      return this.db
        .query<VerificationRow, NamedBindings>(
          `SELECT * FROM verifications
           WHERE workflow_id = $workflowId AND wave_id = $waveId
           ORDER BY created_at DESC, id DESC`,
        )
        .all({ $workflowId: workflowId, $waveId: waveId });
    }

    return this.db
      .query<VerificationRow, NamedBindings>(
        `SELECT * FROM verifications
         WHERE workflow_id = $workflowId
         ORDER BY created_at DESC, id DESC`,
      )
      .all({ $workflowId: workflowId });
  }

  upsertBlocker(
    workflowId: string,
    b: {
      id?: number;
      wave_id?: number;
      description: string;
      severity?: string;
      status?: string;
      resolution?: string;
    },
  ): number {
    if (b.id !== undefined) {
      const result = this.db
        .query<BlockerRow, NamedBindings>(
          `UPDATE blockers
           SET wave_id = $waveId,
               description = $description,
               severity = $severity,
               status = $status,
               resolution = $resolution,
               resolved_at = CASE WHEN $status = 'resolved' THEN unixepoch() ELSE resolved_at END
           WHERE id = $id AND workflow_id = $workflowId
           RETURNING id`,
        )
        .get({
          $id: b.id,
          $workflowId: workflowId,
          $waveId: b.wave_id ?? null,
          $description: b.description,
          $severity: b.severity ?? "medium",
          $status: b.status ?? "open",
          $resolution: b.resolution ?? null,
        });
      return result?.id ?? -1;
    }

    const result = this.db
      .query<BlockerRow, NamedBindings>(
        `INSERT INTO blockers (workflow_id, wave_id, description, severity, status, resolution)
         VALUES ($workflowId, $waveId, $description, $severity, $status, $resolution)
         RETURNING id`,
      )
      .get({
        $workflowId: workflowId,
        $waveId: b.wave_id ?? null,
        $description: b.description,
        $severity: b.severity ?? "medium",
        $status: b.status ?? "open",
        $resolution: b.resolution ?? null,
      });
    return result?.id ?? -1;
  }

  getBlockers(workflowId: string, status?: string): BlockerRow[] {
    if (status !== undefined) {
      return this.db
        .query<BlockerRow, NamedBindings>(
          `SELECT * FROM blockers
           WHERE workflow_id = $workflowId AND status = $status
           ORDER BY created_at DESC, id DESC`,
        )
        .all({ $workflowId: workflowId, $status: status });
    }

    return this.db
      .query<BlockerRow, NamedBindings>(
        `SELECT * FROM blockers
         WHERE workflow_id = $workflowId
         ORDER BY created_at DESC, id DESC`,
      )
      .all({ $workflowId: workflowId });
  }

  upsertTraceability(
    workflowId: string,
    t: { requirement_key: string; wave_number?: number; task_index?: number; status?: string },
  ): void {
    const now = Math.floor(Date.now() / 1000);
    this.db
      .query<TraceabilityRow, NamedBindings>(
        `INSERT INTO traceability (
           workflow_id, requirement_key, wave_number, task_index, status, created_at, updated_at
         )
         VALUES ($workflowId, $requirementKey, $waveNumber, $taskIndex, $status, $now, $now)
         ON CONFLICT(workflow_id, requirement_key, wave_number, task_index) DO UPDATE SET
           status = $status,
           updated_at = $now`,
      )
      .run({
        $workflowId: workflowId,
        $requirementKey: t.requirement_key,
        $waveNumber: t.wave_number ?? null,
        $taskIndex: t.task_index ?? null,
        $status: t.status ?? "pending",
        $now: now,
      });
  }

  getTraceability(workflowId: string): TraceabilityRow[] {
    return this.db
      .query<TraceabilityRow, NamedBindings>(
        `SELECT * FROM traceability
         WHERE workflow_id = $workflowId
         ORDER BY requirement_key ASC, wave_number ASC, task_index ASC`,
      )
      .all({ $workflowId: workflowId });
  }

  searchDocuments(
    query: string,
    opts?: {
      workflowId?: string;
      docType?: DocType;
      sectionKey?: string;
      since?: number;
      until?: number;
      limit?: number;
    },
  ): DocumentSearchResult[] {
    const limit = opts?.limit ?? 20;
    const rows =
      this.fts5Enabled && query.trim()
        ? this.searchDocumentsFts(query, opts, limit)
        : this.searchDocumentsLike(query, opts, limit);
    return rows.map(({ rank: _rank, ...result }) => result);
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

  private nextSectionPosition(workflowId: string, docType: DocType): number {
    const row = this.db
      .query<{ next_position: number | null }, NamedBindings>(
        `SELECT COALESCE(MAX(position) + 1, 0) AS next_position
         FROM doc_sections
         WHERE workflow_id = $workflowId AND doc_type = $docType`,
      )
      .get({ $workflowId: workflowId, $docType: docType });
    return row?.next_position ?? 0;
  }

  private searchSectionsFts(
    query: string,
    opts: { workflowId?: string; docType?: DocType; sectionKey?: string } | undefined,
    limit: number,
  ): DocSectionRow[] {
    const ftsQuery = sanitiseFtsQuery(query);
    if (!ftsQuery) return [];

    const { whereClause, params } = this.buildSectionFilters(opts);
    params.$ftsQuery = ftsQuery;
    params.$limit = limit;

    const sql = `
      SELECT ds.*, bm25(doc_sections_fts, 5.0, 1.0) AS rank
      FROM doc_sections ds
      JOIN doc_sections_fts ON ds.id = doc_sections_fts.rowid
      WHERE doc_sections_fts MATCH $ftsQuery ${whereClause}
      ORDER BY ABS(rank) DESC, ds.updated_at DESC
      LIMIT $limit
    `;

    const rows = this.db.query<DocSectionSearchRow, NamedBindings>(sql).all(params);
    return rows.map(({ rank: _rank, ...section }) => section);
  }

  private searchSectionsLike(
    query: string,
    opts: { workflowId?: string; docType?: DocType; sectionKey?: string } | undefined,
    limit: number,
  ): DocSectionRow[] {
    const { whereClause, params } = this.buildSectionFilters(opts);
    params.$limit = limit;

    let matchClause = "";
    if (query.trim()) {
      params.$pattern = this.likePattern(query);
      matchClause =
        "(ds.section_key LIKE $pattern ESCAPE '\\' OR ds.content LIKE $pattern ESCAPE '\\') AND";
    }

    const sql = `
      SELECT ds.* FROM doc_sections ds
      WHERE ${matchClause} 1=1 ${whereClause}
      ORDER BY ds.updated_at DESC, ds.position ASC, ds.id ASC
      LIMIT $limit
    `;

    return this.db.query<DocSectionRow, NamedBindings>(sql).all(params);
  }

  private searchDocumentsFts(
    query: string,
    opts:
      | {
          workflowId?: string;
          docType?: DocType;
          sectionKey?: string;
          since?: number;
          until?: number;
        }
      | undefined,
    limit: number,
  ): DocumentSearchRow[] {
    const ftsQuery = sanitiseFtsQuery(query);
    if (!ftsQuery) return [];

    const documentFilters = this.buildDocumentSearchFilters(opts, "d", false);
    const sectionFilters = this.buildDocumentSearchFilters(opts, "ds", true);
    documentFilters.params.$ftsQuery = ftsQuery;
    sectionFilters.params.$ftsQuery = ftsQuery;
    documentFilters.params.$limit = limit;
    sectionFilters.params.$limit = limit;

    const documents = this.db
      .query<DocumentSearchRow, NamedBindings>(
        `SELECT 'document' AS source,
                d.workflow_id AS workflow_id,
                d.doc_type AS doc_type,
                NULL AS section_key,
                d.content AS content,
                d.created_at AS created_at,
                bm25(documents_fts, 3.0, 1.0) AS rank
         FROM documents d
         JOIN documents_fts ON d.id = documents_fts.rowid
         WHERE documents_fts MATCH $ftsQuery ${documentFilters.whereClause}
         ORDER BY ABS(rank) DESC, d.created_at DESC
         LIMIT $limit`,
      )
      .all(documentFilters.params);

    const sections = this.db
      .query<DocumentSearchRow, NamedBindings>(
        `SELECT 'section' AS source,
                ds.workflow_id AS workflow_id,
                ds.doc_type AS doc_type,
                ds.section_key AS section_key,
                ds.content AS content,
                ds.created_at AS created_at,
                bm25(doc_sections_fts, 5.0, 1.0) AS rank
         FROM doc_sections ds
         JOIN doc_sections_fts ON ds.id = doc_sections_fts.rowid
         WHERE doc_sections_fts MATCH $ftsQuery ${sectionFilters.whereClause}
         ORDER BY ABS(rank) DESC, ds.created_at DESC
         LIMIT $limit`,
      )
      .all(sectionFilters.params);

    return [...documents, ...sections]
      .sort((a, b) => Math.abs(b.rank) - Math.abs(a.rank) || b.created_at - a.created_at)
      .slice(0, limit);
  }

  private searchDocumentsLike(
    query: string,
    opts:
      | {
          workflowId?: string;
          docType?: DocType;
          sectionKey?: string;
          since?: number;
          until?: number;
        }
      | undefined,
    limit: number,
  ): DocumentSearchRow[] {
    const documentFilters = this.buildDocumentSearchFilters(opts, "d", false);
    const sectionFilters = this.buildDocumentSearchFilters(opts, "ds", true);
    documentFilters.params.$limit = limit;
    sectionFilters.params.$limit = limit;

    let documentMatchClause = "";
    let sectionMatchClause = "";
    if (query.trim()) {
      const pattern = this.likePattern(query);
      documentFilters.params.$pattern = pattern;
      sectionFilters.params.$pattern = pattern;
      documentMatchClause =
        "(d.doc_type LIKE $pattern ESCAPE '\\' OR d.content LIKE $pattern ESCAPE '\\') AND";
      sectionMatchClause =
        "(ds.section_key LIKE $pattern ESCAPE '\\' OR ds.content LIKE $pattern ESCAPE '\\') AND";
    }

    const documents = this.db
      .query<DocumentSearchRow, NamedBindings>(
        `SELECT 'document' AS source,
                d.workflow_id AS workflow_id,
                d.doc_type AS doc_type,
                NULL AS section_key,
                d.content AS content,
                d.created_at AS created_at,
                0 AS rank
         FROM documents d
         WHERE ${documentMatchClause} 1=1 ${documentFilters.whereClause}
         ORDER BY d.created_at DESC
         LIMIT $limit`,
      )
      .all(documentFilters.params);

    const sections = this.db
      .query<DocumentSearchRow, NamedBindings>(
        `SELECT 'section' AS source,
                ds.workflow_id AS workflow_id,
                ds.doc_type AS doc_type,
                ds.section_key AS section_key,
                ds.content AS content,
                ds.created_at AS created_at,
                0 AS rank
         FROM doc_sections ds
         WHERE ${sectionMatchClause} 1=1 ${sectionFilters.whereClause}
         ORDER BY ds.created_at DESC
         LIMIT $limit`,
      )
      .all(sectionFilters.params);

    return [...documents, ...sections]
      .sort((a, b) => b.created_at - a.created_at)
      .slice(0, limit);
  }

  private buildSectionFilters(
    opts: { workflowId?: string; docType?: DocType; sectionKey?: string } | undefined,
  ): { whereClause: string; params: NamedBindings } {
    const clauses: string[] = [];
    const params: NamedBindings = {};

    if (opts?.workflowId !== undefined) {
      clauses.push("ds.workflow_id = $workflowId");
      params.$workflowId = opts.workflowId;
    }

    if (opts?.docType !== undefined) {
      clauses.push("ds.doc_type = $docType");
      params.$docType = opts.docType;
    }

    if (opts?.sectionKey !== undefined) {
      clauses.push("ds.section_key = $sectionKey");
      params.$sectionKey = opts.sectionKey;
    }

    const whereClause = clauses.length > 0 ? ` AND ${clauses.join(" AND ")}` : "";
    return { whereClause, params };
  }

  private buildDocumentSearchFilters(
    opts:
      | {
          workflowId?: string;
          docType?: DocType;
          sectionKey?: string;
          since?: number;
          until?: number;
        }
      | undefined,
    alias: "d" | "ds",
    includeSectionKey: boolean,
  ): { whereClause: string; params: NamedBindings } {
    const clauses: string[] = [];
    const params: NamedBindings = {};

    if (opts?.workflowId !== undefined) {
      clauses.push(`${alias}.workflow_id = $workflowId`);
      params.$workflowId = opts.workflowId;
    }

    if (opts?.docType !== undefined) {
      clauses.push(`${alias}.doc_type = $docType`);
      params.$docType = opts.docType;
    }

    if (includeSectionKey && opts?.sectionKey !== undefined) {
      clauses.push(`${alias}.section_key = $sectionKey`);
      params.$sectionKey = opts.sectionKey;
    }

    if (opts?.since !== undefined) {
      clauses.push(`${alias}.created_at >= $since`);
      params.$since = opts.since;
    }

    if (opts?.until !== undefined) {
      clauses.push(`${alias}.created_at <= $until`);
      params.$until = opts.until;
    }

    const whereClause = clauses.length > 0 ? ` AND ${clauses.join(" AND ")}` : "";
    return { whereClause, params };
  }

  private likePattern(query: string): string {
    return `%${query.replace(/%/g, "\\%").replace(/_/g, "\\_")}%`;
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
