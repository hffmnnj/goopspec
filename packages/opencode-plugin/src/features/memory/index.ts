/**
 * In-process memory system backed by bun:sqlite with FTS5 full-text search.
 *
 * Implements the MemoryManager interface from core/types.ts.
 * No separate worker process, no port — purely in-process.
 */

import { Database } from "bun:sqlite";

import type {
  MemoryEntry,
  MemoryManager,
  MemorySaveInput,
  MemorySearchOptions,
  MemorySearchResult,
} from "../../core/types.js";
import { initSchema } from "./schema.js";
import type { FtsSearchRow, MemoryManagerOptions, MemoryRow } from "./types.js";

/** Named parameter bindings accepted by bun:sqlite. */
type NamedBindings = Record<string, string | bigint | number | boolean | null>;

const DEDUPLICATION_SIMILARITY_THRESHOLD = 0.85;
const DEDUPLICATION_CANDIDATE_LIMIT = 20;

// ---------------------------------------------------------------------------
// Row ↔ MemoryEntry conversion
// ---------------------------------------------------------------------------

function rowToEntry(row: MemoryRow): MemoryEntry {
  return {
    id: row.id,
    type: row.type as MemoryEntry["type"],
    title: row.title,
    content: row.content,
    facts: safeParse(row.facts),
    concepts: safeParse(row.concepts),
    importance: row.importance,
    sourceFiles: safeParse(row.source_files),
    createdAt: row.created_at,
  };
}

