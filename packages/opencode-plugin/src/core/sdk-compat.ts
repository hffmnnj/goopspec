/**
 * SDK Compatibility Layer
 *
 * Single import boundary for the @opencode-ai/plugin SDK.
 *
 * WHY THIS EXISTS:
 * GoopSpec supports both stable and beta OpenCode SDK channels. As of v1.1.x,
 * the plugin SDK is byte-identical between stable and beta — there are no
 * divergences to abstract over. This module exists purely as a future-proofing
 * seam: if a future beta introduces breaking changes, we adapt HERE instead of
 * hunting through every file that imports the SDK.
 *
 * RULES:
 * - The rest of the plugin imports SDK types/values from this module.
 * - Direct imports from "@opencode-ai/plugin" or "@opencode-ai/sdk" are
 *   forbidden outside this file.
 * - Keep this thin. Do not invent adapters for divergences that don't exist.
 */

import { readFileSync } from "node:fs";

// ---------------------------------------------------------------------------
// Re-exports from @opencode-ai/plugin (main entry)
// ---------------------------------------------------------------------------

export type {
  Config,
  Hooks,
  Plugin,
  PluginInput,
  PluginModule,
  PluginOptions,
  ProviderContext,
  ProviderHook,
  AuthOAuthResult,
  WorkspaceInfo,
  WorkspaceTarget,
  WorkspaceAdapter,
} from "@opencode-ai/plugin";

// ---------------------------------------------------------------------------
// Re-exports from @opencode-ai/plugin/tool
// ---------------------------------------------------------------------------

export { tool } from "@opencode-ai/plugin/tool";
export type {
  ToolAttachment,
  ToolContext,
  ToolDefinition,
  ToolResult,
} from "@opencode-ai/plugin/tool";

// ---------------------------------------------------------------------------
// Re-exports from @opencode-ai/sdk (types used by the plugin surface)
// ---------------------------------------------------------------------------

export type {
  AgentConfig,
  Config as SdkConfig,
  Event as SdkEvent,
  Message as SdkMessage,
  Model as SdkModel,
  Part as SdkPart,
  Permission as SdkPermission,
  Provider as SdkProvider,
  UserMessage as SdkUserMessage,
} from "@opencode-ai/sdk";

// ---------------------------------------------------------------------------
// Re-export zod via tool.schema for convenience
// ---------------------------------------------------------------------------

// Consumers can use `tool.schema` directly, but we also re-export the z
// namespace for cases where only schema building is needed (no tool factory).
export { z } from "zod";

// ---------------------------------------------------------------------------
// Channel detection
// ---------------------------------------------------------------------------

/** Result of SDK channel detection. */
export interface SdkChannelInfo {
  /** Installed @opencode-ai/plugin version string (e.g. "1.1.47"). */
  version: string;
  /** Detected release channel. */
  channel: "stable" | "beta" | "unknown";
}

/**
 * Detect the installed SDK version and release channel.
 *
 * Reads the version from @opencode-ai/plugin's package.json. Channel detection
 * uses version-string heuristics:
 * - Contains "beta", "alpha", "canary", "rc", "next", or "dev" → beta
 * - Clean semver (digits and dots only) → stable
 * - Anything else → unknown
 *
 * NOTE: As of 2026-06, stable and beta SDKs are byte-identical. This helper
 * exists so we have a detection seam if they diverge in the future.
 *
 * Never throws — returns channel "unknown" on any failure.
 */
export function detectSdkChannel(): SdkChannelInfo {
  try {
    const resolved = import.meta.resolve("@opencode-ai/plugin/package.json");
    const filePath = resolved.startsWith("file://") ? resolved.slice(7) : resolved;
    const raw = readFileSync(filePath, "utf-8");
    const pkg = JSON.parse(raw) as { version?: string };
    const version = pkg.version ?? "0.0.0";

    return {
      version,
      channel: classifyChannel(version),
    };
  } catch {
    return { version: "0.0.0", channel: "unknown" };
  }
}

/**
 * Classify a semver string into a release channel.
 *
 * @internal Exported for testing only.
 */
export function classifyChannel(version: string): SdkChannelInfo["channel"] {
  const lower = version.toLowerCase();
  const preReleaseIndicators = ["beta", "alpha", "canary", "rc", "next", "dev"];

  if (preReleaseIndicators.some((tag) => lower.includes(tag))) {
    return "beta";
  }

  // Clean semver: digits, dots, and optional leading "v"
  if (/^v?\d+\.\d+\.\d+$/.test(version)) {
    return "stable";
  }

  return "unknown";
}
