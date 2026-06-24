import { describe, expect, it } from 'bun:test';
import type { ToolInvokePart, ToolResultPart } from '$lib/api/messages.js';
import { groupParts } from '$lib/api/messages.js';
import {
  toolStatus,
  toolName,
  defaultExpanded,
  iconKeyForTool,
  formatInput,
  normalizeOutput,
  looksLikeDiff,
  truncateLines,
  OUTPUT_LINE_LIMIT,
} from './tool-card.js';

function invoke(overrides: Partial<ToolInvokePart> = {}): ToolInvokePart {
  return { type: 'tool-invoke', id: 't1', tool: 'read', input: {}, ...overrides };
}

function result(overrides: Partial<ToolResultPart> = {}): ToolResultPart {
  return { type: 'tool-result', id: 't1', tool: 'read', output: 'ok', ...overrides };
}

describe('toolStatus', () => {
  it('is running when there is no result', () => {
    expect(toolStatus(invoke(), undefined)).toBe('running');
  });

  it('is success when the result has no error', () => {
    expect(toolStatus(invoke(), result())).toBe('success');
  });

  it('is error when the result carries an error', () => {
    expect(toolStatus(invoke(), result({ error: 'boom', output: undefined }))).toBe('error');
  });

  it('treats an empty-string error as success', () => {
    expect(toolStatus(invoke(), result({ error: '' }))).toBe('success');
  });
});

describe('defaultExpanded', () => {
  it('expands while running and on error, collapses on success', () => {
    expect(defaultExpanded('running')).toBe(true);
    expect(defaultExpanded('error')).toBe(true);
    expect(defaultExpanded('success')).toBe(false);
  });
});

describe('toolName', () => {
  it('prefers the invoke name, falls back to result, then default', () => {
    expect(toolName(invoke({ tool: 'bash' }), undefined)).toBe('bash');
    expect(toolName(undefined, result({ tool: 'grep' }))).toBe('grep');
    expect(toolName(undefined, undefined)).toBe('tool');
  });
});

describe('iconKeyForTool', () => {
  it('maps known tool names to canonical icon keys', () => {
    expect(iconKeyForTool('read')).toBe('read');
    expect(iconKeyForTool('write')).toBe('write');
    expect(iconKeyForTool('edit')).toBe('edit');
    expect(iconKeyForTool('multiedit')).toBe('edit');
    expect(iconKeyForTool('bash')).toBe('bash');
    expect(iconKeyForTool('grep')).toBe('grep');
    expect(iconKeyForTool('glob')).toBe('glob');
    expect(iconKeyForTool('webfetch')).toBe('webfetch');
    expect(iconKeyForTool('ls')).toBe('list');
  });

  it('strips namespaces and is case-insensitive', () => {
    expect(iconKeyForTool('mcp_bash')).toBe('bash');
    expect(iconKeyForTool('fs.read')).toBe('read');
    expect(iconKeyForTool('GREP')).toBe('grep');
  });

  it('falls back to the generic tool icon for unknown names', () => {
    expect(iconKeyForTool('frobnicate')).toBe('tool');
    expect(iconKeyForTool(undefined)).toBe('tool');
  });
});

describe('formatInput', () => {
  it('returns empty for null/undefined', () => {
    expect(formatInput(undefined)).toEqual({ isJson: false, text: '' });
    expect(formatInput(null)).toEqual({ isJson: false, text: '' });
  });

  it('passes strings and primitives through as plain text', () => {
    expect(formatInput('hello')).toEqual({ isJson: false, text: 'hello' });
    expect(formatInput(42)).toEqual({ isJson: false, text: '42' });
  });

  it('pretty-prints objects as JSON', () => {
    const out = formatInput({ path: 'a.ts' });
    expect(out.isJson).toBe(true);
    expect(out.text).toBe('{\n  "path": "a.ts"\n}');
  });
});

