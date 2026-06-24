import { describe, expect, it } from 'bun:test';
import type { Message, MessageRole } from './types.js';
import { isAgentRole, isFirstOfAgentTurn, showsAvatar } from './message-grouping.js';

function msg(role: MessageRole, id = `${role}-${Math.random()}`): Message {
  return { id, role, parts: [], createdAt: '2026-01-01T00:00:00.000Z' };
}

/** Helper: build a sequence from a compact role list. */
function seq(roles: MessageRole[]): Message[] {
  return roles.map((role, i) => msg(role, `${role}-${i}`));
}

describe('isAgentRole', () => {
  it('treats every non-user role as an agent row', () => {
    expect(isAgentRole('assistant')).toBe(true);
    expect(isAgentRole('tool')).toBe(true);
    expect(isAgentRole('system')).toBe(true);
  });

  it('does not treat the user as an agent row', () => {
    expect(isAgentRole('user')).toBe(false);
  });
});

describe('isFirstOfAgentTurn', () => {
  it('is true for an agent row at the start of the thread', () => {
    const messages = seq(['assistant', 'tool']);
    expect(isFirstOfAgentTurn(messages, 0)).toBe(true);
  });

  it('is true for the first agent row after a user message', () => {
    const messages = seq(['user', 'assistant', 'tool']);
    expect(isFirstOfAgentTurn(messages, 1)).toBe(true);
  });

  it('is false for subsequent agent/tool rows in the same turn', () => {
    const messages = seq(['user', 'assistant', 'tool', 'tool', 'assistant']);
    expect(isFirstOfAgentTurn(messages, 2)).toBe(false);
    expect(isFirstOfAgentTurn(messages, 3)).toBe(false);
    expect(isFirstOfAgentTurn(messages, 4)).toBe(false);
  });

  it('is false for user rows', () => {
    const messages = seq(['user', 'assistant']);
    expect(isFirstOfAgentTurn(messages, 0)).toBe(false);
  });

  it('opens a new turn after an intervening user message', () => {
    const messages = seq(['user', 'assistant', 'user', 'assistant']);
    expect(isFirstOfAgentTurn(messages, 1)).toBe(true);
    expect(isFirstOfAgentTurn(messages, 3)).toBe(true);
  });

  it('handles out-of-range indexes gracefully', () => {
    const messages = seq(['assistant']);
    expect(isFirstOfAgentTurn(messages, -1)).toBe(false);
    expect(isFirstOfAgentTurn(messages, 5)).toBe(false);
  });
});

describe('showsAvatar', () => {
  it('shows the avatar once per agent turn for the canonical sequence', () => {
    // user, assistant, tool, tool, assistant, user, assistant
    const messages = seq([
      'user',
      'assistant',
      'tool',
      'tool',
      'assistant',
      'user',
      'assistant',
    ]);
    const shown = messages.map((_, i) => showsAvatar(messages, i));
    expect(shown).toEqual([
      true, // user (own avatar)
      true, // first assistant of turn → brain icon
      false, // tool (gutter reserved, no icon)
      false, // tool
      false, // assistant continuation
      true, // user
      true, // first assistant of next turn → brain icon
    ]);
  });

  it('reserves the gutter (no icon) on every continuation row', () => {
    const messages = seq(['assistant', 'tool', 'tool']);
    expect(showsAvatar(messages, 0)).toBe(true);
    expect(showsAvatar(messages, 1)).toBe(false);
    expect(showsAvatar(messages, 2)).toBe(false);
  });

  it('shows the avatar on a streaming first assistant row (no following rows yet)', () => {
    const messages = seq(['user', 'assistant']);
    expect(showsAvatar(messages, 1)).toBe(true);
  });

  it('shows the avatar on every user message', () => {
    const messages = seq(['user', 'assistant', 'user']);
    expect(showsAvatar(messages, 0)).toBe(true);
    expect(showsAvatar(messages, 2)).toBe(true);
  });

  it('returns false for an out-of-range index', () => {
    const messages = seq(['assistant']);
    expect(showsAvatar(messages, 9)).toBe(false);
  });
});
