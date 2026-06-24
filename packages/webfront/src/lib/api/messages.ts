import type { Message, MessagePart, OpenCodeClient } from './types.js';

/* ---------------------------------------------------------------------------
 * Fetch
 * ------------------------------------------------------------------------- */

/** Load the full message history for a session via the adapter. */
export async function fetchMessages(
  client: OpenCodeClient,
  sessionId: string
): Promise<Message[]> {
  return client.getMessages(sessionId);
}

/* ---------------------------------------------------------------------------
 * Part type guards
 *
 * The streaming consumer (T3.2) and the renderers (MessageList, ToolCard in
 * T4) discriminate on `MessagePart.type`. Centralizing the guards keeps that
 * narrowing in one place and avoids repeating the union literals everywhere.
 * ------------------------------------------------------------------------- */

export type TextPart = Extract<MessagePart, { type: 'text' }>;
export type ToolInvokePart = Extract<MessagePart, { type: 'tool-invoke' }>;
export type ToolResultPart = Extract<MessagePart, { type: 'tool-result' }>;
export type StepStartPart = Extract<MessagePart, { type: 'step-start' }>;
export type StepFinishPart = Extract<MessagePart, { type: 'step-finish' }>;

export function isTextPart(part: MessagePart): part is TextPart {
  return part.type === 'text';
}

export function isToolInvokePart(part: MessagePart): part is ToolInvokePart {
  return part.type === 'tool-invoke';
}

export function isToolResultPart(part: MessagePart): part is ToolResultPart {
  return part.type === 'tool-result';
}

export function isStepStartPart(part: MessagePart): part is StepStartPart {
  return part.type === 'step-start';
}

export function isStepFinishPart(part: MessagePart): part is StepFinishPart {
  return part.type === 'step-finish';
}

export function isToolPart(part: MessagePart): part is ToolInvokePart | ToolResultPart {
  return isToolInvokePart(part) || isToolResultPart(part);
}

export function isStepPart(part: MessagePart): part is StepStartPart | StepFinishPart {
  return isStepStartPart(part) || isStepFinishPart(part);
}

/* ---------------------------------------------------------------------------
 * Normalization / display helpers
 * ------------------------------------------------------------------------- */

/** Concatenate all text parts of a message into a single display string. */
export function deriveText(message: Message): string {
  return message.parts
    .filter(isTextPart)
    .map((part) => part.text)
    .join('');
}

/** Only the text parts, in order — useful for Markdown rendering (T3.3). */
export function textParts(message: Message): TextPart[] {
  return message.parts.filter(isTextPart);
}

/** Only the tool parts (invoke + result), in order — for tool cards (T4). */
export function toolParts(message: Message): Array<ToolInvokePart | ToolResultPart> {
  return message.parts.filter(isToolPart);
}

/**
 * Group adjacent parts so the renderer can interleave prose and tool blocks
 * while preserving order. Consecutive text parts collapse into one group so
 * Markdown renders as a single document rather than fragmented blocks. A
 * tool-invoke is paired with its matching tool-result (same `id`) into one
 * tool group so the card renders invoke + result together (T4).
 */
export type PartGroup =
  | { kind: 'text'; text: string }
  | { kind: 'tool'; invoke?: ToolInvokePart; result?: ToolResultPart }
  | { kind: 'step'; part: StepStartPart | StepFinishPart };

export function groupParts(parts: MessagePart[]): PartGroup[] {
  const groups: PartGroup[] = [];
  // Map a tool id → the tool group it belongs to, so a later result can attach
  // to the invoke that opened the call (parts may arrive out of order/split).
  const toolGroupById = new Map<string, Extract<PartGroup, { kind: 'tool' }>>();

  for (const part of parts) {
    if (isTextPart(part)) {
      const last = groups[groups.length - 1];
      if (last && last.kind === 'text') {
        last.text += part.text;
      } else {
        groups.push({ kind: 'text', text: part.text });
      }
    } else if (isToolInvokePart(part)) {
      const group: Extract<PartGroup, { kind: 'tool' }> = { kind: 'tool', invoke: part };
      groups.push(group);
      if (part.id) toolGroupById.set(part.id, group);
    } else if (isToolResultPart(part)) {
      const existing = part.id ? toolGroupById.get(part.id) : undefined;
      if (existing) {
        existing.result = part;
      } else {
        // A result with no preceding invoke (id missing or invoke not seen):
        // render it as its own card.
        groups.push({ kind: 'tool', result: part });
      }
    } else {
      groups.push({ kind: 'step', part });
    }
  }

  return groups;
}

/** True when a message has any renderable text content. */
export function hasText(message: Message): boolean {
  return message.parts.some((part) => isTextPart(part) && part.text.length > 0);
}

/** True when a message carries no parts yet (e.g. a freshly-streaming reply). */
export function isEmptyMessage(message: Message): boolean {
  return message.parts.length === 0;
}