function safeParse(json: string): string[] {
  try {
    const parsed: unknown = JSON.parse(json);
    return Array.isArray(parsed) ? (parsed as string[]) : [];
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// FTS5 query sanitisation
// ---------------------------------------------------------------------------

/**
 * Escape a user query for safe use in an FTS5 MATCH expression.
 *
 * Strips FTS5 operators, splits on whitespace, wraps each token in
 * double-quotes with a prefix wildcard, and joins with OR.
 */
function sanitiseFtsQuery(raw: string): string {
  return tokeniseFtsQuery(raw)
    .map((token) => `"${token}"*`)
    .join(" OR ");
}

/**
 * Extract the safe query tokens shared by FTS query construction and metadata
 * overlap scoring. Keeping this normalization in one place prevents the two
 * retrieval signals from interpreting user input differently.
 */
function tokeniseFtsQuery(raw: string): string[] {
  return raw
    .replace(/[*"(){}:^~<>]/g, " ")
    .trim()
    .split(/\s+/)
    .filter((token) => token.length > 0);
}

// ---------------------------------------------------------------------------
// SqliteMemoryManager
// ---------------------------------------------------------------------------

export class SqliteMemoryManager implements MemoryManager {
  private db: Database;
  private fts5Enabled: boolean;

  constructor(opts: MemoryManagerOptions) {
    this.db = new Database(opts.dbPath, { create: true });
    const result = initSchema(this.db);
    this.fts5Enabled = result.fts5Enabled;
  }

  /** Expose FTS5 status for tests / diagnostics. */
  get hasFts5(): boolean {
    return this.fts5Enabled;
  }

  // -----------------------------------------------------------------------
  // save
  // -----------------------------------------------------------------------

  async save(input: MemorySaveInput): Promise<MemoryEntry> {
    try {
      const importance = clampImportance(input.importance);
      const now = Math.floor(Date.now() / 1000);
      const content = buildContent(input);

      if (input.deduplicate) {
        const duplicate = this.findNearDuplicate(`${input.title} ${content}`);
        if (duplicate) {
          return this.reinforceDuplicate(duplicate.id, importance, now);
        }
      }

      const row = this.db
        .query<MemoryRow, NamedBindings>(
          `INSERT INTO memories (type, title, content, facts, concepts, source_files, importance, created_at)
           VALUES ($type, $title, $content, $facts, $concepts, $sourceFiles, $importance, $createdAt)
           RETURNING *`,
        )
        .get({
          $type: input.type,
          $title: input.title,
          $content: content,
          $facts: JSON.stringify(input.facts ?? []),
          $concepts: JSON.stringify(input.concepts ?? []),
          $sourceFiles: JSON.stringify(input.sourceFiles ?? []),
          $importance: importance,
          $createdAt: now,
        });

      if (!row) {
        throw new Error("INSERT RETURNING produced no row");
      }

      return rowToEntry(row);
    } catch {
      // Graceful degradation: return a synthetic entry so callers never throw.
      return fallbackEntry(input);
    }
  }

  // -----------------------------------------------------------------------
  // search
  // -----------------------------------------------------------------------

  async search(options: MemorySearchOptions): Promise<MemorySearchResult[]> {
    try {
      if (!options.query.trim()) return [];

      return this.fts5Enabled ? this.searchFts(options) : this.searchLike(options);
    } catch {
      return [];
    }
  }

  // -----------------------------------------------------------------------
  // getById
  // -----------------------------------------------------------------------

  async getById(id: number): Promise<MemoryEntry | null> {
    try {
      const row = this.db
        .query<MemoryRow, NamedBindings>("SELECT * FROM memories WHERE id = $id")
        .get({ $id: id });
      return row ? rowToEntry(row) : null;
    } catch {
      return null;
    }
  }

  // -----------------------------------------------------------------------
  // forget (by id)
  // -----------------------------------------------------------------------

  async forget(id: number): Promise<boolean> {
    try {
      const result = this.db
        .query<MemoryRow, NamedBindings>("DELETE FROM memories WHERE id = $id")
        .run({ $id: id });
      return result.changes > 0;
    } catch {
      return false;
    }
  }

  // -----------------------------------------------------------------------
  // forgetByQuery
  // -----------------------------------------------------------------------

  async forgetByQuery(query: string): Promise<number> {
    try {
      if (!query.trim()) return 0;

      const matches = await this.search({ query, limit: 100 });
      if (matches.length === 0) return 0;

      const ids = matches.map((m) => m.memory.id);
      for (const id of ids) {
        this.db.query("DELETE FROM memories WHERE id = $id").run({ $id: id });
      }
      // Return the count of matched entries we deleted (not result.changes,
      // which is inflated by FTS5 sync triggers).
      return ids.length;
    } catch {
      return 0;
    }
  }

  // -----------------------------------------------------------------------
  // close
  // -----------------------------------------------------------------------

  close(): void {
    try {
      this.db.close();
    } catch {
      // Already closed or never opened — safe to ignore.
    }
  }

  // -----------------------------------------------------------------------
  // Private: FTS5 search
  // -----------------------------------------------------------------------

  private searchFts(options: MemorySearchOptions): MemorySearchResult[] {
    const ftsQuery = sanitiseFtsQuery(options.query);
    if (!ftsQuery) return [];

    const queryTokens = tokeniseFtsQuery(options.query);
    const { whereClause, params } = buildFilters(options);
    const limit = options.limit ?? 10;
    const candidateLimit = conceptBoostCandidateLimit(limit);

    // Keep the score fragments separate so additional retrieval signals can
    // extend the final score without rewriting the base relevance formula.
    const decayFactorSql = memoryDecayFactorSql("m.created_at");
    const bm25ScoreSql = "ABS(bm25(memories_fts, 10.0, 5.0, 2.0, 2.0))";
    const relevanceScoreSql = `(${bm25ScoreSql} * (m.importance / 10.0))`;
    const finalScoreSql = `(${relevanceScoreSql} * ${decayFactorSql})`;

    // BM25 weights: title=10, content=5, facts=2, concepts=2.
    const sql = `
      SELECT m.*, bm25(memories_fts, 10.0, 5.0, 2.0, 2.0) AS rank,
        ${finalScoreSql} AS score
      FROM memories m
      JOIN memories_fts ON m.id = memories_fts.rowid
      WHERE memories_fts MATCH '${ftsQuery}' ${whereClause}
      ORDER BY score DESC
      LIMIT ${candidateLimit}
    `;

    const rows = this.db.query<FtsSearchRow, NamedBindings>(sql).all(params);

    return scoreAndLimitResults(rows, queryTokens, limit, (row) => row.score);
  }

  // -----------------------------------------------------------------------
  // Private: LIKE fallback search
  // -----------------------------------------------------------------------

  private searchLike(options: MemorySearchOptions): MemorySearchResult[] {
    const pattern = `%${options.query.replace(/%/g, "\\%").replace(/_/g, "\\_")}%`;
    const { whereClause, params } = buildFilters(options);
    const limit = options.limit ?? 10;
    const queryTokens = tokeniseFtsQuery(options.query);
    const candidateLimit = conceptBoostCandidateLimit(limit);

    params.$pattern = pattern;

    const decayFactorSql = memoryDecayFactorSql("m.created_at");
    const finalScoreSql = `((m.importance / 10.0) * ${decayFactorSql})`;

    const sql = `
      SELECT * FROM memories m
      WHERE (m.title LIKE $pattern ESCAPE '\\' OR m.content LIKE $pattern ESCAPE '\\' OR m.facts LIKE $pattern ESCAPE '\\' OR m.concepts LIKE $pattern ESCAPE '\\')
      ${whereClause}
      ORDER BY ${finalScoreSql} DESC
      LIMIT ${candidateLimit}
    `;

    const rows = this.db.query<MemoryRow, NamedBindings>(sql).all(params);

    return scoreAndLimitResults(
      rows,
      queryTokens,
      limit,
      (row) => (row.importance / 10) * memoryDecayFactor(row.created_at),
    );
  }

  /**
   * Select FTS5's strongest candidates, then calculate a bounded lexical
   * similarity score over the same title/content tokens used for the MATCH
   * query. BM25 determines candidacy and ordering; token F1 makes the 0.85
   * threshold stable across SQLite corpora, whose BM25 magnitudes are not.
   */
  private findNearDuplicate(query: string): MemoryRow | null {
    if (!this.fts5Enabled) return null;

    const ftsQuery = sanitiseFtsQuery(query);
    if (!ftsQuery) return null;

    const rows = this.db
      .query<FtsSearchRow, NamedBindings>(
        `SELECT m.*, bm25(memories_fts, 10.0, 5.0, 2.0, 2.0) AS rank, 0 AS score
         FROM memories m
         JOIN memories_fts ON m.id = memories_fts.rowid
         WHERE memories_fts MATCH '${ftsQuery}'
         ORDER BY rank ASC
         LIMIT ${DEDUPLICATION_CANDIDATE_LIMIT}`,
      )
      .all({});

    let bestMatch: MemoryRow | null = null;
    let bestSimilarity = 0;
    for (const row of rows) {
      const similarity = normalisedTokenF1(query, `${row.title} ${row.content}`);
      if (similarity > bestSimilarity) {
        bestSimilarity = similarity;
        bestMatch = row;
      }
    }

    return bestSimilarity >= DEDUPLICATION_SIMILARITY_THRESHOLD ? bestMatch : null;
  }

  /** Reinforce rather than overwrite a matched memory; no row is deleted. */
  private reinforceDuplicate(id: number, importance: number, now: number): MemoryEntry {
    const row = this.db
      .query<MemoryRow, NamedBindings>(
        `UPDATE memories
         SET importance = MAX(importance, $importance), created_at = $createdAt
         WHERE id = $id
         RETURNING *`,
      )
      .get({ $id: id, $importance: importance, $createdAt: now });

    if (!row) {
      throw new Error("Duplicate reinforcement produced no row");
    }
    return rowToEntry(row);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clampImportance(raw: number | undefined): number {
  if (raw == null) return 5;
  // Support 0-1 scale: scale up to 1-10
  const scaled = raw > 0 && raw <= 1 ? Math.round(raw * 10) : raw;
  return Math.max(1, Math.min(10, Math.round(scaled)));
}

function buildContent(input: MemorySaveInput): string {
  let content = input.content;
  if (input.reasoning) {
    content += `\n\nReasoning: ${input.reasoning}`;
  }
  if (input.alternatives?.length) {
    content += `\n\nAlternatives considered: ${input.alternatives.join(", ")}`;
  }
  return content;
}

/**
 * Bounded F1 overlap of distinct FTS-normalized tokens. A score of 1 means
 * identical token sets; 0.85 requires substantial overlap in both entries.
 */
function normalisedTokenF1(left: string, right: string): number {
  const leftTokens = new Set(tokeniseFtsQuery(left).map((token) => token.toLowerCase()));
  const rightTokens = new Set(tokeniseFtsQuery(right).map((token) => token.toLowerCase()));
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0;

  let shared = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) shared += 1;
  }
  return (2 * shared) / (leftTokens.size + rightTokens.size);
}

function roundScore(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Bound the post-query scoring set while giving a metadata match room to
 * overtake near-neighbour BM25/importance results.
 */
function conceptBoostCandidateLimit(limit: number): number {
  return Math.max(limit, Math.min(limit * 5, 100));
}

/**
 * Fraction of normalized query tokens represented in concepts or facts.
 * Metadata arrays are short JSON payloads, so case-insensitive substring
 * matching is both predictable and sufficient for this lightweight signal.
 */
function conceptBoost(row: MemoryRow, queryTokens: string[]): number {
  if (queryTokens.length === 0) return 0;

  const metadata = [...safeParse(row.concepts), ...safeParse(row.facts)].join(" ").toLowerCase();
  const matchingTokens = queryTokens.filter((token) =>
    metadata.includes(token.toLowerCase()),
  ).length;
  return Math.max(0, Math.min(1, matchingTokens / queryTokens.length));
}

function scoreAndLimitResults<T extends MemoryRow>(
  rows: T[],
  queryTokens: string[],
  limit: number,
  baseScore: (row: T) => number,
): MemorySearchResult[] {
  return rows
    .map((row) => {
      const boostedScore = baseScore(row) * (0.7 + 0.3 * conceptBoost(row, queryTokens));
      return {
        memory: rowToEntry(row),
        score: boostedScore,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((result) => ({
      ...result,
      score: roundScore(result.score),
      matchType: "fts" as const, // Report as fts for interface compatibility.
    }));
}

/**
 * Applies the retrieval recency decay specified for persisted Unix timestamps.
 * The SQL fragment is shared by FTS5 and LIKE ranking to keep their ordering
 * semantics identical when FTS5 is unavailable.
 */
function memoryDecayFactorSql(createdAtColumn: string): string {
  return `EXP(-0.001 * (unixepoch() - ${createdAtColumn}) / 86400.0)`;
}

function memoryDecayFactor(createdAt: number): number {
  return Math.exp((-0.001 * (Math.floor(Date.now() / 1000) - createdAt)) / 86400);
}

/**
 * Build WHERE clause fragments and params for type / concept / importance filters.
 * The returned whereClause always starts with " AND" so it can be appended
 * after an existing WHERE condition.
 */
function buildFilters(options: MemorySearchOptions): {
  whereClause: string;
  params: NamedBindings;
} {
  const clauses: string[] = [];
  const params: NamedBindings = {};

  if (options.types?.length) {
    const placeholders = options.types.map((_, i) => `$filterType${i}`);
    clauses.push(`m.type IN (${placeholders.join(", ")})`);
    for (const [i, t] of options.types.entries()) {
      params[`$filterType${i}`] = t;
    }
  }

  if (options.concepts?.length) {
    const conceptClauses = options.concepts.map((_, i) => `m.concepts LIKE $concept${i}`);
    clauses.push(`(${conceptClauses.join(" OR ")})`);
    for (const [i, c] of options.concepts.entries()) {
      params[`$concept${i}`] = `%${c}%`;
    }
  }

  if (options.minImportance != null) {
    clauses.push("m.importance >= $minImportance");
    params.$minImportance = options.minImportance;
  }

  const whereClause = clauses.length > 0 ? ` AND ${clauses.join(" AND ")}` : "";
  return { whereClause, params };
}

/**
 * Produce a synthetic MemoryEntry when the database write fails.
 * Ensures callers of save() never receive an exception.
 */
function fallbackEntry(input: MemorySaveInput): MemoryEntry {
  return {
    id: -1,
    type: input.type,
    title: input.title,
    content: input.content,
    facts: input.facts,
    concepts: input.concepts,
    importance: input.importance ?? 5,
    sourceFiles: input.sourceFiles,
    createdAt: Math.floor(Date.now() / 1000),
  };
}

// ---------------------------------------------------------------------------
// Factory (convenience)
// ---------------------------------------------------------------------------

export function createMemoryManager(opts: MemoryManagerOptions): SqliteMemoryManager {
  return new SqliteMemoryManager(opts);
}
