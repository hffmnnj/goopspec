// Pure, DOM-free helpers for <SessionDiffPanel>. Split out (like project-rail.ts
// and vcs-badge.ts) so the diff-text synthesis, labels, and collapse logic are
// unit-testable without a renderer.
import type { FileDiff } from '$lib/api/types.js';

/** Files at/under this count start expanded; larger sets collapse by default. */
export const EXPAND_THRESHOLD = 3;

/** Stable per-file key for keyed `{#each}` blocks. */
export function fileKey(diff: FileDiff, index: number): string {
  return diff.file ? `${diff.file}` : `diff-${index}`;
}

/** Display name (basename) for a file path. */
export function fileName(path: string): string {
  if (!path) return 'file';
  const parts = path.split('/').filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : path;
}

/** Whether a file row should start expanded given the total file count. */
export function startsExpanded(fileCount: number): boolean {
  return fileCount <= EXPAND_THRESHOLD;
}

/** Per-file stat label, e.g. "+4 −2". */
export function statLabel(diff: FileDiff): string {
  return `+${diff.additions ?? 0} \u2212${diff.deletions ?? 0}`;
}

/** Accessible label for a collapse/expand control. */
export function toggleLabel(path: string, expanded: boolean): string {
  return `${expanded ? 'Collapse' : 'Expand'} diff for ${path}`;
}

/**
 * Synthesize a unified-diff string from a {@link FileDiff}'s before/after
 * contents so it renders through the existing `<DiffView>` (which parses
 * unified-diff text). OpenCode returns full before/after blobs rather than a
 * patch, so we compute a minimal line-based diff here.
 */
export function toUnifiedDiff(diff: FileDiff): string {
  const beforeLines = splitLines(diff.before ?? '');
  const afterLines = splitLines(diff.after ?? '');
  const body = diffLines(beforeLines, afterLines);

  const header =
    `--- a/${diff.file}\n` +
    `+++ b/${diff.file}\n` +
    `@@ -1,${beforeLines.length} +1,${afterLines.length} @@`;

  return body.length > 0 ? `${header}\n${body.join('\n')}` : header;
}

function splitLines(text: string): string[] {
  if (text.length === 0) return [];
  return text.replace(/\r\n/g, '\n').replace(/\n$/, '').split('\n');
}

/**
 * Minimal LCS-based line diff producing unified-diff body rows (` `, `-`, `+`).
 * Kept simple and dependency-free; adequate for session-change previews.
 */
function diffLines(before: string[], after: string[]): string[] {
  const n = before.length;
  const m = after.length;
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));

  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] = before[i] === after[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  const out: string[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (before[i] === after[j]) {
      out.push(` ${before[i]}`);
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      out.push(`-${before[i]}`);
      i++;
    } else {
      out.push(`+${after[j]}`);
      j++;
    }
  }
  while (i < n) out.push(`-${before[i++]}`);
  while (j < m) out.push(`+${after[j++]}`);
  return out;
}
