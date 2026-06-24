import { describe, expect, it } from 'bun:test';
import { parseUnifiedDiff } from './parse.js';

describe('parseUnifiedDiff — malformed input', () => {
  it('returns empty for empty / whitespace / non-string input', () => {
    for (const input of ['', '   \n  ', '\n']) {
      const out = parseUnifiedDiff(input);
      expect(out.hunks).toHaveLength(0);
      expect(out.additions).toBe(0);
      expect(out.deletions).toBe(0);
    }
    // Defensive against non-string callers.
    expect(parseUnifiedDiff(undefined as unknown as string).hunks).toHaveLength(0);
  });

  it('treats prose with no hunk header as a loose context-only diff', () => {
    const out = parseUnifiedDiff('hello world\nsecond line');
    // No +/- lines → zero changes; lines captured as context.
    expect(out.additions).toBe(0);
    expect(out.deletions).toBe(0);
    expect(out.hunks).toHaveLength(1);
    expect(out.hunks[0].lines.every((l) => l.type === 'context')).toBe(true);
  });
});

describe('parseUnifiedDiff — file path extraction', () => {
  it('extracts paths from --- / +++ headers (stripping a/ b/ prefixes)', () => {
    const diff = [
      '--- a/src/foo.ts',
      '+++ b/src/foo.ts',
      '@@ -1,2 +1,2 @@',
      '-old',
      '+new',
      ' ctx',
    ].join('\n');
    const out = parseUnifiedDiff(diff);
    expect(out.oldPath).toBe('src/foo.ts');
    expect(out.newPath).toBe('src/foo.ts');
  });

  it('extracts paths from a diff --git header', () => {
    const diff = [
      'diff --git a/lib/x.ts b/lib/y.ts',
      'index e69de29..4b825dc 100644',
      '@@ -1 +1 @@',
      '-a',
      '+b',
    ].join('\n');
    const out = parseUnifiedDiff(diff);
    expect(out.oldPath).toBe('lib/x.ts');
    expect(out.newPath).toBe('lib/y.ts');
  });

  it('preserves /dev/null for new-file diffs', () => {
    const diff = ['--- /dev/null', '+++ b/new.ts', '@@ -0,0 +1,1 @@', '+created'].join('\n');
    const out = parseUnifiedDiff(diff);
    expect(out.oldPath).toBe('/dev/null');
    expect(out.newPath).toBe('new.ts');
  });
});

describe('parseUnifiedDiff — single hunk line numbering', () => {
  const diff = ['@@ -10,3 +10,4 @@', ' context-a', '-removed', '+added-1', '+added-2', ' context-b'].join(
    '\n'
  );
  const out = parseUnifiedDiff(diff);
  const hunk = out.hunks[0];

  it('records hunk start positions', () => {
    expect(hunk.oldStart).toBe(10);
    expect(hunk.newStart).toBe(10);
    expect(hunk.header).toBe('@@ -10,3 +10,4 @@');
  });

  it('counts additions and deletions', () => {
    expect(out.additions).toBe(2);
    expect(out.deletions).toBe(1);
  });

  it('assigns old/new line numbers per type', () => {
    const [ctxA, removed, add1, add2, ctxB] = hunk.lines;

    expect(ctxA.type).toBe('context');
    expect(ctxA.oldLineNo).toBe(10);
    expect(ctxA.newLineNo).toBe(10);

    expect(removed.type).toBe('remove');
    expect(removed.oldLineNo).toBe(11);
    expect(removed.newLineNo).toBeUndefined();

    expect(add1.type).toBe('add');
    expect(add1.newLineNo).toBe(11);
    expect(add1.oldLineNo).toBeUndefined();

    expect(add2.type).toBe('add');
    expect(add2.newLineNo).toBe(12);

    expect(ctxB.type).toBe('context');
    expect(ctxB.oldLineNo).toBe(12);
    expect(ctxB.newLineNo).toBe(13);
  });
});

describe('parseUnifiedDiff — multi-hunk', () => {
  const diff = [
    '--- a/app.ts',
    '+++ b/app.ts',
    '@@ -1,2 +1,2 @@',
    ' first',
    '-second',
    '+SECOND',
    '@@ -20,2 +20,3 @@',
    ' twenty',
    '+twenty-one',
    ' twenty-two',
  ].join('\n');
  const out = parseUnifiedDiff(diff);

  it('produces one hunk per @@ header', () => {
    expect(out.hunks).toHaveLength(2);
    expect(out.hunks[0].oldStart).toBe(1);
    expect(out.hunks[1].oldStart).toBe(20);
    expect(out.hunks[1].newStart).toBe(20);
  });

  it('aggregates additions and deletions across hunks', () => {
    expect(out.additions).toBe(2);
    expect(out.deletions).toBe(1);
  });

  it('numbers the second hunk from its own start', () => {
    const second = out.hunks[1];
    expect(second.lines[0]).toMatchObject({ type: 'context', oldLineNo: 20, newLineNo: 20 });
    expect(second.lines[1]).toMatchObject({ type: 'add', newLineNo: 21 });
    expect(second.lines[2]).toMatchObject({ type: 'context', oldLineNo: 21, newLineNo: 22 });
  });
});

describe('parseUnifiedDiff — loose (header-less) diff', () => {
  it('wraps a bare +/- run into one synthetic hunk', () => {
    const out = parseUnifiedDiff('-a\n+b\n-c\n+d');
    expect(out.hunks).toHaveLength(1);
    expect(out.hunks[0].header).toBe('');
    expect(out.additions).toBe(2);
    expect(out.deletions).toBe(2);
    expect(out.hunks[0].oldStart).toBe(1);
    expect(out.hunks[0].newStart).toBe(1);
  });
});

describe('parseUnifiedDiff — robustness', () => {
  it('handles CRLF line endings', () => {
    const out = parseUnifiedDiff('@@ -1 +1 @@\r\n-old\r\n+new\r\n');
    expect(out.additions).toBe(1);
    expect(out.deletions).toBe(1);
    expect(out.hunks[0].lines[1].content).toBe('new');
  });

  it('captures a "no newline at end of file" marker as a header line', () => {
    const out = parseUnifiedDiff('@@ -1 +1 @@\n-a\n+b\n\\ No newline at end of file');
    const marker = out.hunks[0].lines.find((l) => l.type === 'header');
    expect(marker?.content).toContain('No newline');
  });

  it('does not throw on truncated hunk headers', () => {
    expect(() => parseUnifiedDiff('@@ this is broken @@\n+x')).not.toThrow();
  });
});
