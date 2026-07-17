/**
 * V2 SDK Compatibility Layer
 *
 * Single import boundary for the @opencode-ai/plugin/v2/promise SDK surface.
 *
 * WHY THIS EXISTS:
 * The V2 plugin API is beta and can change independently of the legacy plugin
 * API. This module contains that volatility so a future SDK update has one
 * localized adaptation point rather than imports spread throughout the plugin.
 *
 * RULES:
 * - The rest of the plugin imports V2 SDK types and values from this module.
 * - Direct imports from "@opencode-ai/plugin/v2/promise" are forbidden
 *   outside this file.
 * - Keep this thin. Do not add adapters beyond normalizing the V2 Plugin
 *   namespace shape and avoiding collisions with GoopSpec's PluginContext.
 */

import {
  type PluginContext as V2PluginContext,
  define as defineV2Plugin,
} from "@opencode-ai/plugin/v2/promise";

// ---------------------------------------------------------------------------
// V2 plugin definition
// ---------------------------------------------------------------------------

/**
 * Stable namespace-style facade for V2 plugin definitions.
 *
 * The current promise SDK exports `define` as a standalone function. Exposing
 * it here as `V2Plugin.define` keeps consumers collision-free with the V1
 * `Plugin` type and localizes any future export-shape change.
 */
export const V2Plugin = {
  define: defineV2Plugin,
};

export type {
  Plugin as V2PluginDefinition,
  PluginContext as V2PluginContext,
  PluginDomain as V2PluginDomain,
  PluginOptions as V2PluginOptions,
  Registration as V2Registration,
  Reload as V2Reload,
} from "@opencode-ai/plugin/v2/promise";

// ---------------------------------------------------------------------------
// Documented runtime capabilities absent from published declarations
// ---------------------------------------------------------------------------

/** JSON-compatible schema accepted by V2 tool declarations. */
export type V2JsonSchema = Record<string, unknown>;

/** Context supplied when OpenCode executes a V2 tool. */
export interface V2ToolExecutionContext {
  readonly sessionID: string;
  readonly agent?: string;
  readonly assistantMessageID?: string;
  readonly toolCallID?: string;
}

/** A V2 tool declaration added through `ctx.tool.transform`. */
export interface V2ToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly jsonSchema: V2JsonSchema;
  readonly options?: {
    readonly group?: string;
    readonly codemode?: boolean;
  };
  readonly execute: (
    input: Record<string, unknown>,
    context: V2ToolExecutionContext,
  ) => Promise<V2ToolExecutionResult>;
}

/** The structured and display payload returned by a V2 tool executor. */
export interface V2ToolExecutionResult {
  readonly structured?: unknown;
  readonly content: readonly {
    readonly type: "text";
    readonly text: string;
  }[];
}

/** Mutable draft exposed by `ctx.tool.transform`. */
export interface V2ToolDraft {
  add(definition: V2ToolDefinition): void;
}

/** Event received immediately before a selected tool executes. */
export interface V2ToolExecuteBeforeEvent {
  readonly tool: string;
  input: unknown;
}

/** Event received after a selected tool execution settles. */
export interface V2ToolExecuteAfterEvent {
  readonly tool: string;
  result: unknown;
  output: unknown;
  outputPaths: string[];
}

/** Documented V2 tool transform and runtime-hook capability. */
export interface V2ToolCapability {
  transform(callback: (tools: V2ToolDraft) => void | Promise<void>): Promise<void>;
  hook(
    event: "execute.before",
    callback: (event: V2ToolExecuteBeforeEvent) => void | Promise<void>,
  ): Promise<void>;
  hook(
    event: "execute.after",
    callback: (event: V2ToolExecuteAfterEvent) => void | Promise<void>,
  ): Promise<void>;
}

/** Mutable model-request event received by the documented session hook. */
export interface V2SessionRequestEvent {
  system: unknown;
  messages: unknown[];
  tools: Record<string, unknown>;
}

