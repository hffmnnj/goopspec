/**
 * System-transform hook — injects workflow state, phase enforcement rules,
 * and relevant memories into every LLM call via the
 * `experimental.chat.system.transform` hook event.
 *
 * Implements the balanced prompt strategy (MH7): meaningful context without
 * bloat. Memory injection is token-budgeted (default ~800 tokens, configurable).
 *
 * @module hooks/system-transform
 */

import type { SdkModel } from "../core/sdk-compat.js";
import type { MemorySearchResult, PluginContext, WorkflowState } from "../core/types.js";
import { buildEnforcementContext } from "../features/enforcement/phase-context.js";
import { log } from "../shared/logger.js";
import type { HookFactory, Hooks } from "./types.js";
import { safeHandler } from "./utils.js";

// ---------------------------------------------------------------------------
// Token estimation
// ---------------------------------------------------------------------------

/** Default token budget for memory injection (~800 tokens ≈ 3200 chars). */
const DEFAULT_MEMORY_TOKEN_BUDGET = 800;

/**
 * Rough token estimator: ~4 characters per token.
 * Good enough for budget enforcement without pulling in a tokenizer.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// ---------------------------------------------------------------------------
// Block builders
// ---------------------------------------------------------------------------

/**
 * Build a compact state summary block for system prompt injection.
 *
 * Includes: phase, workflow ID, key flags (interview, spec-lock, acceptance,
 * wave progress, autopilot, checkpoint).
 */
export function buildStateBlock(workflow: WorkflowState, workflowId: string): string {
  const lines: string[] = [
    "<goopspec_state>",
    `workflow: ${workflowId}`,
    `phase: ${workflow.phase}`,
    `mode: ${workflow.mode}`,
    `spec_locked: ${workflow.specLocked}`,
    `interview_complete: ${workflow.interviewComplete}`,
    `acceptance_confirmed: ${workflow.acceptanceConfirmed}`,
  ];

  if (workflow.totalWaves > 0) {
    lines.push(`wave_progress: ${workflow.currentWave}/${workflow.totalWaves}`);
  }

  if (workflow.autopilot) {
    lines.push(`autopilot: true${workflow.lazyAutopilot ? " (lazy)" : ""}`);
  }

  if (workflow.checkpoint) {
    lines.push(`checkpoint: ${workflow.checkpoint}`);
  }

  lines.push("</goopspec_state>");
  return lines.join("\n");
}

/**
 * Build phase enforcement rules block.
 *
 * Delegates to the enforcement subsystem's `buildEnforcementContext` which
 * produces MUST DO / MUST NOT DO rules for the current phase.
 */
export function buildPhaseRulesBlock(workflow: WorkflowState, workflowId: string): string {
  return buildEnforcementContext(workflow, workflowId);
}

/**
 * Build a token-budgeted memory context block from search results.
 *
 * Iterates through memories in relevance order, appending each until the
 * token budget is exhausted. Memories that would exceed the budget are
 * skipped (not truncated mid-entry) to keep each entry coherent.
 */
export function buildMemoryBlock(memories: MemorySearchResult[], tokenBudget: number): string {
  if (memories.length === 0) return "";

  const lines: string[] = ["<goopspec_memory>"];
  let tokensUsed = estimateTokens(lines[0]);

  for (const { memory } of memories) {
    const entry = `- [${memory.type}] ${memory.title}: ${memory.content}`;
    const entryTokens = estimateTokens(entry);

    if (tokensUsed + entryTokens > tokenBudget) {
      break;
    }

    lines.push(entry);
    tokensUsed += entryTokens;
  }

  // Only the opening tag — no memories fit within budget
  if (lines.length === 1) return "";

  lines.push("</goopspec_memory>");
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// DB context block
// ---------------------------------------------------------------------------

/**
 * Build a `<goopspec_db>` context block listing available DB tools and
 * the document inventory for the active workflow.
 *
 * Returns an empty string when the DB is unavailable or throws — the
 * system-transform hook must never crash due to DB issues.
 */
export function buildDbContextBlock(ctx: PluginContext, workflowId: string): string {
  let docInventory = "(DB not available)";
  try {
    const existingTypes = ctx.db.listDocTypes(workflowId);
    if (existingTypes.length > 0) {
      docInventory = existingTypes.map((t) => `- ${t}`).join("\n");
    } else {
      docInventory = "(no documents yet — use goop_write_db to create them)";
    }
  } catch (error) {
    log("buildDbContextBlock: DB unavailable, skipping", { error });
    return "";
  }

  return [
    "<goopspec_db>",
    "## DB Tools Available",
    "- goop_read_db(doc_type, workflow_id?) — read a workflow document (spec, blueprint, chronicle, adl, handoff, requirements, research)",
    "- goop_write_db(doc_type, content, workflow_id?) — write/update a workflow document; renders markdown sidecar automatically",
    "- goop_save_note(title, body, tags, source_agent, importance, workflow_id?, project_id?) — save a Field Note (persists across projects)",
    "- goop_search_notes(query, tags?, project_id?, workflow_id?, limit?) — search Field Notes with FTS + tag matching",
    "",
    `## Workflow Documents (${workflowId})`,
    docInventory,
    "</goopspec_db>",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Hook factory
// ---------------------------------------------------------------------------

/**
 * Create the system-transform hook factory.
 *
 * Assembles a context block from workflow state, phase rules, and relevant
 * memories, then pushes it onto `output.system` (each entry becomes a
 * system message in the LLM call).
 *
 * Wrapped with `safeHandler` — on any error, nothing is injected and the
 * LLM call proceeds unmodified.
 */
export function createSystemTransformHook(ctx: PluginContext): Partial<Hooks> {
  const handler = safeHandler(
    "system-transform",
    async (
      _input: { sessionID?: string; model: SdkModel },
      output: { system: string[] },
    ): Promise<void> => {
      const state = ctx.stateManager.getState();
      const workflowId = state.activeWorkflowId;
      const workflow = state.workflows[workflowId];

      if (!workflow) return;

      // 1. State block — always injected
      const stateBlock = buildStateBlock(workflow, workflowId);

      // 2. Phase rules — always injected
      const phaseRulesBlock = buildPhaseRulesBlock(workflow, workflowId);

      // 3. DB context block — lists available DB tools and doc inventory
      let dbBlock = "";
      try {
        dbBlock = buildDbContextBlock(ctx, workflowId);
      } catch (error) {
        log("system-transform: DB context block failed, skipping", { error });
      }

      // 4. Memory block — token-budgeted
      let memoryBlock = "";
      const tokenBudget = DEFAULT_MEMORY_TOKEN_BUDGET;

      const searchResults = await ctx.memory.search({
        query: `${workflow.phase} workflow`,
        limit: 10,
      });

      if (searchResults.length > 0) {
        memoryBlock = buildMemoryBlock(searchResults, tokenBudget);
      }

      // Assemble the full context block
      const parts = [stateBlock, phaseRulesBlock];
      if (dbBlock) {
        parts.push(dbBlock);
      }
      if (memoryBlock) {
        parts.push(memoryBlock);
      }

      const contextBlock = parts.join("\n\n");

      // Push onto output.system — each entry becomes a system message
      output.system.push(contextBlock);
    },
  );

  return {
    "experimental.chat.system.transform": handler,
  };
}

/** Satisfies the HookFactory signature for registry integration. */
export const systemTransformFactory: HookFactory = createSystemTransformHook;
