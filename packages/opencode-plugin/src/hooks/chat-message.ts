/**
 * Chat Message Hook — tracks session activity and captures significant
 * user prompts to memory. Intentionally lightweight: does NOT mutate the
 * message output to avoid breaking the message flow.
 */

import type { SdkPart, SdkUserMessage } from "../core/sdk-compat.js";
import type { PluginContext } from "../core/types.js";
import { logError } from "../shared/logger.js";
import type { HookFactory, Hooks } from "./types.js";
import { safeHandler } from "./utils.js";

// ---------------------------------------------------------------------------
// SDK hook input/output shapes (from verified @opencode-ai/plugin .d.ts)
// ---------------------------------------------------------------------------

export interface ChatMessageInput {
  sessionID: string;
  agent?: string;
  model?: {
    providerID: string;
    modelID: string;
  };
  messageID?: string;
  variant?: string;
}

export interface ChatMessageOutput {
  message: SdkUserMessage;
  parts: SdkPart[];
}

// ---------------------------------------------------------------------------
// Significance detection
// ---------------------------------------------------------------------------

const SIGNIFICANT_KEYWORDS =
  /\b(must|should|need|require|want|implement|create|build|fix|debug|refactor|test|deploy|migrate)\b/i;

export function isSignificantMessage(text: string): boolean {
  if (text.length < 10) return false;
  if (text.includes("?")) return true;
  if (text.startsWith("/")) return true;
  if (text.length > 100) return true;
  return SIGNIFICANT_KEYWORDS.test(text);
}

// ---------------------------------------------------------------------------
// Text extraction
// ---------------------------------------------------------------------------

export function extractTextFromParts(parts: SdkPart[]): string {
  return parts
    .filter((p): p is SdkPart & { type: "text" } => p.type === "text")
    .map((p) => (p as unknown as { text: string }).text)
    .join("\n");
}

// ---------------------------------------------------------------------------
// Hook factory
// ---------------------------------------------------------------------------

export function createChatMessageHook(ctx: PluginContext): Partial<Hooks> {
  const handler = safeHandler(
    "chat-message",
    async (_input: ChatMessageInput, output: ChatMessageOutput): Promise<void> => {
      // Update activity — clear stale checkpoint marker on new activity
      const workflow = ctx.stateManager.getActiveWorkflow();
      if (workflow.checkpoint !== undefined) {
        ctx.stateManager.updateWorkflow({
          checkpoint: undefined,
        });
      }

      const text = extractTextFromParts(output.parts);
      if (!text.trim()) return;

      if (isSignificantMessage(text)) {
        const title = text.slice(0, 80) + (text.length > 80 ? "..." : "");
        queueMicrotask(() => {
          void ctx.memory
            .save({
              type: "note",
              title,
              content: text.slice(0, 2000),
              importance: text.includes("?") ? 6 : 5,
              concepts: ["user-prompt", workflow.phase],
            })
            .catch((err: unknown) => {
              logError("chat-message: fire-and-forget memory.save failed", err);
            });
        });
      }
    },
  );

  return {
    "chat.message": handler,
  };
}

export const chatMessageFactory: HookFactory = createChatMessageHook;
