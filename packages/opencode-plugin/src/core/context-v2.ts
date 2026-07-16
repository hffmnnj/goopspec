/**
 * V2 PluginContext adapter.
 *
 * V2 omits V1's client, directory, worktree, and shell runner. This module
 * supplies safe fallbacks while reusing the common subsystem builder.
 */

import { createPluginSubsystems } from "./context.js";
import type { PluginContext, SdkEssentials } from "./types.js";
import type { V2RuntimeContext } from "./v2-compat.js";

/**
 * Build GoopSpec's internal context from an OpenCode V2 runtime context.
 *
 * The V2 host has no equivalent for V1's client or shell runner. They are
 * intentionally unavailable stubs rather than speculative implementations.
 */
export async function createPluginContextV2(v2ctx: V2RuntimeContext): Promise<PluginContext> {
  const directory = extractDirectory(v2ctx);
  const sdk: SdkEssentials = {
    client: {} as SdkEssentials["client"],
    directory,
    worktree: directory,
    $: createUnavailableShell(),
  };

  return { sdk, ...(await createPluginSubsystems(directory)) };
}

function createUnavailableShell(): SdkEssentials["$"] {
  // V1's Bun shell is callable and carries helper methods; V2 has no safe
  // equivalent, so the intentionally failing callable crosses this type seam.
  return (async () => {
    throw new Error("The V2 plugin context does not expose the V1 shell runner");
  }) as unknown as SdkEssentials["$"];
}

function extractDirectory(v2ctx: V2RuntimeContext): string {
  if (
    typeof v2ctx.options === "object" &&
    v2ctx.options != null &&
    "directory" in v2ctx.options &&
    typeof (v2ctx.options as { directory?: unknown }).directory === "string"
  ) {
    return (v2ctx.options as { directory: string }).directory;
  }
  return process.cwd();
}
