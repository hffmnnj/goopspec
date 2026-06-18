/**
 * Hook type definitions for GoopSpec 1.0.0.
 *
 * Imports the real SDK `Hooks` type so that any signature drift between
 * GoopSpec's hook implementations and the SDK becomes a compile error.
 */

import type { Hooks } from "../core/sdk-compat.js";
import type { PluginContext } from "../core/types.js";

export type { Hooks };

// ---------------------------------------------------------------------------
// Hook event names — explicit literal union of all handler-type events
// ---------------------------------------------------------------------------

/**
 * All hookable event names from the SDK Hooks interface.
 * These are the `(input, output) => Promise<void>` handler methods.
 *
 * Maintained as an explicit union rather than a conditional mapped type
 * so that TypeScript can use it as an index constraint in generics.
 */
export type HookEventName =
  | "config"
  | "event"
  | "chat.message"
  | "chat.params"
  | "chat.headers"
  | "permission.ask"
  | "command.execute.before"
  | "tool.execute.before"
  | "shell.env"
  | "tool.definition"
  | "tool.execute.after"
  | "experimental.chat.messages.transform"
  | "experimental.chat.system.transform"
  | "experimental.compaction.autocontinue"
  | "experimental.provider.small_model"
  | "experimental.session.compacting"
  | "experimental.text.complete";

/**
 * A hook factory receives the shared PluginContext and returns a partial
 * Hooks object. The registry merges all factories, chaining handlers that
 * target the same event.
 */
export type HookFactory = (ctx: PluginContext) => Partial<Hooks>;

/**
 * Extract the handler function type for a specific hook event.
 */
export type HookHandler<K extends HookEventName> = NonNullable<Hooks[K]>;
