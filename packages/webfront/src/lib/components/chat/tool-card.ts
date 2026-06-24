/**
 * Tool-card presentation logic (T4.1).
 *
 * Pure, DOM-free helpers that drive the `<ToolCard>` / `<ToolOutput>`
 * components: pairing invoke+result parts, deriving run status, mapping tool
 * names to icons, formatting inputs, and classifying output for rendering.
 * Keeping this logic here (the same split as `messages.ts` vs `MessageList`)
 * makes the behavior unit-testable without a Svelte renderer.
 */
import type { ToolInvokePart, ToolResultPart } from '$lib/api/messages.js';

/* ---------------------------------------------------------------------------
 * Status
 * ------------------------------------------------------------------------- */

export type ToolStatus = 'running' | 'success' | 'error';

/**
 * Derive the run status of a tool from its invoke part and (optional) result.
 * No result yet → still running. A result with an `error` → error. Otherwise
 * the call completed successfully.
 */
export function toolStatus(
  _invoke: ToolInvokePart | undefined,
  result: ToolResultPart | undefined
): ToolStatus {
  if (!result) return 'running';
  if (result.error != null && String(result.error).length > 0) return 'error';
  return 'success';
}

/** The tool's display name, preferring the invoke part's name. */
export function toolName(
  invoke: ToolInvokePart | undefined,
  result: ToolResultPart | undefined
): string {
  return invoke?.tool ?? result?.tool ?? 'tool';
}

/** Whether the card should be expanded by default for a given status. */
export function defaultExpanded(status: ToolStatus): boolean {
  // Expanded while running and on error (so failures are visible); collapse
  // on success to keep completed transcripts dense.
  return status !== 'success';
}

/* ---------------------------------------------------------------------------
 * Icon mapping
 * ------------------------------------------------------------------------- */

/**
 * Canonical icon keys. The Svelte component maps these to concrete HugeIcons
 * imports; keeping the mapping name-based keeps this module icon-library
 * agnostic and trivially testable.
 */
export type ToolIconKey =
  | 'read'
  | 'write'
  | 'edit'
  | 'bash'
  | 'grep'
  | 'glob'
  | 'webfetch'
  | 'list'
  | 'database'
  | 'tool';

const ICON_BY_TOOL: Record<string, ToolIconKey> = {
  read: 'read',
  readfile: 'read',
  cat: 'read',
  write: 'write',
  writefile: 'write',
  create: 'write',
  edit: 'edit',
  multiedit: 'edit',
  patch: 'edit',
  apply_patch: 'edit',
  bash: 'bash',
  shell: 'bash',
  exec: 'bash',
  terminal: 'bash',
  run: 'bash',
  grep: 'grep',
  search: 'grep',
  ripgrep: 'grep',
  glob: 'glob',
  find: 'glob',
  ls: 'list',
  list: 'list',
  webfetch: 'webfetch',
  fetch: 'webfetch',
  websearch: 'webfetch',
  browse: 'webfetch',
  sql: 'database',
  query: 'database',
  db: 'database',
};

/** Map a (possibly namespaced) tool name to a canonical icon key. */
export function iconKeyForTool(name: string | undefined): ToolIconKey {
  if (!name) return 'tool';
  // Strip provider/namespace prefixes like "mcp_" or "fs.read".
  const base = name
    .toLowerCase()
    .replace(/^mcp[_-]/, '')
    .split(/[._/-]/)
    .pop();
  return (base && ICON_BY_TOOL[base]) || 'tool';
}

/* ---------------------------------------------------------------------------
 * Input formatting
 * ------------------------------------------------------------------------- */

export interface FormattedInput {
  /** True when the input is best shown as a JSON code block. */
  isJson: boolean;
  /** Pretty-printed text for display. Empty string when there is no input. */
  text: string;
}

/**
 * Format a tool's input for display. Objects/arrays become pretty JSON;
 * primitives are stringified plainly. `undefined`/`null` → empty.
 */
export function formatInput(input: unknown): FormattedInput {
  if (input == null) return { isJson: false, text: '' };
  if (typeof input === 'string') return { isJson: false, text: input };
  if (typeof input === 'number' || typeof input === 'boolean') {
    return { isJson: false, text: String(input) };
  }
  try {
    return { isJson: true, text: JSON.stringify(input, null, 2) };
  } catch {
    return { isJson: false, text: String(input) };
  }
}

/* ---------------------------------------------------------------------------
 * Output classification
 * ------------------------------------------------------------------------- */

export type OutputKind = 'empty' | 'text' | 'json' | 'diff';

export interface NormalizedOutput {
  kind: OutputKind;
  /** The textual content to render. */
  text: string;
  /**
   * Language hint when `kind === 'json'` (always `'json'`) or for diffs
   * (`'diff'`). Empty for plain text — let the renderer decide.
   */
  lang: string;
}

/** Heuristic: does this text look like a unified diff? */
export function looksLikeDiff(text: string): boolean {
  if (!text) return false;
  const head = text.slice(0, 600);
  if (/^(diff --git |index [0-9a-f]+\.\.[0-9a-f]+|@@ -\d)/m.test(head)) return true;
  // A run of +/- prefixed lines (excluding the ---/+++ headers alone).
  const lines = text.split('\n');
  let changes = 0;
  for (const line of lines) {
    if (/^[+-](?![+-])/.test(line)) changes++;
    if (changes >= 3) return true;
  }
  return false;
}

/**
 * Normalize a tool-result `output` into something renderable. Objects become
 * pretty JSON; strings are sniffed for diffs (T4.2 extension point) and
 * otherwise treated as plain text.
 */
export function normalizeOutput(output: unknown, error?: string): NormalizedOutput {
  if (error != null && String(error).length > 0) {
    return { kind: 'text', text: String(error), lang: '' };
  }
  if (output == null) return { kind: 'empty', text: '', lang: '' };

  if (typeof output === 'string') {
    if (looksLikeDiff(output)) return { kind: 'diff', text: output, lang: 'diff' };
    return { kind: 'text', text: output, lang: '' };
  }

  // Some adapters wrap output as { text } or { content }.
  if (typeof output === 'object') {
    const obj = output as Record<string, unknown>;
    const inner = obj.text ?? obj.content ?? obj.stdout ?? obj.result;
    if (typeof inner === 'string') {
      if (looksLikeDiff(inner)) return { kind: 'diff', text: inner, lang: 'diff' };
      return { kind: 'text', text: inner, lang: '' };
    }
    try {
      return { kind: 'json', text: JSON.stringify(output, null, 2), lang: 'json' };
    } catch {
      return { kind: 'text', text: String(output), lang: '' };
    }
  }

  return { kind: 'text', text: String(output), lang: '' };
}

/* ---------------------------------------------------------------------------
 * Truncation
 * ------------------------------------------------------------------------- */

/** Default line budget before a "show more" toggle appears. */
export const OUTPUT_LINE_LIMIT = 20;

export interface TruncationResult {
  truncated: boolean;
  /** Visible text (limited to `limit` lines when truncated). */
  preview: string;
  /** Total line count of the source. */
  totalLines: number;
}

/** Split `text` to at most `limit` lines, reporting whether it was clipped. */
export function truncateLines(text: string, limit = OUTPUT_LINE_LIMIT): TruncationResult {
  const lines = text.split('\n');
  if (lines.length <= limit) {
    return { truncated: false, preview: text, totalLines: lines.length };
  }
  return {
    truncated: true,
    preview: lines.slice(0, limit).join('\n'),
    totalLines: lines.length,
  };
}
