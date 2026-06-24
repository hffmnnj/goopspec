/**
 * Unified diff parser (T4.2 — MH-10 diff sub-feature).
 *
 * Pure, DOM-free parsing of unified-diff text into structured hunks that
 * `<DiffView>` renders with old/new line-number gutters and add/remove/context
 * tints. The parser is deliberately forgiving: malformed input degrades to a
 * best-effort `ParsedDiff` (often empty) rather than throwing, so a flaky tool
 * payload never breaks a transcript render.
 *
 * Supported shapes:
 *  - Full unified diff with `diff --git`, `---`/`+++` file headers, and one or
 *    more `@@ -a,b +c,d @@` hunks.
 *  - Bare hunk(s) without file headers (output starts at `@@`).
 *  - A header-less "loose" diff: a run of `+`/`-`/` `-prefixed lines with no
 *    `@@` marker (some edit tools emit only the changed region). These are
 *    wrapped into a single synthetic hunk with best-effort line numbering.
 */

export type DiffLineType = 'add' | 'remove' | 'context' | 'header';

export interface DiffLine {
  type: DiffLineType;
  /** Line content without the leading +/-/space marker. */
  content: string;
  /** 1-based line number in the old file (absent for added lines). */
  oldLineNo?: number;
  /** 1-based line number in the new file (absent for removed lines). */
  newLineNo?: number;
}

export interface DiffHunk {
  /** The raw `@@ ... @@` header (empty for a synthetic/loose hunk). */
  header: string;
  lines: DiffLine[];
  /** 1-based start line in the old file. */
  oldStart: number;
  /** 1-based start line in the new file. */
  newStart: number;
}

export interface ParsedDiff {
  hunks: DiffHunk[];
  /** Old-file path from a `---` header (or `diff --git`), if present. */
  oldPath?: string;
  /** New-file path from a `+++` header (or `diff --git`), if present. */
  newPath?: string;
  /** Total added lines across all hunks. */
  additions: number;
  /** Total removed lines across all hunks. */
  deletions: number;
}

const EMPTY: ParsedDiff = Object.freeze({
  hunks: [],
  additions: 0,
  deletions: 0,
});

/** `@@ -oldStart,oldCount +newStart,newCount @@ optional section heading` */
const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

/** Strip a leading `a/` or `b/` git prefix and trailing tab metadata. */
function cleanPath(raw: string): string {
  const path = raw.split('\t')[0].trim();
  if (path === '/dev/null') return path;
  return path.replace(/^[ab]\//, '');
}

/** Extract both paths from a `diff --git a/x b/y` line, when possible. */
function parseGitHeader(line: string): { oldPath?: string; newPath?: string } {
  const match = /^diff --git (\S+) (\S+)/.exec(line);
  if (!match) return {};
  return { oldPath: cleanPath(match[1]), newPath: cleanPath(match[2]) };
}

/**
 * Detect whether `raw` contains a real unified-diff hunk header. When it does
 * not but still looks change-like, the loose-diff path is used instead.
 */
function hasHunkHeader(lines: string[]): boolean {
  return lines.some((line) => HUNK_HEADER.test(line));
}

/**
 * Parse a structured unified diff with at least one `@@` hunk header.
 * `oldPath`/`newPath` are threaded in from any preceding file headers.
 */
function parseHunked(lines: string[], oldPath?: string, newPath?: string): ParsedDiff {
  const hunks: DiffHunk[] = [];
  let additions = 0;
  let deletions = 0;

  let current: DiffHunk | null = null;
  let oldNo = 0;
  let newNo = 0;

  for (const line of lines) {
    const hunkMatch = HUNK_HEADER.exec(line);
    if (hunkMatch) {
      const oldStart = Number(hunkMatch[1]);
      const newStart = Number(hunkMatch[3]);
      current = { header: line, lines: [], oldStart, newStart };
      hunks.push(current);
      oldNo = oldStart;
      newNo = newStart;
      continue;
    }

    if (!current) {
      // Pre-hunk lines (file headers, `index`, `diff --git`). Capture paths but
      // do not emit them as diff body lines.
      if (line.startsWith('--- ')) oldPath = cleanPath(line.slice(4));
      else if (line.startsWith('+++ ')) newPath = cleanPath(line.slice(4));
      else if (line.startsWith('diff --git ')) {
        const git = parseGitHeader(line);
        oldPath = git.oldPath ?? oldPath;
        newPath = git.newPath ?? newPath;
      }
      continue;
    }

    const marker = line[0];
    if (marker === '+') {
      current.lines.push({ type: 'add', content: line.slice(1), newLineNo: newNo });
      newNo += 1;
      additions += 1;
    } else if (marker === '-') {
      current.lines.push({ type: 'remove', content: line.slice(1), oldLineNo: oldNo });
      oldNo += 1;
      deletions += 1;
    } else if (marker === '\\') {
      // "\ No newline at end of file" — metadata, render as a header line.
      current.lines.push({ type: 'header', content: line });
    } else {
      // Context line (leading space) or a blank line inside a hunk.
      const content = marker === ' ' ? line.slice(1) : line;
      current.lines.push({ type: 'context', content, oldLineNo: oldNo, newLineNo: newNo });
      oldNo += 1;
      newNo += 1;
    }
  }

  return { hunks, oldPath, newPath, additions, deletions };
}

/**
 * Parse a header-less "loose" diff: a run of +/-/space lines with no `@@`
 * marker. Wrapped into one synthetic hunk starting at line 1 on both sides so
 * the gutters still render sensibly.
 */
function parseLoose(lines: string[]): ParsedDiff {
  const hunk: DiffHunk = { header: '', lines: [], oldStart: 1, newStart: 1 };
  let additions = 0;
  let deletions = 0;
  let oldNo = 1;
  let newNo = 1;

  for (const line of lines) {
    const marker = line[0];
    if (marker === '+') {
      hunk.lines.push({ type: 'add', content: line.slice(1), newLineNo: newNo });
      newNo += 1;
      additions += 1;
    } else if (marker === '-') {
      hunk.lines.push({ type: 'remove', content: line.slice(1), oldLineNo: oldNo });
      oldNo += 1;
      deletions += 1;
    } else {
      const content = marker === ' ' ? line.slice(1) : line;
      hunk.lines.push({ type: 'context', content, oldLineNo: oldNo, newLineNo: newNo });
      oldNo += 1;
      newNo += 1;
    }
  }

  return { hunks: hunk.lines.length ? [hunk] : [], additions, deletions };
}

/**
 * Parse a unified-diff string into a structured {@link ParsedDiff}. Never
 * throws — malformed or empty input yields an empty (but valid) result.
 */
export function parseUnifiedDiff(raw: string): ParsedDiff {
  if (typeof raw !== 'string' || raw.trim().length === 0) return { ...EMPTY };

  try {
    // Normalize CRLF and drop a single trailing newline so the final line is
    // not parsed as an empty context row.
    const normalized = raw.replace(/\r\n/g, '\n').replace(/\n$/, '');
    const lines = normalized.split('\n');

    if (hasHunkHeader(lines)) {
      return parseHunked(lines);
    }
    return parseLoose(lines);
  } catch {
    return { ...EMPTY };
  }
}
