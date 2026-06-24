import type { Message, MessageRole } from './types.js';

/** An agent row is anything that isn't the user (assistant, tool, system). */
export function isAgentRole(role: MessageRole): boolean {
  return role !== 'user';
}

/**
 * True when the message at `index` opens a consecutive agent turn: it is an
 * agent row whose previous row is absent or a user message. The brain avatar
 * renders only on these rows so it shows once per turn rather than per row.
 */
export function isFirstOfAgentTurn(messages: Message[], index: number): boolean {
  const message = messages[index];
  if (!message || !isAgentRole(message.role)) return false;
  const previous = messages[index - 1];
  return !previous || !isAgentRole(previous.role);
}

/**
 * True when the avatar icon should render for this row: every user row, plus
 * the first row of each agent turn. Later agent/tool rows reserve the gutter
 * but hide the icon so content stays aligned without repeating it.
 */
export function showsAvatar(messages: Message[], index: number): boolean {
  const message = messages[index];
  if (!message) return false;
  if (message.role === 'user') return true;
  return isFirstOfAgentTurn(messages, index);
}
