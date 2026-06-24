import { groupParts, type PartGroup } from '../api/messages.js';
import type { Message } from '../api/types.js';

/**
 * Export a conversation to clean, shareable Markdown (MH-18).
 *
 * The serializer is pure: no DOM, no clipboard, no side effects. It turns each
 * message into a role heading followed by its text and tool-call sections.
 */
export function exportConversationToMarkdown(
  messages: Message[],
  session?: { title?: string }
): string {
  const lines: string[] = [];
  const title = session?.title?.trim() || 'Conversation';

  lines.push(`# ${title}`);
  lines.push('');

  for (const message of messages) {
    lines.push(`## ${roleHeading(message.role)}`);
    lines.push('');

    const groups = groupParts(message.parts);
    let renderedAny = false;

    for (const group of groups) {
      const rendered = renderGroup(group);
      if (!rendered) continue;
      lines.push(rendered);
      lines.push('');
      renderedAny = true;
    }

    // Empty assistant placeholder (e.g. mid-stream) still needs a blank body
    // so the heading is not glued to the next heading.
    if (!renderedAny) {
      lines.push('');
    }
  }

  return lines.join('\n').trimEnd() + '\n';
}

function roleHeading(role: Message['role']): string {
  switch (role) {
    case 'user':
      return 'User';
    case 'assistant':
      return 'Assistant';
    case 'tool':
      return 'Tool';
    case 'system':
      return 'System';
    default:
      return 'Message';
  }
}

function renderGroup(group: PartGroup): string | null {
  if (group.kind === 'text') {
    const text = group.text.trim();
    return text.length > 0 ? text : null;
  }

  if (group.kind === 'tool') {
    return renderToolGroup(group.invoke, group.result);
  }

  // Step parts are mostly progress scaffolding; skip in a static export.
  return null;
}

type ToolGroup = Extract<PartGroup, { kind: 'tool' }>;

function renderToolGroup(invoke: ToolGroup['invoke'], result: ToolGroup['result']): string {
  const name = (invoke?.tool ?? result?.tool ?? 'tool') as string;
  const lines: string[] = [];

  lines.push(`> **Tool:** ${name}`);

  if (invoke && invoke.input !== undefined) {
    lines.push('>');
    lines.push('> **Input:**');
    pushFencedBlock(lines, serializeValue(invoke.input), 'json');
  }

  if (result) {
    lines.push('>');
    if (result.error) {
      lines.push('> **Error:**');
      pushFencedBlock(lines, result.error, 'text');
    } else if (result.output !== undefined) {
      lines.push('> **Output:**');
      const text = serializeValue(result.output);
      const lang = detectLang(text, result.output);
      pushFencedBlock(lines, text, lang);
    }
  }

  return lines.join('\n');
}

function pushFencedBlock(lines: string[], text: string, lang: string): void {
  if (!text) return;
  const fence = '```';
  lines.push(`> ${fence}${lang}`);
  for (const line of text.split('\n')) {
    lines.push(`> ${line}`);
  }
  lines.push(`> ${fence}`);
}

function serializeValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function detectLang(text: string, value: unknown): string {
  if (typeof value !== 'string') return 'json';
  if (looksLikeDiff(text)) return 'diff';
  // Heuristic: if the output starts with a code-like token, leave it as plain
  // text and let the reader decide; markdown renderers still show it cleanly.
  return 'text';
}

function looksLikeDiff(text: string): boolean {
  return /^diff --git/m.test(text) || /^@@ [\d,+-]+ @@/m.test(text);
}

/**
 * Copy text to the system clipboard. Throws if the Clipboard API is missing or
 * denies permission so callers can surface the failure.
 */
export async function copyToClipboard(text: string): Promise<void> {
  if (typeof navigator === 'undefined' || !navigator.clipboard) {
    throw new Error('Clipboard API is not available');
  }
  await navigator.clipboard.writeText(text);
}

/**
 * Trigger a Markdown file download from the browser.
 *
 * Safe to call during SSR (no-ops when `document` is absent). The anchor is
 * created, clicked, and removed in the same task; the blob URL is revoked
 * immediately afterwards.
 */
export function downloadMarkdown(text: string, filename: string): void {
  if (typeof document === 'undefined') return;

  const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');

  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';

  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

/**
 * Build a safe filename for the exported markdown.
 */
export function exportFilename(sessionId?: string | null, title?: string): string {
  const date = new Date().toISOString().slice(0, 10);
  const base = title?.trim() || (sessionId ? `session-${sessionId}` : 'conversation');
  const slug = base.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return `${slug}-${date}.md`;
}
