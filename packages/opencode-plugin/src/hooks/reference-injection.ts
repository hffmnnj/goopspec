/**
 * Reference Injection Hook — detects keyword signals in user messages and
 * injects relevant reference summaries into the system prompt.
 *
 * Two-phase design:
 * 1. `chat.message` — scans user text for keywords, stores matched reference
 *    names in the transient signal store.
 * 2. `experimental.chat.system.transform` — reads signals, loads reference
 *    content, truncates to ~200 tokens each, and appends a
 *    `<goopspec_references>` block to `output.system`.
 *
 * @module hooks/reference-injection
 */

import type { SdkModel } from "../core/sdk-compat.js";
import type { PluginContext } from "../core/types.js";
import {
  clearSignals,
  detectReferences,
  getSignals,
  setSignals,
} from "../features/reference-signals/index.js";
import {
  type ChatMessageInput,
  type ChatMessageOutput,
  extractTextFromParts,
} from "./chat-message.js";
import { estimateTokens } from "./system-transform.js";
import type { HookFactory, Hooks } from "./types.js";
import { safeHandler } from "./utils.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Max tokens of content per reference (~200 tokens ≈ 800 chars). */
const MAX_TOKENS_PER_REFERENCE = 200;

/** Max characters per reference (derived from token estimate). */
const MAX_CHARS_PER_REFERENCE = MAX_TOKENS_PER_REFERENCE * 4;

// ---------------------------------------------------------------------------
// Content truncation
// ---------------------------------------------------------------------------

/**
 * Truncate reference content to fit within the token budget.
 *
 * Takes the first `MAX_CHARS_PER_REFERENCE` characters, then finds the last
 * newline to avoid cutting mid-sentence. If no newline is found within the
 * truncated range, falls back to the full truncated string.
 */
function truncateContent(content: string): string {
  if (estimateTokens(content) <= MAX_TOKENS_PER_REFERENCE) {
    return content;
  }

  const truncated = content.slice(0, MAX_CHARS_PER_REFERENCE);
  const lastNewline = truncated.lastIndexOf("\n");

  if (lastNewline > 0) {
    return truncated.slice(0, lastNewline);
  }

  return truncated;
}

// ---------------------------------------------------------------------------
// Reference block builder
// ---------------------------------------------------------------------------

/**
 * Build the `<goopspec_references>` block from loaded reference entries.
 */
function buildReferencesBlock(entries: Array<{ name: string; content: string }>): string {
  if (entries.length === 0) return "";

  const lines: string[] = ["<goopspec_references>"];

  for (const entry of entries) {
    lines.push(`## Reference: ${entry.name}`);
    lines.push(truncateContent(entry.content));
    lines.push("");
  }

  lines.push("</goopspec_references>");
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Hook factory
// ---------------------------------------------------------------------------

/**
 * Create the reference-injection hook.
 *
 * Returns a `Partial<Hooks>` with handlers for both `chat.message` and
 * `experimental.chat.system.transform`.
 */
export function createReferenceInjectionHook(ctx: PluginContext): Partial<Hooks> {
  // Handler 1: detect keywords in user messages and store signals
  const chatMessageHandler = safeHandler(
    "reference-injection:chat-message",
    async (input: ChatMessageInput, output: ChatMessageOutput): Promise<void> => {
      const text = extractTextFromParts(output.parts);
      if (!text.trim()) return;

      const detected = detectReferences(text);
      if (detected.length > 0) {
        setSignals(input.sessionID, detected);
      }
    },
  );

  // Handler 2: inject reference content into system prompt
  const systemTransformHandler = safeHandler(
    "reference-injection:system-transform",
    async (
      input: { sessionID?: string; model: SdkModel },
      output: { system: string[] },
    ): Promise<void> => {
      const sessionId = input.sessionID;
      if (!sessionId) return;

      const referenceNames = getSignals(sessionId);
      if (referenceNames.length === 0) return;

      const entries: Array<{ name: string; content: string }> = [];

      for (const name of referenceNames) {
        const resource = ctx.resolver.resolve("reference", name);
        if (resource?.content) {
          entries.push({ name, content: resource.content });
        }
      }

      if (entries.length > 0) {
        const block = buildReferencesBlock(entries);
        if (block) {
          output.system.push(block);
        }
      }

      clearSignals(sessionId);
    },
  );

  return {
    "chat.message": chatMessageHandler,
    "experimental.chat.system.transform": systemTransformHandler,
  };
}

/** Satisfies the HookFactory signature for registry integration. */
export const referenceInjectionFactory: HookFactory = createReferenceInjectionHook;