/** Documented V2 session capability. Request/response shapes remain host-owned. */
export interface V2SessionCapability {
  create(input: unknown): Promise<unknown>;
  get(input: unknown): Promise<unknown>;
  prompt(input: unknown): Promise<unknown>;
  command(input: unknown): Promise<unknown>;
  synthetic(input: unknown): Promise<unknown>;
  interrupt(input: unknown): Promise<unknown>;
  hook(
    event: "request",
    callback: (event: V2SessionRequestEvent) => void | Promise<void>,
  ): Promise<void>;
}

/** Public server event with an intentionally host-owned payload shape. */
export interface V2ServerEvent {
  readonly type: string;
  readonly properties: unknown;
}

/** Documented V2 public server-event subscription capability. */
export interface V2EventCapability {
  subscribe(): Promise<AsyncIterable<V2ServerEvent>>;
}

/** Model reference assigned to a V2 agent draft. */
export interface V2AgentModelRef {
  readonly providerID: string;
  readonly id: string;
  variant?: string;
}

/** Mutable provider request carried by a V2 agent draft. */
export interface V2AgentRequest {
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

/** Minimal mutable shape required to update a GoopSpec agent. */
export interface V2AgentInfo {
  readonly id: string;
  model?: V2AgentModelRef;
  request: V2AgentRequest;
}

/** Mutable agent collection exposed by the documented V2 transform hook. */
export interface V2AgentDraft {
  list(): readonly V2AgentInfo[];
  update(id: string, update: (agent: V2AgentInfo) => void): void;
}

/** Documented V2 agent transform and reload capability. */
export interface V2AgentCapability {
  transform(callback: (agents: V2AgentDraft) => void | Promise<void>): Promise<unknown>;
  reload(): Promise<void>;
}

/** Minimal catalog model shape needed by the shared thinking resolver. */
export interface V2CatalogModel {
  readonly variants?: unknown;
}

/** Provider record exposed while transforming the V2 catalog. */
export interface V2CatalogProviderRecord {
  readonly provider: { readonly id: string };
  readonly models: ReadonlyMap<string, V2CatalogModel>;
}

/** Catalog draft used to snapshot live model capabilities for agent transforms. */
export interface V2CatalogDraft {
  readonly provider: {
    list(): readonly V2CatalogProviderRecord[];
  };
}

/** Documented V2 catalog transform and reload capability. */
export interface V2CatalogCapability {
  transform(callback: (catalog: V2CatalogDraft) => void | Promise<void>): Promise<unknown>;
  reload(): Promise<void>;
}

/**
 * Runtime V2 context as documented by OpenCode.
 *
 * The published promise declarations currently omit these host-provided
 * capabilities. Assert to this type only at setup boundaries and guard the
 * capability before invoking it so an older host degrades without throwing.
 */
export type V2RuntimeContext = V2PluginContext & {
  readonly session?: V2SessionCapability;
  readonly tool?: V2ToolCapability;
  readonly event?: V2EventCapability;
  readonly agent?: V2AgentCapability;
  readonly catalog?: V2CatalogCapability;
};

// ---------------------------------------------------------------------------
// V2 registration surfaces
// ---------------------------------------------------------------------------

export type {
  AgentHooks as V2AgentHooks,
  AISDKHooks as V2AISDKHooks,
  CatalogHooks as V2CatalogHooks,
  CommandDraft as V2CommandDraft,
  CommandHooks as V2CommandHooks,
  IntegrationDraft as V2IntegrationDraft,
  IntegrationHooks as V2IntegrationHooks,
  IntegrationMethodRegistration as V2IntegrationMethodRegistration,
  ReferenceDraft as V2ReferenceDraft,
  ReferenceHooks as V2ReferenceHooks,
  SkillDraft as V2SkillDraft,
  SkillHooks as V2SkillHooks,
} from "@opencode-ai/plugin/v2/promise";
