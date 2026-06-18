/**
 * Orchestrator-enforcement hook — blocks the orchestrator agent from
 * writing implementation files directly.
 *
 * Uses the SDK `permission.ask` hook to intercept file-write permission
 * requests. When the acting agent is the orchestrator AND the target is
 * an implementation file (src/, lib/, etc.), the request is denied with
 * guidance to delegate to an executor agent instead.
 *
 * Orchestrator writes to `.goopspec/` docs and non-implementation files
 * are always allowed through.
 *
 * ## Orchestrator identity detection
 *
 * The SDK `Permission` input does NOT carry an `agent` field. We derive
 * orchestrator identity from `PluginContext.session.agent` which is set
 * during plugin initialisation / session binding. This is the best
 * available signal at permission.ask time.
 *
 * **Limitation:** If session.agent is not populated (e.g. before session
 * binding), the hook conservatively allows the operation rather than
 * blocking legitimate executor work.
 */

import type { SdkPermission } from "../core/sdk-compat.js";
import type { PluginContext } from "../core/types.js";
import type { HookFactory, Hooks } from "./types.js";
import { isGoopspecFile, isImplementationFile, isOrchestrator, safeHandler } from "./utils.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Permission types that represent file-write operations. */
const WRITE_PERMISSION_TYPES = new Set(["write", "edit", "apply_patch"]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract file paths from a Permission's `pattern` field.
 * The SDK types `pattern` as `string | Array<string> | undefined`.
 */
function extractPatterns(permission: SdkPermission): string[] {
  if (!permission.pattern) return [];
  if (Array.isArray(permission.pattern)) return permission.pattern;
  return [permission.pattern];
}

/**
 * Determine whether a permission request targets an implementation file write.
 */
function isImplementationWrite(permission: SdkPermission): boolean {
  if (!WRITE_PERMISSION_TYPES.has(permission.type)) return false;

  const patterns = extractPatterns(permission);
  // If no patterns, fall back to checking the title for file paths
  if (patterns.length === 0) {
    // Some permission requests encode the path in the title
    return isImplementationFile(permission.title ?? "");
  }

  return patterns.some((p) => isImplementationFile(p));
}

/**
 * Determine whether a permission request targets only GoopSpec doc files.
 */
function isGoopspecWrite(permission: SdkPermission): boolean {
  if (!WRITE_PERMISSION_TYPES.has(permission.type)) return false;

  const patterns = extractPatterns(permission);
  if (patterns.length === 0) return false;

  return patterns.every((p) => isGoopspecFile(p));
}

// ---------------------------------------------------------------------------
// Hook factory
// ---------------------------------------------------------------------------

/**
 * Create the orchestrator-enforcement hook.
 *
 * Returns a `Partial<Hooks>` with a `permission.ask` handler that denies
 * implementation-file writes when the current agent is the orchestrator.
 */
export function createOrchestratorEnforcementHook(ctx: PluginContext): Partial<Hooks> {
  const handler: NonNullable<Hooks["permission.ask"]> = async (input, output) => {
    // If the current agent is not the orchestrator, allow everything
    const currentAgent = ctx.session.agent;
    if (!isOrchestrator(currentAgent)) return;

    // Orchestrator writing to .goopspec/ docs is always allowed
    if (isGoopspecWrite(input)) return;

    // Block orchestrator from writing implementation files
    if (isImplementationWrite(input)) {
      output.status = "deny";
      return;
    }

    // All other permission types (read, list, etc.) pass through
  };

  return {
    "permission.ask": safeHandler("orchestrator-enforcement", handler),
  };
}

/** HookFactory signature for registry integration. */
export const orchestratorEnforcementFactory: HookFactory = createOrchestratorEnforcementHook;
