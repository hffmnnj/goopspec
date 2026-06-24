import { describe, expect, it } from 'bun:test';
import type { Message, MessagePart, SSEEvent } from './types.js';
import { createInitialStreamState, reduceStreamEvent } from './stream.js';

function reduceAll(events: SSEEvent[]) {
  return events.reduce(
    (state, event) => reduceStreamEvent(state, event),
    createInitialStreamState('s1', 'm1')
  );
}

describe('stream reducer', () => {
  it('coalesces text deltas into one text part', () => {
    const state = reduceAll([
      { type: 'message.part.text', messageId: 'm1', text: 'Hel' },
      { type: 'message.part.text', messageId: 'm1', text: 'lo' },
    ]);

    expect(state.parts).toEqual([{ type: 'text', text: 'Hello' }]);
    expect(state.status).toBe('streaming');
  });

  it('adds tool invocations and updates repeated tool results by id', () => {
    const state = reduceAll([
      {
        type: 'message.part.tool-invoke',
        messageId: 'm1',
        part: { type: 'tool-invoke', id: 'tool-1', tool: 'read', input: { path: 'README.md' } },
      },
      {
        type: 'message.part.tool-result',
        messageId: 'm1',
        part: { type: 'tool-result', id: 'tool-1', tool: 'read', output: 'draft' },
      },
      {
        type: 'message.part.tool-result',
        messageId: 'm1',
        part: { type: 'tool-result', id: 'tool-1', tool: 'read', output: 'final' },
      },
    ]);

    expect(state.parts).toEqual([
      { type: 'tool-invoke', id: 'tool-1', tool: 'read', input: { path: 'README.md' } },
      { type: 'tool-result', id: 'tool-1', tool: 'read', output: 'final' },
    ] satisfies MessagePart[]);
  });

  it('tracks step boundaries and completion state', () => {
    const final: Message = {
      id: 'm1',
      role: 'assistant',
      parts: [{ type: 'text', text: 'Done' }],
      createdAt: '2026-06-24T00:00:00.000Z',
    };
    const state = reduceAll([
      { type: 'message.part.step-start', messageId: 'm1', part: { type: 'step-start', id: 'step-1', title: 'Thinking' } },
      {
        type: 'message.part.step-finish',
        messageId: 'm1',
        part: { type: 'step-finish', id: 'step-1', title: 'Thinking', status: 'success' },
      },
      { type: 'message.completed', messageId: 'm1', message: final },
    ]);

    expect(state.parts).toEqual([
      { type: 'step-start', id: 'step-1', title: 'Thinking' },
      { type: 'step-finish', id: 'step-1', title: 'Thinking', status: 'success' },
    ]);
    expect(state.status).toBe('completed');
    expect(state.completed).toBe(true);
    expect(state.finalMessage).toBe(final);
  });

  it('sets error state for message and session errors', () => {
    const messageError = reduceStreamEvent(createInitialStreamState('s1', 'm1'), {
      type: 'message.error',
      messageId: 'm1',
      error: 'model failed',
    });
    const sessionError = reduceStreamEvent(createInitialStreamState('s1', 'm1'), {
      type: 'session.error',
      sessionId: 's1',
      error: 'session failed',
    });

    expect(messageError).toEqual(expect.objectContaining({ status: 'error', completed: true, error: 'model failed' }));
    expect(sessionError).toEqual(expect.objectContaining({ status: 'error', completed: true, error: 'session failed' }));
  });

  it('ignores events for stale messages and sessions', () => {
    const initial = createInitialStreamState('s1', 'm1');
    const staleMessage = reduceStreamEvent(initial, {
      type: 'message.part.text',
      messageId: 'other-message',
      text: 'ignored',
    });
    const staleSession = reduceStreamEvent(initial, {
      type: 'message.part.text',
      messageId: 'm1',
      text: 'ignored',
      raw: { sessionId: 'other-session' },
    });

    expect(staleMessage).toBe(initial);
    expect(staleSession).toBe(initial);
  });
});
