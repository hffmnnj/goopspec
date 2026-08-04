/**
 * Unified Memory Save Tool
 *
 * Saves structured information to persistent memory. Absorbs the old
 * `memory_note` and `memory_decision` tools via the `type` parameter:
 *
 * - type="observation" (default) — general observations
 * - type="decision" — folds `reasoning` and `alternatives` into content/facts
 * - type="note" — quick capture (lower default importance)
 * - type="todo" — action items
 *
 * @module tools/memory-save
 */

import { MEMORY_TYPES } from "../../core/constants.js";
import { tool } from "../../core/sdk-compat.js";
import type { ToolContext, ToolDefinition } from "../../core/sdk-compat.js";
import type { MemoryType, PluginContext } from "../../core/types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Normalise importance to the 1–10 integer range.
 * Values in (0, 1) are scaled ×10 for backward compat with 0.2.x callers.
 */
function normalizeImportance(raw: number | undefined, memoryType: MemoryType): number {
  if (raw === undefined) {
    // Sensible defaults per type
    return memoryType === "decision" ? 7 : memoryType === "note" ? 4 : 5;
  }
  if (raw > 0 && raw < 1) {
    return Math.round(raw * 10);
  }
  return raw;
}

/**
 * When type=decision, fold reasoning/alternatives into the stored content
 * so a single tool covers what `memory_decision` used to do.
 */
function buildDecisionContent(
  baseContent: string,
  reasoning: string | undefined,
  alternatives: string[] | undefined,
): string {
  const sections: string[] = [baseContent];

  if (reasoning) {
    sections.push("", "## Reasoning", reasoning);
  }
  if (alternatives?.length) {
    sections.push("", "## Alternatives Considered", ...alternatives.map((a) => `- ${a}`));
  }

  return sections.join("\n");
}

/**
 * For decisions, auto-generate facts from the reasoning/alternatives if the
 * caller didn't supply explicit facts.
 */
function buildDecisionFacts(
  existingFacts: string[] | undefined,
  title: string,
  alternatives: string[] | undefined,
): string[] {
  if (existingFacts?.length) return existingFacts;

  const facts: string[] = [title];
  if (alternatives?.length) {
    facts.push(`Alternatives considered: ${alternatives.join(", ")}`);
  }
  return facts;
}

// ---------------------------------------------------------------------------
// Tool factory
// ---------------------------------------------------------------------------

// Filter out session_summary — it's system-only, not user-facing.
const USER_MEMORY_TYPES = MEMORY_TYPES.filter(
  (t): t is Exclude<MemoryType, "session_summary"> => t !== "session_summary",
);

