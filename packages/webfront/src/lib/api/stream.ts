import type { Message, MessagePart, OpenCodeClient, SSEEvent, Unsubscribe } from './types.js';

export type StreamStatus = 'idle' | 'streaming' | 'completed' | 'error';

export interface StreamState {
  sessionId: string;
  messageId?: string;
  parts: MessagePart[];
  status: StreamStatus;
  error: string | null;
  completed: boolean;
  finalMessage?: Message;
}

export interface StreamingTarget {
  appendStreamingPart(part: MessagePart): void;
  finalizeStreaming(final?: Message): void;
}

export interface StreamSubscriptionOptions {
  client: OpenCodeClient;
  sessionId: string;
  messageId?: string;
  target: StreamingTarget;
  onError?: (message: string) => void;
  onComplete?: (state: StreamState) => void;
}

export function createInitialStreamState(sessionId: string, messageId?: string): StreamState {
  return {
    sessionId,
    messageId,
    parts: [],
    status: 'streaming',
    error: null,
    completed: false,
  };
}

export function reduceStreamEvent(state: StreamState, event: SSEEvent): StreamState {
  if (!isEventForState(state, event)) return state;

  switch (event.type) {
    case 'message.part.text':
      return appendPart(adoptMessageId(state, event.messageId), { type: 'text', text: event.text });
    case 'message.part.tool-invoke':
    case 'message.part.tool-result':
    case 'message.part.step-start':
    case 'message.part.step-finish':
      return appendPart(adoptMessageId(state, event.messageId), event.part);
    case 'message.completed':
      return {
        ...adoptMessageId(state, event.messageId ?? event.message?.id),
        status: 'completed',
        completed: true,
        error: null,
        finalMessage: event.message,
      };
    case 'message.error':
      return {
        ...adoptMessageId(state, event.messageId),
        status: 'error',
        completed: true,
        error: event.error,
      };
    case 'session.error':
      return {
        ...state,
        status: 'error',
        completed: true,
        error: event.error,
      };
    default:
      return state;
  }
}

export class StreamSubscription {
  private state: StreamState;
  private unsubscribe: Unsubscribe | null = null;
  private closed = false;

  constructor(private readonly options: StreamSubscriptionOptions) {
    this.state = createInitialStreamState(options.sessionId, options.messageId);
  }

  start(): Unsubscribe {
    if (this.unsubscribe) return () => this.stop();

    this.unsubscribe = this.options.client.subscribeEvents(this.options.sessionId, {
      onEvent: (event) => this.handleEvent(event),
      onError: (error) => this.handleTransportError(error),
    });

    return () => this.stop();
  }

  stop(): void {
    if (this.closed) return;
    this.closed = true;
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  getState(): StreamState {
    return this.state;
  }

  private handleEvent(event: SSEEvent): void {
    if (this.closed) return;

    const previous = this.state;
    const next = reduceStreamEvent(previous, event);
    if (next === previous) return;

    this.state = next;

    const part = partFromEvent(event);
    if (part) this.options.target.appendStreamingPart(part);

    if (next.status === 'completed') {
      this.options.target.finalizeStreaming(next.finalMessage);
      this.options.onComplete?.(next);
      this.stop();
    } else if (next.status === 'error') {
      this.options.onError?.(next.error ?? 'OpenCode event stream failed');
      this.options.target.finalizeStreaming(next.finalMessage);
      this.stop();
    }
  }

  private handleTransportError(error: Error): void {
    if (this.closed) return;
    this.options.onError?.(error.message);
  }
}

function appendPart(state: StreamState, part: MessagePart): StreamState {
  return {
    ...state,
    parts: mergePart(state.parts, part),
    status: 'streaming',
    error: null,
  };
}

function adoptMessageId(state: StreamState, messageId: string | undefined): StreamState {
  if (!messageId || state.messageId === messageId) return state;
  if (state.messageId) return state;
  return { ...state, messageId };
}

function mergePart(parts: MessagePart[], incoming: MessagePart): MessagePart[] {
  if (incoming.type === 'text') {
    const last = parts[parts.length - 1];
    if (last?.type === 'text') {
      return [...parts.slice(0, -1), { type: 'text', text: last.text + incoming.text }];
    }
    return [...parts, incoming];
  }

  const incomingId = 'id' in incoming ? incoming.id : undefined;
  if (!incomingId) return [...parts, incoming];

  const index = parts.findIndex((part) => part.type === incoming.type && 'id' in part && part.id === incomingId);
  if (index === -1) return [...parts, incoming];

  return [...parts.slice(0, index), incoming, ...parts.slice(index + 1)];
}

function partFromEvent(event: SSEEvent): MessagePart | null {
  switch (event.type) {
    case 'message.part.text':
      return { type: 'text', text: event.text };
    case 'message.part.tool-invoke':
    case 'message.part.tool-result':
    case 'message.part.step-start':
    case 'message.part.step-finish':
      return event.part;
    default:
      return null;
  }
}

function isEventForState(state: StreamState, event: SSEEvent): boolean {
  const eventSessionId = sessionIdFromEvent(event);
  if (eventSessionId && eventSessionId !== state.sessionId) return false;

  const eventMessageId = messageIdFromEvent(event);
  if (state.messageId && eventMessageId && eventMessageId !== state.messageId) return false;

  return true;
}

function messageIdFromEvent(event: SSEEvent): string | undefined {
  switch (event.type) {
    case 'message.part.text':
    case 'message.part.tool-invoke':
    case 'message.part.tool-result':
    case 'message.part.step-start':
    case 'message.part.step-finish':
    case 'message.completed':
    case 'message.error':
      return event.messageId;
    default:
      return undefined;
  }
}

function sessionIdFromEvent(event: SSEEvent): string | undefined {
  if (event.type === 'session.error') return event.sessionId;
  return stringFromRaw(event.raw, ['sessionId', 'sessionID', 'session_id']);
}

function stringFromRaw(raw: unknown, keys: string[]): string | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const record = raw as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string') return value;
  }
  return undefined;
}
