import { describe, expect, it } from 'bun:test';
import {
  renderMarkdown,
  renderMarkdownToHtml,
  sanitizeHtml,
  type MarkdownBlock,
} from './render.js';

/** Concatenate all html-block output for substring assertions. */
function html(blocks: MarkdownBlock[]): string {
  return blocks
    .filter((b): b is Extract<MarkdownBlock, { kind: 'html' }> => b.kind === 'html')
    .map((b) => b.html)
    .join('\n');
}

describe('renderMarkdown — GFM', () => {
  it('renders a GFM table', () => {
    const md = ['| A | B |', '| - | - |', '| 1 | 2 |'].join('\n');
    const out = html(renderMarkdown(md));
    expect(out).toContain('<table>');
    expect(out).toContain('<th>A</th>');
    expect(out).toContain('<td>1</td>');
  });

  it('renders a GFM task list with disabled checkboxes', () => {
    const md = ['- [x] done', '- [ ] todo'].join('\n');
    const out = html(renderMarkdown(md));
    expect(out).toContain('type="checkbox"');
    expect(out).toContain('checked');
    expect(out).toContain('disabled');
  });

  it('renders strikethrough', () => {
    const out = html(renderMarkdown('~~gone~~'));
    expect(out).toContain('<del>gone</del>');
  });

  it('autolinks bare URLs', () => {
    const out = html(renderMarkdown('see https://example.com today'));
    expect(out).toContain('href="https://example.com"');
  });

  it('renders headings, lists and blockquotes', () => {
    const md = ['# Title', '', '> quote', '', '- one', '- two'].join('\n');
    const out = html(renderMarkdown(md));
    expect(out).toContain('<h1>Title</h1>');
    expect(out).toContain('<blockquote>');
    expect(out).toContain('<li>one</li>');
  });
});

describe('renderMarkdown — code fences', () => {
  it('emits a separate code block node with language', () => {
    const md = ['```ts', 'const x = 1;', '```'].join('\n');
    const blocks = renderMarkdown(md);
    const code = blocks.find((b) => b.kind === 'code');
    expect(code).toBeDefined();
    expect(code).toMatchObject({ kind: 'code', lang: 'ts', code: 'const x = 1;' });
  });

  it('preserves prose/code/prose order', () => {
    const md = ['before', '', '```js', 'x', '```', '', 'after'].join('\n');
    const kinds = renderMarkdown(md).map((b) => b.kind);
    expect(kinds).toEqual(['html', 'code', 'html']);
  });

  it('normalizes the language hint to lowercase first token', () => {
    const md = ['```TS extra', 'y', '```'].join('\n');
    const code = renderMarkdown(md).find((b) => b.kind === 'code');
    expect(code).toMatchObject({ lang: 'ts' });
  });

  it('defaults to empty lang for bare fences', () => {
    const md = ['```', 'plain', '```'].join('\n');
    const code = renderMarkdown(md).find((b) => b.kind === 'code');
    expect(code).toMatchObject({ lang: '', code: 'plain' });
  });

  it('returns an empty array for empty input', () => {
    expect(renderMarkdown('')).toEqual([]);
  });
});

describe('sanitization', () => {
  it('strips <script> tags from markdown HTML', () => {
    const out = html(renderMarkdown('hi <script>alert(1)</script> there'));
    expect(out).not.toContain('<script');
    expect(out).not.toContain('alert(1)');
  });

  it('strips event-handler attributes', () => {
    const out = sanitizeHtml('<img src="x" onerror="alert(1)">');
    expect(out).not.toContain('onerror');
  });

  it('drops javascript: links', () => {
    // eslint-disable-next-line no-script-url
    const out = sanitizeHtml('<a href="javascript:alert(1)">x</a>');
    expect(out).not.toContain('javascript:');
  });

  it('removes iframe / object embeds', () => {
    const out = sanitizeHtml('<iframe src="evil"></iframe><object></object>');
    expect(out).not.toContain('<iframe');
    expect(out).not.toContain('<object');
  });
});

describe('link hardening', () => {
  it('adds target and rel to anchors', () => {
    const out = html(renderMarkdown('[ex](https://example.com)'));
    expect(out).toContain('target="_blank"');
    expect(out).toContain('rel="noopener noreferrer"');
  });
});

describe('renderMarkdownToHtml', () => {
  it('inlines code fences as <pre><code> and stays sanitized', () => {
    const md = ['intro', '', '```', 'code', '```'].join('\n');
    const out = renderMarkdownToHtml(md);
    expect(out).toContain('<pre>');
    expect(out).toContain('<code>');
    expect(out).toContain('intro');
  });

  it('returns empty string for empty input', () => {
    expect(renderMarkdownToHtml('')).toBe('');
  });
});
