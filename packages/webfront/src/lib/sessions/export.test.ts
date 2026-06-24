import { describe, expect, it } from 'bun:test';
import type { Message, MessagePart } from '$lib/api/types.js';
import {
  copyToClipboard,
  downloadMarkdown,
  exportConversationToMarkdown,
  exportFilename,
} from './export.js';

function message(role: Message['role'], parts: MessagePart[]): Message {
  return {
    id: 'm-1',
    role,
    parts,
    createdAt: '2026-06-24T00:00:00.000Z',
  };
}

describe('exportConversationToMarkdown', () => {
  it('renders a title and role headings', () => {
    const out = exportConversationToMarkdown(
      [message('user', [{ type: 'text', text: 'Hi' }])],
      { title: 'My Chat' }
    );

    expect(out).toContain('# My Chat');
    expect(out).toContain('## User');
    expect(out).toContain('Hi');
  });

  it('falls back to "Conversation" when no session title is provided', () => {
    const out = exportConversationToMarkdown([]);
    expect(out).toContain('# Conversation');
  });

  it('exports a conversation with user, assistant, and tool-call messages', () => {
    const messages: Message[] = [
      message('user', [{ type: 'text', text: 'Read the file.' }]),
      {
        id: 'm-2',
        role: 'assistant',
        parts: [
          { type: 'text', text: 'I will read it now.' },
          { type: 'tool-invoke', id: 't1', tool: 'read', input: { path: 'notes.md' } },
          { type: 'tool-result', id: 't1', tool: 'read', output: '# Notes\nHello' },
        ],
        createdAt: '2026-06-24T00:00:01.000Z',
      },
    ];

    const out = exportConversationToMarkdown(messages);

    expect(out).toContain('## User');
    expect(out).toContain('Read the file.');
    expect(out).toContain('## Assistant');
    expect(out).toContain('I will read it now.');
    expect(out).toContain('**Tool:** read');
    expect(out).toContain('"path": "notes.md"');
    expect(out).toContain('# Notes');
    expect(out).toContain('Hello');
  });

  it('preserves code blocks from assistant messages', () => {
    const text = '```ts\nconst x = 1;\n```';
    const out = exportConversationToMarkdown([
      message('assistant', [{ type: 'text', text }]),
    ]);

    expect(out).toContain('```ts');
    expect(out).toContain('const x = 1;');
  });

  it('renders tool errors when present', () => {
    const out = exportConversationToMarkdown([
      message('assistant', [
        { type: 'tool-invoke', id: 't1', tool: 'bash', input: { cmd: 'ls' } },
        { type: 'tool-result', id: 't1', tool: 'bash', error: 'not found' },
      ]),
    ]);

    expect(out).toContain('**Tool:** bash');
    expect(out).toContain('**Error:**');
    expect(out).toContain('not found');
  });

  it('renders diff output as diff fenced blocks', () => {
    const diff = 'diff --git a/x b/x\n@@ -1 +1 @@\n-old\n+new';
    const out = exportConversationToMarkdown([
      message('assistant', [
        { type: 'tool-invoke', id: 't1', tool: 'edit', input: { path: 'x' } },
        { type: 'tool-result', id: 't1', tool: 'edit', output: diff },
      ]),
    ]);

    expect(out).toContain('```diff');
    expect(out).toContain('-old');
    expect(out).toContain('+new');
  });

  it('handles an empty conversation', () => {
    const out = exportConversationToMarkdown([]);
    expect(out.trim()).toBe('# Conversation');
  });

  it('handles messages with no renderable parts', () => {
    const out = exportConversationToMarkdown([message('assistant', [])]);
    expect(out).toContain('## Assistant');
    expect(out).not.toContain('## Assistant\n\n\n##');
  });

  it('handles system and tool roles', () => {
    const out = exportConversationToMarkdown([
      message('system', [{ type: 'text', text: 'System prompt.' }]),
      message('tool', [{ type: 'text', text: 'Tool answer.' }]),
    ]);

    expect(out).toContain('## System');
    expect(out).toContain('System prompt.');
    expect(out).toContain('## Tool');
    expect(out).toContain('Tool answer.');
  });
});

describe('copyToClipboard', () => {
  it('throws when navigator.clipboard is missing', async () => {
    await expect(copyToClipboard('hello')).rejects.toThrow('Clipboard API is not available');
  });

  it('writes text when navigator.clipboard is available', async () => {
    const writeText = (_text: string) => Promise.resolve();
    (globalThis as unknown as { navigator: { clipboard: { writeText: typeof writeText } } }).navigator = {
      clipboard: { writeText },
    };

    await expect(copyToClipboard('hello')).resolves.toBeUndefined();
  });
});

describe('downloadMarkdown', () => {
  it('does not crash when document is missing (SSR)', () => {
    expect(() => downloadMarkdown('text', 'file.md')).not.toThrow();
  });
});

describe('exportFilename', () => {
  it('uses the title and today', () => {
    const out = exportFilename('s1', 'My Great Chat');
    expect(out).toMatch(/^my-great-chat-\d{4}-\d{2}-\d{2}\.md$/);
  });

  it('falls back to session id when no title', () => {
    const out = exportFilename('s42');
    expect(out).toMatch(/^session-s42-\d{4}-\d{2}-\d{2}\.md$/);
  });

  it('falls back to conversation when no id or title', () => {
    const out = exportFilename();
    expect(out).toMatch(/^conversation-\d{4}-\d{2}-\d{2}\.md$/);
  });
});
