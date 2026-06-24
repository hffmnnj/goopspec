import { createClient } from '../api/client.js';
import { fetchMessages } from '../api/messages.js';
import { StreamSubscription } from '../api/stream.js';
import type { Message, MessagePart, OpenCodeClient, SendMessageInput } from '../api/types.js';
import { model } from './model.svelte.js';

function now(): string {
  return new Date().toISOString();
}

function makeId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `${prefix}-${Date.now().toString(36)}-${rand}`;
}

function userMessage(text: string): Message {
  return {
    id: makeId('local-user'),
    role: 'user',
    parts: [{ type: 'text', text }],
    createdAt: now(),
  };
}

/**
 * Reactive chat store for a single active session.
 *
 * Owns the message list, send loop, and the streaming extension points that
 * T3.2 (SSE consumer) will drive. The store is intentionally transport-free:
 * it appends an optimistic user message and a placeholder assistant message,
 * then exposes `appendStreamingPart` / `finalizeStreaming` so the SSE reducer
 * can reconcile live tokens into the placeholder without re-fetching.
 */
class ChatStore {
  messages = $state([] as Message[]);
  loading = $state(false);
  streaming = $state(false);
  error = $state(null as string | null);
  activeSessionId = $state(null as string | null);

  /** Newest assistant message currently receiving streamed parts (T3.2). */
  private streamingMessageId: string | null = null;
  private streamSubscription: StreamSubscription | null = null;

  constructor(private readonly client: OpenCodeClient) {}

  /** Load full history for a session and make it the active conversation. */
  async loadHistory(sessionId: string): Promise<void> {
    this.stopStreamSubscription();
    this.activeSessionId = sessionId;
    this.loading = true;
    this.error = null;
    this.streaming = false;
    this.streamingMessageId = null;

    try {
      this.messages = await fetchMessages(this.client, sessionId);
    } catch (err) {
      this.error = err instanceof Error ? err.message : 'Failed to load messages';
    } finally {
      this.loading = false;
    }
  }

  /**
   * Send a user message in the active session.
   *
   * Appends the user message optimistically and seeds an empty assistant
   * placeholder that the streaming reducer (T3.2) fills via
   * `appendStreamingPart`. Marks `streaming` true; the SSE consumer flips it
   * off through `finalizeStreaming` when the reply completes.
   */
  async sendMessage(text: string): Promise<void> {
    const trimmed = text.trim();
    if (!trimmed || !this.activeSessionId) return;
    const sessionId = this.activeSessionId;

    this.error = null;
    const user = userMessage(trimmed);
    this.interrupt();
    this.messages = [...this.messages, user];

    const input: SendMessageInput = { text: trimmed };
    if (model.selectedProviderId && model.selectedModelId) {
      input.providerId = model.selectedProviderId;
      input.modelId = model.selectedModelId;
    }
    this.beginStreaming();

    try {
      const reply = await this.client.sendMessage(sessionId, input);
      if (this.activeSessionId !== sessionId) return;
      // Adopt the server-issued message id so streamed parts (keyed by the
      // server messageId) reconcile onto this placeholder. T3.2 wires the
      // event subscription that drives appendStreamingPart for this id.
      this.adoptStreamingMessage(reply);
      this.startStreamSubscription(sessionId, reply.id);
    } catch (err) {
      this.error = err instanceof Error ? err.message : 'Failed to send message';
      this.finalizeStreaming();
    }
  }

  /* -------------------------------------------------------------------------
   * Streaming extension points — T3.2 wires the SSE consumer into these.
   * T3.2 subscribes via client.subscribeEvents(sessionId, ...), maps each
   * SSEEvent onto appendStreamingPart(), and calls finalizeStreaming() on
   * message.completed / message.error.
   * ----------------------------------------------------------------------- */

  /** Seed an empty assistant placeholder and enter the streaming state. */
  private beginStreaming(): void {
    const placeholder: Message = {
      id: makeId('local-assistant'),
      role: 'assistant',
      parts: [],
      createdAt: now(),
    };
    this.streamingMessageId = placeholder.id;
    this.messages = [...this.messages, placeholder];
    this.streaming = true;
  }

