import type { SlashCommand } from '../api/types.js';

/**
 * Pure helpers for slash-command completion in the message composer.
 *
 * Kept DOM-free so the trigger/filter/insert logic can be unit-tested without a
 * component harness — matching the messages.ts / tool-card.ts split used
 * elsewhere in the chat module.
 */

/** A command completion trigger detected in the composer value. */
export interface CommandTrigger {
  /** Text after the leading `/` up to the cursor (the command-name query). */
  query: string;
  /** Index of the `/` in the source string. */
  start: number;
}

/**
 * Detect a slash-command trigger for the given composer value and cursor.
 *
 * Commands are only valid at the very start of the message (OpenCode parity):
 * the `/` must be the first character and the query (text up to the cursor)
 * must not contain whitespace — once the user types a space, they are writing
 * arguments and the menu closes.
 */
export function detectCommandTrigger(value: string, cursor: number): CommandTrigger | null {
  if (value[0] !== '/') return null;
  const head = value.slice(1, cursor);
  if (/\s/.test(head)) return null;
  return { query: head, start: 0 };
}

/**
 * Filter and rank commands against a query (text after `/`).
 *
 * Ranking: exact name match first, then prefix matches (shorter names first),
 * then substring matches in name, then substring matches in description.
 * Matching is case-insensitive. An empty query returns every command in
 * alphabetical order.
 */
export function filterCommands(list: SlashCommand[], query: string): SlashCommand[] {
  const q = query.trim().toLowerCase();
  const byName = [...list].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  if (!q) return byName;

  const scored: Array<{ command: SlashCommand; score: number }> = [];
  for (const command of byName) {
    const name = command.name.toLowerCase();
    const description = (command.description ?? '').toLowerCase();
    let score: number;
    if (name === q) score = 0;
    else if (name.startsWith(q)) score = 1;
    else if (name.includes(q)) score = 2;
    else if (description.includes(q)) score = 3;
    else continue;
    scored.push({ command, score });
  }

  return scored
    .sort((a, b) => {
      if (a.score !== b.score) return a.score - b.score;
      // Within the same tier, prefer shorter (closer) names.
      if (a.command.name.length !== b.command.name.length) {
        return a.command.name.length - b.command.name.length;
      }
      return a.command.name.localeCompare(b.command.name, undefined, { sensitivity: 'base' });
    })
    .map((entry) => entry.command);
}

/**
 * Whether a command expects free-text arguments after its name.
 *
 * Inferred from the prompt template containing an argument placeholder
 * (`$ARGUMENTS` / `$1` style). When unknown we leave a trailing space so the
 * user can type arguments if needed without it being disruptive.
 */
export function commandTakesArguments(command: SlashCommand): boolean {
  const template = command.template ?? '';
  return /\$arguments\b/i.test(template) || /\$\d/.test(template);
}

/** Result of completing a command into the composer. */
export interface CommandCompletion {
  /** New composer value. */
  value: string;
  /** Cursor position after insertion (end of value). */
  cursor: number;
}

/**
 * Complete the selected command into the composer, replacing the partial
 * `/query` at the start with `/name ` (trailing space positions the cursor for
 * arguments). Any text already typed after the trigger is preserved.
 */
export function completeCommand(value: string, command: SlashCommand): CommandCompletion {
  // Preserve anything after the first whitespace (already-typed arguments).
  const firstSpace = value.indexOf(' ');
  const rest = firstSpace === -1 ? '' : value.slice(firstSpace);
  const completed = `/${command.name}${rest === '' ? ' ' : rest}`;
  const cursor = firstSpace === -1 ? completed.length : `/${command.name} `.length;
  return { value: completed, cursor };
}

/**
 * Parse a composer value into a leading slash command and its arguments.
 *
 * Returns null when the text is not a recognised command (the caller then sends
 * it as a normal prompt). Mirrors OpenCode's submit logic: split on the first
 * space, the head (minus `/`) is the command name, the tail is the arguments.
 */
export function parseCommandInput(
  text: string,
  known: SlashCommand[]
): { command: string; arguments: string } | null {
  if (text[0] !== '/') return null;
  const [head, ...tail] = text.split(' ');
  const name = head.slice(1);
  if (!name) return null;
  if (!known.some((command) => command.name === name)) return null;
  return { command: name, arguments: tail.join(' ').trim() };
}
