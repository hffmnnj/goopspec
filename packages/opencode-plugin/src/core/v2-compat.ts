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

import { define as defineV2Plugin } from "@opencode-ai/plugin/v2/promise";

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
// V2 registration surfaces
// ---------------------------------------------------------------------------

export type {
  AgentDraft as V2AgentDraft,
  AgentHooks as V2AgentHooks,
  AISDKHooks as V2AISDKHooks,
  CatalogDraft as V2CatalogDraft,
  CatalogHooks as V2CatalogHooks,
  CatalogProviderRecord as V2CatalogProviderRecord,
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
