import type { SdkPermission } from "../../core/sdk-compat.js";
import type { PluginContext } from "../../core/types.js";
import {
  type LoopDetectionConfig,
  loadMergedConfig,
  resolveLoopDetectionConfig,
} from "../../features/setup/index.js";
import { logError } from "../../shared/logger.js";
import type { HookFactory, Hooks } from "../types.js";
import { safeHandler } from "../utils.js";
import { type ClassificationResult, classify, resetSignature } from "./classify.js";
import { buildTier1Message, buildTier2Message } from "./message.js";
import { canonicalArgsHash, outputHash } from "./normalize.js";
import { derivePermissionSignature } from "./permission.js";
import { type LoopTracker, createLoopTracker } from "./tracker.js";

/**
 * Session-wide loop state. This module is shared by the V1 registry and V2's
 * adapter, allowing a later permission.ask handler to use the same evidence.
 */
const loopTracker = createLoopTracker();
const tier1FlaggedSignatures = new Map<string, Set<string>>();

// ---------------------------------------------------------------------------
// Loop-detection config cache — project-level, short TTL to avoid re-reading
// goopspec.json on every single tool.execute.after call.
// ---------------------------------------------------------------------------

interface LoopConfigCacheEntry {
  config: Required<LoopDetectionConfig>;
  timestamp: number;
}

const LOOP_CONFIG_CACHE_TTL_MS = 10_000;
const _loopConfigCache = new Map<string, LoopConfigCacheEntry>();

/** Exported for testing — clears the module-level loop-detection config cache. */
export function __clearLoopConfigCache(): void {
  _loopConfigCache.clear();
}

function signatureKey(tool: string, argsSignature: string): string {
  return `${tool}:${argsSignature}`;
}

function markTier1Signature(sessionID: string, result: ClassificationResult): void {
  if (!result.tool || !result.argsSignature) return;
  let signatures = tier1FlaggedSignatures.get(sessionID);
  if (!signatures) {
    signatures = new Set<string>();
    tier1FlaggedSignatures.set(sessionID, signatures);
  }
  signatures.add(signatureKey(result.tool, result.argsSignature));
}

/**
 * Shared state surface for the V1-only permission layer added in Task 2.2.
 */
export const loopDetectionState: {
  tracker: LoopTracker;
  isTier1Flagged(sessionID: string, tool: string, argsSignature: string): boolean;
  clearTier1Flag(sessionID: string, tool: string, argsSignature: string): void;
} = {
  tracker: loopTracker,
  isTier1Flagged(sessionID, tool, argsSignature): boolean {
    return tier1FlaggedSignatures.get(sessionID)?.has(signatureKey(tool, argsSignature)) ?? false;
  },
  clearTier1Flag(sessionID, tool, argsSignature): void {
    const signatures = tier1FlaggedSignatures.get(sessionID);
    if (!signatures) return;
    signatures.delete(signatureKey(tool, argsSignature));
    if (signatures.size === 0) tier1FlaggedSignatures.delete(sessionID);
  },
};

function logTier1(ctx: PluginContext, result: ClassificationResult): void {
  const workflowId = ctx.stateManager.getActiveWorkflowId();
  const tool = result.tool ?? "unknown";
  const signature = result.argsSignature ?? "unknown";
  const repeats = result.repeatCount ?? 0;
  const entry = `Loop detection intervened for ${tool}: args signature ${signature}, ${repeats} identical calls; mechanism: output-rewrite.`;

  ctx.db.appendChronicleEvent(workflowId, entry);
  ctx.db.appendDocument(workflowId, "chronicle", `### ${new Date().toISOString()}\n\n${entry}`);
  ctx.stateManager.appendADL({
    timestamp: new Date().toISOString(),
    type: "observation",
    description: `Tier 1 loop detected for ${tool} after ${repeats} identical calls (args signature ${signature}).`,
    action: "Rewrote tool output with a Rule 4 stop directive.",
    files: ["src/hooks/loop-detection/index.ts"],
  });
}

/**
 * Track completed calls and redirect agents when exact no-progress loops occur.
 */
export function createLoopDetectionHook(ctx: PluginContext): Partial<Hooks> {
  const after: NonNullable<Hooks["tool.execute.after"]> = safeHandler(
    "loop-detection:after",
    async (input, output): Promise<void> => {
      try {
        const projectDir = ctx.sdk.directory;
        const now = Date.now();
        const cached = _loopConfigCache.get(projectDir);

        let config: Required<LoopDetectionConfig>;
        if (cached && now - cached.timestamp < LOOP_CONFIG_CACHE_TTL_MS) {
          config = cached.config;
        } else {
          config = resolveLoopDetectionConfig(loadMergedConfig(projectDir));
          _loopConfigCache.set(projectDir, { config, timestamp: now });
        }

        if (!config.enabled) return;

        const normalizedArgsHash = canonicalArgsHash(input.tool, input.args);
        const normalizedOutputHash = outputHash(output.output);
        loopTracker.record(
          input.sessionID,
          {
            tool: input.tool,
            normalizedArgsHash,
            outputHash: normalizedOutputHash,
            timestamp: Date.now(),
          },
          config.windowSize,
        );

        const result = classify(loopTracker.getHistory(input.sessionID), config);
        if (result.tier === "tier1") {
          output.output = buildTier1Message(result, output.output);
          markTier1Signature(input.sessionID, result);
          logTier1(ctx, result);
          resetSignature(loopTracker, input.sessionID, result);
        } else if (result.tier === "tier2") {
          output.output = `${output.output}\n\n${buildTier2Message(result)}`;
        }
      } catch (error: unknown) {
        logError("loop-detection: unable to process tool result", error);
      }
    },
  );

  const permissionAsk: NonNullable<Hooks["permission.ask"]> = safeHandler(
    "loop-detection:permission-ask",
    async (input, output): Promise<void> => {
      try {
        const permission = input as SdkPermission;
        const signature = derivePermissionSignature(permission);
        if (!signature || typeof permission.sessionID !== "string") return;

        if (
          !loopDetectionState.isTier1Flagged(
            permission.sessionID,
            signature.tool,
            signature.argsSignature,
          )
        ) {
          return;
        }

        output.status = "deny";
        loopDetectionState.clearTier1Flag(
          permission.sessionID,
          signature.tool,
          signature.argsSignature,
        );
      } catch (error: unknown) {
        logError("loop-detection: unable to evaluate permission request", error);
      }
    },
  );

  return { "tool.execute.after": after, "permission.ask": permissionAsk };
}

/** HookFactory-compatible wrapper. */
export const loopDetectionHookFactory: HookFactory = createLoopDetectionHook;
