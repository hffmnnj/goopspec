/**
 * System Transform Hook
 * Injects memory context into agent system prompts
 * 
 * @module hooks/system-transform
 */

import type { PluginContext } from "../core/types.js";
import { log, logError } from "../shared/logger.js";
import { createMemoryContextBuilder } from "../features/memory/context-builder.js";
import { buildEnforcementContext } from "../features/enforcement/index.js";
import { getSessionGoopspecPath } from "../shared/paths.js";
import { ensurePosixPath } from "../shared/platform.js";

type SystemTransformInput = {
  sessionID: string;
  agent?: string;
  model?: {
    providerID: string;
    modelID: string;
  };
};

type SystemTransformOutput = {
  system: string;
};

function normalizePromptPath(path: string): string {
  return ensurePosixPath(path);
}

function buildSessionContextBlock(sessionId: string): string {
  const specPath = normalizePromptPath(getSessionGoopspecPath("", "SPEC.md", sessionId));
  const blueprintPath = normalizePromptPath(getSessionGoopspecPath("", "BLUEPRINT.md", sessionId));
  const chroniclePath = normalizePromptPath(getSessionGoopspecPath("", "CHRONICLE.md", sessionId));
  const researchPath = normalizePromptPath(getSessionGoopspecPath("", "RESEARCH.md", sessionId));
  const statePath = normalizePromptPath(getSessionGoopspecPath("", "state.json", sessionId));
  const checkpointsPath = normalizePromptPath(getSessionGoopspecPath("", "checkpoints", sessionId));
  const historyPath = normalizePromptPath(getSessionGoopspecPath("", "history", sessionId));

  return [
    "<session>",
    `id: ${sessionId}`,
    "paths:",
    `  spec: ${specPath}`,
    `  blueprint: ${blueprintPath}`,
    `  chronicle: ${chroniclePath}`,
    `  research: ${researchPath}`,
    `  state: ${statePath}`,
    `  checkpoints: ${checkpointsPath}`,
    `  history: ${historyPath}`,
    "</session>",
  ].join("\n");
}

/**
 * Create the experimental.chat.system.transform hook
 * 
 * This hook injects relevant memory context into the system prompt
 * before each chat completion request.
 */
export function createSystemTransformHook(ctx: PluginContext) {
  return async (
    input: SystemTransformInput,
    output: SystemTransformOutput
  ): Promise<SystemTransformOutput> => {
    log("System transform hook triggered", {
      agent: input.agent,
      sessionID: input.sessionID,
    });

    try {
      const state = ctx.stateManager.getState();
      const enforcementContext = buildEnforcementContext(state);
      const sessionContext =
        typeof ctx.sessionId === "string" && ctx.sessionId.trim().length > 0
          ? buildSessionContextBlock(ctx.sessionId.trim())
          : "";

      let memoryContext = "";
      if (ctx.memoryManager && ctx.config.memory?.injection?.enabled !== false) {
        // Create context builder with config
        const builder = createMemoryContextBuilder(ctx.memoryManager, {
          budgetTokens: ctx.config.memory?.injection?.budgetTokens ?? 800,
          format: (ctx.config.memory?.injection?.format ?? "structured") as "timeline" | "bullets" | "structured",
          priorityTypes: ctx.config.memory?.injection?.priorityTypes ?? ["decision", "observation", "todo"],
          includeDecisions: true,
          includeRecentActivity: true,
        });

        const currentPhase = state.workflow.phase;
        if (currentPhase) {
          memoryContext = await builder.buildPhaseContext(currentPhase);
        } else {
          memoryContext = await builder.buildRecentContext(10);
        }
      }

      if (
        !enforcementContext
        && (!memoryContext || memoryContext.trim().length === 0)
        && sessionContext.trim().length === 0
      ) {
        log("No enforcement or memory context to inject");
        return output;
      }

      let enhancedSystem = output.system;
      if (enforcementContext.trim().length > 0) {
        enhancedSystem = `${enhancedSystem}

${enforcementContext}`;
      }

      if (sessionContext.trim().length > 0) {
        enhancedSystem = `${enhancedSystem}

## Session Context

${sessionContext}`;
      }

      if (memoryContext.trim().length > 0) {
        enhancedSystem = `${enhancedSystem}

## Persistent Memory Context

Use these memories for continuity and to avoid repeated mistakes.

${memoryContext}

Use memory tools to save decisions and observations for future sessions.`;
      }

      log("System context injected", {
        originalLength: output.system.length,
        enforcementLength: enforcementContext.length,
        sessionLength: sessionContext.length,
        memoryLength: memoryContext.length,
        enhancedLength: enhancedSystem.length,
      });

      return {
        system: enhancedSystem,
      };
    } catch (error) {
      logError("Failed to inject system context", error);
      // Return original on error - don't break the system
      return output;
    }
  };
}
