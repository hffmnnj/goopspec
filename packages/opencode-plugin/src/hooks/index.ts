/**
 * Hook registry — merges individual HookFactory outputs into a single
 * SDK-compatible Hooks object with same-event handler chaining.
 *
 * Tasks 5.2–5.9 each export a HookFactory. This module collects them,
 * merges their Partial<Hooks> results, and chains handlers that target
 * the same event so all fire sequentially.
 */

import type { PluginContext } from "../core/types.js";
import { agentRegistrationFactory } from "./agent-registration.js";
import { createAutoProgressionHook } from "./auto-progression.js";
import { chatMessageFactory } from "./chat-message.js";
import { createCommandProcessorHook } from "./command-processor.js";
import { commentCheckerFactory } from "./comment-checker.js";
import { referenceInjectionFactory } from "./reference-injection.js";
import { createCompactionHook } from "./compaction-hook.js";
import { createEventHandlerHook } from "./event-handler.js";
import { orchestratorEnforcementFactory } from "./orchestrator-enforcement.js";
import { systemTransformFactory } from "./system-transform.js";
import { toolLifecycleHookFactory } from "./tool-lifecycle.js";
import type { HookEventName, HookFactory, Hooks } from "./types.js";
import { chainHandlers } from "./utils.js";

// ---------------------------------------------------------------------------
// Handler event names — used to distinguish chainable handlers from
// registration properties (tool, auth) during merge
// ---------------------------------------------------------------------------

const HANDLER_EVENT_NAMES: readonly HookEventName[] = [
  "config",
  "event",
  "chat.message",
  "chat.params",
  "chat.headers",
  "permission.ask",
  "command.execute.before",
  "tool.execute.before",
  "shell.env",
  "tool.definition",
  "tool.execute.after",
  "experimental.chat.messages.transform",
  "experimental.chat.system.transform",
  "experimental.compaction.autocontinue",
  "experimental.provider.small_model",
  "experimental.session.compacting",
  "experimental.text.complete",
] as const;

// ---------------------------------------------------------------------------
// Factory registry — tasks 5.2–5.9 append their factories here
// ---------------------------------------------------------------------------

const hookFactories: HookFactory[] = [];

/**
 * The full set of hooks shipped with GoopSpec, assembled explicitly.
 *
 * The plugin entry point passes this to `createHooks` so the wiring is
 * declarative and testable. `createHooks(ctx, [])` deliberately stays empty —
 * callers opt in to the default hooks by passing this array.
 *
 * Some hook modules export only a `create*Hook` function (creator and factory
 * are the same); they are referenced directly here.
 */
export const DEFAULT_HOOK_FACTORIES: readonly HookFactory[] = [
  agentRegistrationFactory,
  systemTransformFactory,
  chatMessageFactory,
  referenceInjectionFactory,
  commentCheckerFactory,
  createCommandProcessorHook,
  orchestratorEnforcementFactory,
  toolLifecycleHookFactory,
  createAutoProgressionHook,
  createEventHandlerHook,
  createCompactionHook,
];

/**
 * Register a hook factory. Called by individual hook modules
 * to add themselves to the registry.
 */
export function registerHookFactory(factory: HookFactory): void {
  hookFactories.push(factory);
}

// ---------------------------------------------------------------------------
// Merge logic
// ---------------------------------------------------------------------------

/** Any async handler matching the SDK hook signature pattern. */
type AnyHandler = (...args: never[]) => Promise<void>;

/**
 * Merge multiple Partial<Hooks> objects into a single Hooks object.
 *
 * Handler events: if multiple partials define the same event, their handlers
 * are chained via `chainHandlers` — each runs sequentially, mutations accumulate.
 *
 * Registration properties:
 * - `tool` maps are shallow-merged (later entries override earlier for same key)
 * - `auth` uses the last defined value
 */
export function mergeHooks(partials: Partial<Hooks>[]): Hooks {
  const merged: Hooks = {};

  // Collect handlers per event name
  const handlerMap = new Map<string, AnyHandler[]>();

  // Collect tool registrations
  let toolMap: Record<string, unknown> = {};

  for (const partial of partials) {
    for (const eventName of HANDLER_EVENT_NAMES) {
      const handler = partial[eventName] as AnyHandler | undefined;
      if (handler) {
        let handlers = handlerMap.get(eventName);
        if (!handlers) {
          handlers = [];
          handlerMap.set(eventName, handlers);
        }
        handlers.push(handler);
      }
    }

    if (partial.tool) {
      toolMap = { ...toolMap, ...partial.tool };
    }

    if (partial.auth) {
      merged.auth = partial.auth;
    }
  }

  // Chain handlers for each event
  for (const [eventName, handlers] of handlerMap) {
    if (handlers.length > 0) {
      (merged as Record<string, unknown>)[eventName] = chainHandlers(eventName, handlers);
    }
  }

  if (Object.keys(toolMap).length > 0) {
    merged.tool = toolMap as Hooks["tool"];
  }

  return merged;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Create the merged Hooks object from all registered factories.
 *
 * Called once during plugin initialisation. Collects all HookFactory
 * outputs and merges them into a single SDK-compatible Hooks object.
 */
export function createHooks(ctx: PluginContext, extraFactories: HookFactory[] = []): Hooks {
  const allFactories = [...hookFactories, ...extraFactories];
  const partials = allFactories.map((factory) => factory(ctx));
  return mergeHooks(partials);
}

export type { HookFactory, HookEventName, Hooks };
