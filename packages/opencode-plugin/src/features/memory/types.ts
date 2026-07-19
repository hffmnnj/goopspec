/**
 * Memory-local type definitions for the SQLite storage layer.
 *
 * Core domain types (MemoryEntry, MemorySearchOptions, etc.) live in
 * core/types.ts. This file defines the raw database row shapes and
 * internal helpers that never leak outside the memory feature.
 */

// ---------------------------------------------------------------------------
// Database row shapes
// ---------------------------------------------------------------------------

/**
 * Raw row returned from the `memories` table.
 *
 * Column names use snake_case to match SQLite conventions; the manager
 * converts these to camelCase MemoryEntry objects at the boundary.
 */
export interface MemoryRow {
  id: number;
  type: string;
  title: string;
  content: string;
  facts: string; // JSON-encoded string[]
  concepts: string; // JSON-encoded string[]
  source_files: string; // JSON-encoded string[]
  importance: number;
  created_at: number; // Unix timestamp (seconds)
}

/**
 * Extended row shape returned by FTS5 search queries.
 *
 * `rank` is the BM25 relevance score produced by `bm25()`.
 * Lower (more negative) values indicate better matches.
 */
export interface FtsSearchRow extends MemoryRow {
  rank: number;
  score: number;
}

/**
 * Row shape returned by the LIKE-based fallback search.
 *
 * Identical to MemoryRow — no rank column is available, so the manager
 * synthesises a score from importance alone.
 */
export type LikeSearchRow = MemoryRow;

// ---------------------------------------------------------------------------
// Internal configuration
// ---------------------------------------------------------------------------

/** Options accepted by the MemoryManager constructor. */
export interface MemoryManagerOptions {
  /** Absolute path to the SQLite database file. */
  dbPath: string;
}