  /** Re-key the streaming placeholder to the server-issued message. */
  private adoptStreamingMessage(reply: Message): void {
    if (!this.streamingMessageId) return;
    const previousId = this.streamingMessageId;
    this.streamingMessageId = reply.id;

    this.messages = this.messages.map((message) =>
      message.id === previousId
        ? { ...reply, parts: reply.parts.length ? reply.parts : message.parts }
        : message
    );
  }

  /** Append a streamed part onto the active assistant message (T3.2). */
  appendStreamingPart(part: MessagePart): void {
    if (!this.streamingMessageId) return;

    this.messages = this.messages.map((message) => {
      if (message.id !== this.streamingMessageId) return message;
      const parts = mergePart(message.parts, part);
      return { ...message, parts, updatedAt: now() };
    });
  }

  /** Mark the in-flight reply complete and leave the streaming state (T3.2). */
  finalizeStreaming(final?: Message): void {
    if (final && this.streamingMessageId) {
      const targetId = this.streamingMessageId;
      this.messages = this.messages.map((message) =>
        message.id === targetId
          ? {
              ...message,
              ...final,
              id: targetId,
              parts: final.parts.length ? final.parts : message.parts,
              updatedAt: final.updatedAt ?? now(),
            }
          : message
      );
    }
    this.stopStreamSubscription();
    this.streaming = false;
    this.streamingMessageId = null;
  }

  /** Stop the active reply stream and mark it as cancelled. */
  interrupt(): void {
    if (!this.streaming) return;

    this.appendStreamingPart({ type: 'step-finish', title: 'Interrupted', status: 'cancelled' });
    this.finalizeStreaming();
  }

  /** Reset to an empty conversation (keeps the active session id). */
  clear(): void {
    this.stopStreamSubscription();
    this.messages = [];
    this.error = null;
    this.streaming = false;
    this.streamingMessageId = null;
  }

  /**
   * Return the text of the most recent user message (for the Up-arrow edit
   * shortcut wired in Wave 8). Does not mutate state.
   */
  editLastUserMessage(): string | null {
    for (let index = this.messages.length - 1; index >= 0; index -= 1) {
      const message = this.messages[index];
      if (message.role !== 'user') continue;
      const text = message.parts
        .filter((part): part is Extract<MessagePart, { type: 'text' }> => part.type === 'text')
        .map((part) => part.text)
        .join('');
      return text || null;
    }
    return null;
  }

  clearError(): void {
    this.error = null;
  }

  private startStreamSubscription(sessionId: string, messageId: string): void {
    this.stopStreamSubscription();
    const subscription = new StreamSubscription({
      client: this.client,
      sessionId,
      messageId,
      target: this,
      onError: (message) => {
        this.error = message;
      },
      onComplete: () => {
        if (this.streamSubscription === subscription) this.streamSubscription = null;
      },
    });
    this.streamSubscription = subscription;
    subscription.start();
  }

  private stopStreamSubscription(): void {
    this.streamSubscription?.stop();
    this.streamSubscription = null;
  }
}

/**
 * Append-or-extend a streamed part. Consecutive text deltas coalesce into the
 * trailing text part so the assistant reply reads as one growing block rather
 * than many fragments.
 */
function mergePart(parts: MessagePart[], incoming: MessagePart): MessagePart[] {
  if (incoming.type === 'text') {
    const last = parts[parts.length - 1];
    if (last && last.type === 'text') {
      const merged: MessagePart = { type: 'text', text: last.text + incoming.text };
      return [...parts.slice(0, -1), merged];
    }
  }

  const incomingId = 'id' in incoming ? incoming.id : undefined;
  if (incomingId) {
    const index = parts.findIndex(
      (part) => part.type === incoming.type && 'id' in part && part.id === incomingId
    );
    if (index !== -1) return [...parts.slice(0, index), incoming, ...parts.slice(index + 1)];
  }

  return [...parts, incoming];
}

export function createChatStore(client?: OpenCodeClient): ChatStore {
  return new ChatStore(client ?? createClient());
}

/** Default reactive chat store backed by the configured OpenCode client. */
export const chat = createChatStore();

export type { ChatStore };