describe('normalizeOutput', () => {
  it('returns empty for nullish output', () => {
    expect(normalizeOutput(undefined).kind).toBe('empty');
  });

  it('prioritizes error text', () => {
    const out = normalizeOutput('ignored', 'failure');
    expect(out.kind).toBe('text');
    expect(out.text).toBe('failure');
  });

  it('classifies plain strings as text', () => {
    expect(normalizeOutput('just text').kind).toBe('text');
  });

  it('classifies diff strings as diff', () => {
    const diff = 'diff --git a/x b/x\n@@ -1 +1 @@\n-old\n+new';
    const out = normalizeOutput(diff);
    expect(out.kind).toBe('diff');
    expect(out.lang).toBe('diff');
  });

  it('unwraps object outputs with inner text', () => {
    expect(normalizeOutput({ text: 'inner' }).text).toBe('inner');
    expect(normalizeOutput({ stdout: 'shell out' }).text).toBe('shell out');
  });

  it('renders structured objects as json', () => {
    const out = normalizeOutput({ a: 1, b: [2] });
    expect(out.kind).toBe('json');
    expect(out.lang).toBe('json');
  });
});

describe('looksLikeDiff', () => {
  it('detects git and unified diff headers', () => {
    expect(looksLikeDiff('diff --git a/f b/f')).toBe(true);
    expect(looksLikeDiff('@@ -1,2 +1,2 @@')).toBe(true);
  });

  it('detects a run of +/- change lines', () => {
    expect(looksLikeDiff('-a\n+b\n-c\n+d')).toBe(true);
  });

  it('is false for ordinary prose', () => {
    expect(looksLikeDiff('hello world\nsecond line')).toBe(false);
    expect(looksLikeDiff('')).toBe(false);
  });
});

describe('truncateLines', () => {
  it('does not truncate short output', () => {
    const r = truncateLines('a\nb\nc');
    expect(r.truncated).toBe(false);
    expect(r.preview).toBe('a\nb\nc');
    expect(r.totalLines).toBe(3);
  });

  it('clips long output to the limit', () => {
    const text = Array.from({ length: OUTPUT_LINE_LIMIT + 5 }, (_, i) => `L${i}`).join('\n');
    const r = truncateLines(text);
    expect(r.truncated).toBe(true);
    expect(r.preview.split('\n')).toHaveLength(OUTPUT_LINE_LIMIT);
    expect(r.totalLines).toBe(OUTPUT_LINE_LIMIT + 5);
  });
});

describe('groupParts tool pairing', () => {
  it('pairs an invoke with its matching result into one tool group', () => {
    const groups = groupParts([
      invoke({ id: 'x', tool: 'bash' }),
      result({ id: 'x', tool: 'bash', output: 'done' }),
    ]);
    expect(groups).toHaveLength(1);
    const group = groups[0];
    expect(group.kind).toBe('tool');
    if (group.kind === 'tool') {
      expect(group.invoke?.tool).toBe('bash');
      expect(group.result?.output).toBe('done');
    }
  });

  it('keeps an unpaired invoke as a running tool group', () => {
    const groups = groupParts([invoke({ id: 'y' })]);
    expect(groups).toHaveLength(1);
    if (groups[0].kind === 'tool') {
      expect(groups[0].invoke).toBeDefined();
      expect(groups[0].result).toBeUndefined();
    }
  });

  it('renders an orphan result (no invoke) as its own group', () => {
    const groups = groupParts([result({ id: 'z' })]);
    expect(groups).toHaveLength(1);
    if (groups[0].kind === 'tool') {
      expect(groups[0].invoke).toBeUndefined();
      expect(groups[0].result).toBeDefined();
    }
  });

  it('preserves interleaved text/tool order', () => {
    const groups = groupParts([
      { type: 'text', text: 'before' },
      invoke({ id: 'a' }),
      result({ id: 'a' }),
      { type: 'text', text: 'after' },
    ]);
    expect(groups.map((g) => g.kind)).toEqual(['text', 'tool', 'text']);
  });
});
