/**
 * Markdown rendering pipeline (T3.3 — MH-15, MH-16).
 *
 * Tokenize CommonMark + GFM with `marked`, sanitize prose HTML with DOMPurify,
 * and surface fenced code as structured nodes for the `CodeBlock` component
 * (Shiki + copy). The ordered html/code block list keeps prose sanitized before
 * `{@html}`, defers heavy Shiki to the client, and preserves document order.
 * The renderer is pure (no DOM, no Shiki) so it runs the same in browser, SSR,
 * and tests.
 */
import { marked, type Token, type Tokens } from 'marked';
import DOMPurify from 'isomorphic-dompurify';

/** A run of sanitized, ready-to-`{@html}` prose. */
export interface HtmlBlock {
  kind: 'html';
  html: string;
}

/** A fenced code block, handed to `CodeBlock` for highlighting + copy. */
export interface CodeBlockNode {
  kind: 'code';
  code: string;
  /** Language hint from the fence info string, normalized to lowercase. */
  lang: string;
}

export type MarkdownBlock = HtmlBlock | CodeBlockNode;

/* ---------------------------------------------------------------------------
 * marked configuration
 * ------------------------------------------------------------------------- */

// GFM + CommonMark. `breaks: false` keeps standard paragraph semantics; soft
// line breaks inside a paragraph collapse to spaces like GitHub.
marked.setOptions({
  gfm: true,
  breaks: false,
});

/* ---------------------------------------------------------------------------
 * Sanitization
 * ------------------------------------------------------------------------- */

const ALLOWED_TAGS = [
  'a', 'p', 'br', 'hr', 'span', 'div',
  'strong', 'em', 'del', 's', 'b', 'i', 'u', 'mark',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'ul', 'ol', 'li',
  'blockquote',
  'code', 'pre',
  'table', 'thead', 'tbody', 'tr', 'th', 'td',
  'img',
  'input', // GFM task-list checkboxes (rendered disabled)
  'sup', 'sub',
];

const ALLOWED_ATTR = [
  'href', 'title', 'target', 'rel',
  'src', 'alt', 'width', 'height',
  'class', 'align',
  'type', 'checked', 'disabled', // task-list checkboxes
];

/**
 * Sanitize untrusted HTML. Anchors are post-processed to force safe external
 * link behavior (`target="_blank"` + `rel="noopener noreferrer"`) regardless of
 * what the source markdown asked for.
 *
 * The hook is registered once per module load and is idempotent.
 */
let hookRegistered = false;
function ensureLinkHardening(): void {
  if (hookRegistered) return;
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node.tagName === 'A') {
      node.setAttribute('target', '_blank');
      node.setAttribute('rel', 'noopener noreferrer');
    }
    // Force any surviving task-list checkbox to be non-interactive.
    if (node.tagName === 'INPUT') {
      node.setAttribute('disabled', '');
    }
  });
  hookRegistered = true;
}

export function sanitizeHtml(dirty: string): string {
  ensureLinkHardening();
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    // Block javascript:, data:, vbscript: in href/src.
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel|ftp):|[^a-z]|[a-z+.-]+(?:[^a-z+.:-]|$))/i,
  });
}

/* ---------------------------------------------------------------------------
 * Tokenize → blocks
 * ------------------------------------------------------------------------- */

/**
 * Parse `text` into an ordered list of renderable blocks. Top-level fenced code
 * blocks become `code` nodes; every other run of tokens is rendered to HTML and
 * sanitized into a single `html` block, preserving document order.
 */
export function renderMarkdown(text: string): MarkdownBlock[] {
  if (!text) return [];

  const tokens = marked.lexer(text);
  // Reference-link definitions ([1]: url) live on the TokensList's `links` map,
  // not in the token stream. Carry it onto every slice so refs resolve no
  // matter which side of a code fence the definition lands on.
  const links = (tokens as { links?: Record<string, unknown> }).links ?? {};
  const blocks: MarkdownBlock[] = [];
  let pending: Token[] = [];

  const flushPending = (): void => {
    if (pending.length === 0) return;
    const slice = pending as Token[] & { links: Record<string, unknown> };
    slice.links = links;
    const html = marked.parser(slice as Parameters<typeof marked.parser>[0]);
    const clean = sanitizeHtml(html);
    if (clean.trim().length > 0) {
      blocks.push({ kind: 'html', html: clean });
    }
    pending = [];
  };

  for (const token of tokens) {
    if (token.type === 'code') {
      flushPending();
      const code = token as Tokens.Code;
      blocks.push({
        kind: 'code',
        code: code.text ?? '',
        lang: (code.lang ?? '').trim().split(/\s+/)[0]?.toLowerCase() ?? '',
      });
    } else {
      pending.push(token);
    }
  }
  flushPending();

  return blocks;
}

/**
 * Convenience: render `text` straight to a single sanitized HTML string,
 * inlining code fences as plain `<pre><code>` (no Shiki / copy). Useful for
 * non-interactive contexts (export, previews) where component rendering is
 * unavailable.
 */
export function renderMarkdownToHtml(text: string): string {
  if (!text) return '';
  return sanitizeHtml(marked.parse(text, { async: false }) as string);
}
