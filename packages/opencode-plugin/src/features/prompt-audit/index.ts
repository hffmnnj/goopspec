/**
 * Prompt-surface audit module — reproducible measurement of GoopSpec's
 * prompt-bearing surfaces (agents/, commands/, references/).
 *
 * Provides per-file char/token measurement, directory rollups, a
 * case-insensitive whole-word census of must|never|always|critical|only,
 * and bold-span counts so every later wave can report comparable deltas.
 *
 * NOT imported from src/index.ts — excluded from the production bundle by
 * construction. Consumed only by its co-located tests and by report.ts.
 *
 * Token estimation reuses `estimateTokens` from src/hooks/system-transform.ts
 * so plan-time measurements and runtime budgets agree by construction.
 *
 * @module prompt-audit
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { estimateTokens } from "../../hooks/system-transform.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Per-file measurement: chars, bytes, tokens, language census, bold spans. */
export interface FileMeasurement {
  /** Path relative to the package root (e.g. "agents/goop-orchestrator.md"). */
  path: string;
  /** UTF-16 code-unit count (`content.length`). Consistent with `estimateTokens`. */
  chars: number;
  /** UTF-8 byte count (`buffer.length`). Matches the locked SPEC baseline. */
  bytes: number;
  /** Token estimate via `estimateTokens` (ceil(chars / 4)). */
  tokens: number;
  /** Case-insensitive whole-word hits for must|never|always|critical|only. */
  absoluteHits: number;
  /** Count of `**` occurrences (non-overlapping). */
  boldSpans: number;
}

/** Directory-level rollup. */
export interface DirectoryRollup {
  directory: string;
  files: number;
  chars: number;
  bytes: number;
  tokens: number;
  absoluteHits: number;
  boldSpans: number;
  perFile: FileMeasurement[];
}

/** Full audit report across all prompt surfaces. */
export interface AuditReport {
  directories: DirectoryRollup[];
  totalAbsoluteHits: number;
  totalBoldSpans: number;
  measuredAt: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Absolute-language terms censused across prompt surfaces.
 * Case-insensitive, whole-word matches only (`\b` on both sides).
 */
const ABSOLUTE_LANGUAGE_RE = /\b(?:must|never|always|critical|only)\b/gi;

/** Directories treated as prompt-bearing surfaces, in priority order. */
export const PROMPT_DIRECTORIES = ["agents", "commands", "references"] as const;

// ---------------------------------------------------------------------------
// Pure measurement functions
// ---------------------------------------------------------------------------

/**
 * Count case-insensitive whole-word occurrences of must|never|always|critical|only.
 *
 * `\b` word boundaries exclude substrings like "mustard" or "mustn't".
 */
export function countAbsoluteLanguage(text: string): number {
  return (text.match(ABSOLUTE_LANGUAGE_RE) ?? []).length;
}

/**
 * Count bold-emphasis markers (`**` occurrences) in markdown text.
 *
 * Each literal `**` sequence is counted once (non-overlapping). A bold span
 * `**text**` contributes 2. This matches the baseline method documented in
 * the locked SPEC (275 `**` occurrences across agents/).
 */
export function countBoldSpans(text: string): number {
  return (text.match(/\*\*/g) ?? []).length;
}

/**
 * Measure a single file's content.
 *
 * `chars` is `content.length` (UTF-16 code units, consistent with
 * `estimateTokens`); `bytes` is the UTF-8 byte count (matches the locked
 * SPEC baseline which was measured with `wc -c`).
 */
export function measureFile(content: string, bytes: number, relPath: string): FileMeasurement {
  return {
    path: relPath,
    chars: content.length,
    bytes,
    tokens: estimateTokens(content),
    absoluteHits: countAbsoluteLanguage(content),
    boldSpans: countBoldSpans(content),
  };
}

/**
 * Roll up all `.md` files in a directory under the package root.
 * Returns an empty rollup (files: 0) if the directory does not exist.
 */
export function measureDirectory(dir: string, packageRoot: string): DirectoryRollup {
  const absDir = join(packageRoot, dir);
  const perFile: FileMeasurement[] = [];

  let files = 0;
  let chars = 0;
  let bytes = 0;
  let tokens = 0;
  let absoluteHits = 0;
  let boldSpans = 0;

  try {
    const entries = readdirSync(absDir).sort();
    for (const entry of entries) {
      if (!entry.endsWith(".md")) continue;
      const absPath = join(absDir, entry);
      try {
        if (!statSync(absPath).isFile()) continue;
      } catch {
        continue;
      }
      const buf = readFileSync(absPath);
      const content = buf.toString("utf-8");
      const relPath = relative(packageRoot, absPath);
      const m = measureFile(content, buf.length, relPath);
      perFile.push(m);
      files++;
      chars += m.chars;
      bytes += m.bytes;
      tokens += m.tokens;
      absoluteHits += m.absoluteHits;
      boldSpans += m.boldSpans;
    }
  } catch {
    // Directory does not exist or is unreadable — return empty rollup.
  }

  return { directory: dir, files, chars, bytes, tokens, absoluteHits, boldSpans, perFile };
}

/**
 * Audit all prompt-bearing surfaces under the package root.
 */
export function auditPromptSurfaces(packageRoot: string): AuditReport {
  const directories = PROMPT_DIRECTORIES.map((d) => measureDirectory(d, packageRoot));
  const totalAbsoluteHits = directories.reduce((s, d) => s + d.absoluteHits, 0);
  const totalBoldSpans = directories.reduce((s, d) => s + d.boldSpans, 0);
  return {
    directories,
    totalAbsoluteHits,
    totalBoldSpans,
    measuredAt: new Date().toISOString(),
  };
}
