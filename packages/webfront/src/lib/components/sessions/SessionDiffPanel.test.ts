import { describe, expect, it, mock } from 'bun:test';
import type { FileDiff, OpenCodeClient } from '$lib/api/types.js';
import { parseUnifiedDiff } from '$lib/diff/parse.js';
import { createClient } from '$lib/api/client.js';
import {
  EXPAND_THRESHOLD,
  fileKey,
  fileName,
  startsExpanded,
  statLabel,
  toggleLabel,
  toUnifiedDiff,
} from './session-diff-panel.js';

function fileDiff(overrides: Partial<FileDiff> = {}): FileDiff {
  return {
    file: 'src/app.ts',
    before: 'line one\nline two\n',
    after: 'line one\nline two changed\nline three\n',
    additions: 2,
    deletions: 1,
    ...overrides,
  };
}

describe('fileName', () => {
  it('returns the basename of a path', () => {
    expect(fileName('src/lib/app.ts')).toBe('app.ts');
    expect(fileName('README.md')).toBe('README.md');
  });

  it('falls back for an empty path', () => {
    expect(fileName('')).toBe('file');
  });
});

describe('fileKey', () => {
  it('uses the file path when present, index otherwise', () => {
    expect(fileKey(fileDiff({ file: 'a/b.ts' }), 0)).toBe('a/b.ts');
    expect(fileKey(fileDiff({ file: '' }), 2)).toBe('diff-2');
  });
});

describe('startsExpanded', () => {
  it('expands small file sets and collapses larger ones', () => {
    expect(startsExpanded(1)).toBe(true);
    expect(startsExpanded(EXPAND_THRESHOLD)).toBe(true);
    expect(startsExpanded(EXPAND_THRESHOLD + 1)).toBe(false);
  });
});

describe('statLabel', () => {
  it('formats additions and deletions', () => {
    expect(statLabel(fileDiff({ additions: 4, deletions: 2 }))).toBe('+4 \u22122');
    expect(statLabel({ file: 'x', before: '', after: '', additions: 0, deletions: 0 })).toBe(
      '+0 \u22120'
    );
  });
});

describe('toggleLabel', () => {
  it('describes the collapse/expand action', () => {
    expect(toggleLabel('src/a.ts', false)).toBe('Expand diff for src/a.ts');
    expect(toggleLabel('src/a.ts', true)).toBe('Collapse diff for src/a.ts');
  });
});

describe('toUnifiedDiff', () => {
  it('produces unified-diff text that DiffView can parse', () => {
    const text = toUnifiedDiff(fileDiff());
    const parsed = parseUnifiedDiff(text);
    expect(parsed.hunks.length).toBeGreaterThan(0);
    expect(parsed.newPath).toBe('src/app.ts');
    expect(parsed.additions).toBe(2);
    expect(parsed.deletions).toBe(1);
  });

  it('handles a pure addition (empty before)', () => {
    const text = toUnifiedDiff(fileDiff({ before: '', after: 'new line\n', additions: 1, deletions: 0 }));
    const parsed = parseUnifiedDiff(text);
    expect(parsed.additions).toBe(1);
    expect(parsed.deletions).toBe(0);
  });

  it('handles a full deletion (empty after)', () => {
    const text = toUnifiedDiff(fileDiff({ before: 'gone\n', after: '', additions: 0, deletions: 1 }));
    const parsed = parseUnifiedDiff(text);
    expect(parsed.deletions).toBe(1);
  });
});

describe('getSessionDiff adapter (panel data source)', () => {
  const originalFetch = globalThis.fetch;

  function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      ...init,
    });
  }

  it('fetches the per-session diff from GET /session/{id}/diff', async () => {
    const diffs = [fileDiff()];
    const fetchMock = mock(() => Promise.resolve(jsonResponse(diffs)));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    try {
      const result = await createClient('http://localhost:4096').getSessionDiff('s1');
      expect(result).toEqual(diffs);
      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:4096/session/s1/diff',
        expect.objectContaining({ headers: expect.objectContaining({ Accept: 'application/json' }) })
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('returns an empty list on a failed request (graceful degradation)', async () => {
    const fetchMock = mock(() => Promise.resolve(new Response('nope', { status: 500 })));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    try {
      const result = await createClient('http://localhost:4096').getSessionDiff('s1');
      expect(result).toEqual([]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('treats a non-array payload as empty', async () => {
    const fetchMock = mock(() => Promise.resolve(jsonResponse({ unexpected: true })));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    try {
      const result = await createClient('http://localhost:4096').getSessionDiff('s1');
      expect(result).toEqual([]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe('empty / state inputs (panel contract)', () => {
  it('an empty diff list yields no expandable files', () => {
    expect(startsExpanded(0)).toBe(true);
    const empty: FileDiff[] = [];
    expect(empty.map((d, i) => fileKey(d, i))).toEqual([]);
  });

  it('mock client diff method is callable and resolves', async () => {
    const client = { getSessionDiff: mock(() => Promise.resolve([fileDiff()])) } as unknown as OpenCodeClient;
    await expect(client.getSessionDiff('s1')).resolves.toHaveLength(1);
  });
});