export function createMemorySaveTool(ctx: PluginContext): ToolDefinition {
  return tool({
    description:
      "Persist a structured memory record. " +
      "WHEN TO USE: Capture an observation, decision, note, or todo. " +
      "WHEN NOT TO USE: goop_save_note for curated project knowledge with tags and agent attribution. " +
      "RETURNS: A confirmation with id, type, title, importance; a failed write degrades to id -1 " +
      "rather than throwing. " +
      "CAVEATS: importance defaults by type (decision 7, note 4, else 5), must be 1-10 " +
      "(0-1 scales x10). type=decision folds reasoning/alternatives into content and " +
      "auto-generates facts from the title if omitted; both ignored otherwise. " +
      "deduplicate:true reinforces a near-duplicate (importance=max(old,new), created_at " +
      "refreshed, content unchanged) instead of inserting; absent/false inserts.",
    args: {
      title: tool.schema
        .string()
        .describe("Memory title; max 100 characters. Required."),
      content: tool.schema.string().describe(
        "Memory body text. Required. Stored verbatim for non-decision types; for type=decision " +
          "the reasoning and alternatives are appended into the stored content.",
      ),
      type: tool.schema.enum(USER_MEMORY_TYPES).optional().describe(
        "Record type. Defaults to observation. decision folds reasoning/alternatives into " +
          "content and auto-generates facts; note lowers the default importance; todo tracks " +
          "an action item.",
      ),
      concepts: tool.schema
        .array(tool.schema.string())
        .optional()
        .describe(
          "Tags for categorization and retrieval; stored verbatim and full-text-indexed.",
        ),
      facts: tool.schema.array(tool.schema.string()).optional().describe(
        "Atomic facts extracted from this memory; stored verbatim and full-text-indexed. For " +
          "type=decision, auto-generated from the title when omitted.",
      ),
      importance: tool.schema.number().optional().describe(
        "Priority 1-10. Defaults vary by type: decision 7, note 4, observation/todo 5. Values " +
          "in (0, 1) are scaled x10 for backward compatibility.",
      ),
      sourceFiles: tool.schema
        .array(tool.schema.string())
        .optional()
        .describe("Related file paths; stored verbatim."),
      reasoning: tool.schema.string().optional().describe(
        "Why a decision was made. Only applied for type=decision (folded into content); " +
          "ignored for other types. Omit for non-decision memories.",
      ),
      alternatives: tool.schema.array(tool.schema.string()).optional().describe(
        "Alternatives considered. Only applied for type=decision (folded into content); " +
          "ignored for other types. Omit for non-decision memories.",
      ),
      deduplicate: tool.schema.boolean().optional().describe(
        "When true, reinforce a near-duplicate existing record instead of inserting a new row " +
          "(importance becomes max of old and new, created_at refreshed, content unchanged). " +
          "When absent or false, always insert. No-op when FTS5 is unavailable.",
      ),
    },
    async execute(
      args: {
        title: string;
        content: string;
        type?: (typeof USER_MEMORY_TYPES)[number];
        concepts?: string[];
        facts?: string[];
        importance?: number;
        sourceFiles?: string[];
        reasoning?: string;
        alternatives?: string[];
        deduplicate?: boolean;
      },
      _context: ToolContext,
    ): Promise<string> {
      try {
        const memoryType: MemoryType = args.type ?? "observation";

        // Validate title length
        if (args.title.length > 100) {
          return "Error: Title must be 100 characters or less.";
        }

        // Normalise importance
        const importance = normalizeImportance(args.importance, memoryType);
        if (importance < 1 || importance > 10) {
          return "Error: Importance must be between 1 and 10.";
        }

        // Build content — decisions get reasoning/alternatives folded in
        const content =
          memoryType === "decision"
            ? buildDecisionContent(args.content, args.reasoning, args.alternatives)
            : args.content;

        // Build facts — decisions auto-generate if none supplied
        const facts =
          memoryType === "decision"
            ? buildDecisionFacts(args.facts, args.title, args.alternatives)
            : args.facts;

        const entry = await ctx.memory.save({
          type: memoryType,
          title: args.title,
          content,
          facts,
          concepts: args.concepts,
          sourceFiles: args.sourceFiles,
          importance,
          reasoning: memoryType === "decision" ? args.reasoning : undefined,
          alternatives: memoryType === "decision" ? args.alternatives : undefined,
          deduplicate: args.deduplicate,
        });

        // Format confirmation
        const lines: string[] = [
          "Memory saved successfully!",
          "",
          `**ID:** ${entry.id}`,
          `**Type:** ${entry.type}`,
          `**Title:** ${entry.title}`,
          `**Importance:** ${entry.importance}/10`,
        ];

        if (entry.facts?.length) {
          lines.push(`**Facts:** ${entry.facts.length} recorded`);
        }
        if (entry.concepts?.length) {
          lines.push(`**Concepts:** ${entry.concepts.join(", ")}`);
        }
        if (memoryType === "decision" && args.reasoning) {
          lines.push("**Reasoning:** included");
        }
        if (memoryType === "decision" && args.alternatives?.length) {
          lines.push(`**Alternatives:** ${args.alternatives.length} considered`);
        }

        return lines.join("\n");
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return `Error saving memory: ${message}`;
      }
    },
  });
}
