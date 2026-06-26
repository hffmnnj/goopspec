/**
 * goop_infer_intent tool — classify raw voice transcripts into GoopSpec commands.
 *
 * The tool prefers an SDK-provided completion method when available and falls
 * back to deterministic keyword matching when the plugin SDK does not expose a
 * direct model-completion API.
 *
 * @module tools/goop-infer-intent
 */

import { tool } from "../../core/sdk-compat.js";
import type { ToolContext, ToolDefinition } from "../../core/sdk-compat.js";
import type { ADLEntry, PluginContext } from "../../core/types.js";

const INTENT_COMMANDS = ["discuss", "plan", "execute", "accept", "quick", "chat"] as const;
export type IntentCommand = (typeof INTENT_COMMANDS)[number];

interface IntentArgs {
  transcript: string;
  workflowPhase?: string;
  hasActiveWorkflow?: boolean;
}

export interface IntentClassification {
  command: IntentCommand;
  confidence: number;
  slots: Record<string, string>;
  reasoning: string;
}

interface IntentResult extends IntentClassification {
  autoRun: boolean;
  commandString: string;
}

interface CompletionRequest {
  system: string;
  messages: Array<{ role: "user"; content: string }>;
  temperature: number;
  maxTokens: number;
}

type CompletionMethod = (request: CompletionRequest) => Promise<unknown>;

const SYSTEM_PROMPT = `You are a GoopSpec command intent classifier. Your ONLY job is to classify a voice transcript into one of 6 GoopSpec workflow commands and return a JSON object.

Commands:
- "discuss": Starting new work, describing a feature, asking for a new feature, saying "I want to X", "let's plan", "let me tell you about", "new workflow for..."
- "plan": Creating a plan, spec, or blueprint. "make a plan", "plan the implementation", "create the spec for..."
- "execute": Running, building, implementing. "go ahead", "implement it", "build it", "start coding", "execute the plan"
- "accept": Approving work, accepting results. "looks good", "accept it", "ship it", "approve", "that's great", "done"
- "quick": Small, quick changes. "quick fix", "just change X", "small update", "tweak..."
- "chat": General questions, clarifications, or anything that doesn't clearly map to a workflow command.

Return ONLY valid JSON, no explanation, no markdown:
{
  "command": "discuss" | "plan" | "execute" | "accept" | "quick" | "chat",
  "confidence": 0.0 to 1.0,
  "slots": { "feature": "...", "target": "..." },  // extracted key info from transcript
  "reasoning": "one sentence explaining the classification"
}

Be conservative with confidence. If ambiguous, classify as "chat" with confidence 0.5.
Empty or gibberish transcript: return { "command": "chat", "confidence": 0.1, "slots": {}, "reasoning": "Empty or unclear input" }`;

const COMMAND_MAP: Record<IntentCommand, string> = {
  discuss: "/goop-discuss",
  plan: "/goop-plan",
  execute: "/goop-execute",
  accept: "/goop-accept",
  quick: "/goop-quick",
  chat: "",
};

const FAILED_CLASSIFICATION: IntentClassification = {
  command: "chat",
  confidence: 0.1,
  slots: {},
  reasoning: "Classification failed",
};

const COMPLETION_METHOD_NAMES = ["complete", "chat", "generate", "ask"] as const;

let loggedFallbackUnavailable = false;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function clampConfidence(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(Math.max(value, 0), 1);
}

function isIntentCommand(value: unknown): value is IntentCommand {
  return typeof value === "string" && INTENT_COMMANDS.includes(value as IntentCommand);
}

function normalizeSlots(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {};

  const slots: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (typeof raw === "string" && raw.trim().length > 0) {
      slots[key] = raw.trim();
    }
  }
  return slots;
}

function normalizeClassification(value: unknown): IntentClassification | null {
  if (!isRecord(value) || !isIntentCommand(value.command)) return null;

  const confidence =
    typeof value.confidence === "number" ? value.confidence : Number(value.confidence);
  const reasoning =
    typeof value.reasoning === "string" ? value.reasoning.trim() : "No reasoning provided";

  return {
    command: value.command,
    confidence: clampConfidence(confidence),
    slots: normalizeSlots(value.slots),
    reasoning: reasoning.length > 0 ? reasoning : "No reasoning provided",
  };
}

function extractJsonObject(text: string): string | null {
  const trimmed = text.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) return trimmed;

  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first === -1 || last === -1 || last <= first) return null;
  return trimmed.slice(first, last + 1);
}

function parseClassification(text: string): IntentClassification | null {
  const json = extractJsonObject(text);
  if (json === null) return null;

  try {
    return normalizeClassification(JSON.parse(json) as unknown);
  } catch {
    return null;
  }
}

function extractCompletionText(response: unknown): string | null {
  if (typeof response === "string") return response;
  if (!isRecord(response)) return null;

  for (const key of ["output", "content", "text", "message", "result", "response"] as const) {
    const value = response[key];
    if (typeof value === "string") return value;
  }

  const choices = response.choices;
  if (Array.isArray(choices) && choices.length > 0) {
    const first = choices[0] as unknown;
    const fromChoice = extractCompletionText(first);
    if (fromChoice !== null) return fromChoice;
  }

  const message = response.message;
  if (isRecord(message)) {
    const fromMessage = extractCompletionText(message);
    if (fromMessage !== null) return fromMessage;
  }

  const parts = response.parts;
  if (Array.isArray(parts)) {
    const text = parts
      .map((part) => (isRecord(part) && typeof part.text === "string" ? part.text : ""))
      .filter((partText) => partText.length > 0)
      .join("\n")
      .trim();
    if (text.length > 0) return text;
  }

  return null;
}

function getCompletionMethod(ctx: PluginContext): CompletionMethod | null {
  const sdk = ctx.sdk as unknown as Record<string, unknown>;

  for (const methodName of COMPLETION_METHOD_NAMES) {
    const method = sdk[methodName];
    if (typeof method === "function") {
      return (request: CompletionRequest) => Promise.resolve(method.call(ctx.sdk, request));
    }
  }

  return null;
}

async function classifyWithSdk(
  ctx: PluginContext,
  transcript: string,
): Promise<IntentClassification | null> {
  const complete = getCompletionMethod(ctx);
  if (complete === null) return null;

  const response = await complete({
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: `Transcript: ${transcript}` }],
    temperature: 0,
    maxTokens: 300,
  });

  const text = extractCompletionText(response);
  if (text === null) return FAILED_CLASSIFICATION;
  return parseClassification(text) ?? FAILED_CLASSIFICATION;
}

export function classifyByKeywords(transcript: string): IntentClassification {
  const t = transcript.toLowerCase().trim();

  if (!t || t.length < 3) {
    return { command: "chat", confidence: 0.1, slots: {}, reasoning: "Empty input" };
  }

  const patterns: Array<{
    cmd: Exclude<IntentCommand, "chat">;
    confidence: number;
    patterns: RegExp[];
  }> = [
    {
      cmd: "discuss",
      confidence: 0.8,
      patterns: [
        /i want to/,
        /let'?s (plan|build|make)/,
        /new (feature|workflow|project)/,
        /add (a |an )?/,
        /create a/,
        /i'd like to/,
      ],
    },
    {
      cmd: "plan",
      confidence: 0.85,
      patterns: [
        /make a plan/,
        /plan (the |this )?/,
        /create (the |a )?spec/,
        /write (the |a )?blueprint/,
        /design (the |a )?/,
      ],
    },
    {
      cmd: "execute",
      confidence: 0.85,
      patterns: [
        /go ahead/,
        /implement (it|this|the)/,
        /build it/,
        /start (building|coding)/,
        /execute (the |this )?plan/,
        /run it/,
        /do it/,
        /let'?s go/,
      ],
    },
    {
      cmd: "accept",
      confidence: 0.9,
      patterns: [
        /looks good/,
        /accept/,
        /ship it/,
        /approve/,
        /that'?s (great|good|perfect)/,
        /well done/,
        /looks (right|correct)/,
      ],
    },
    {
      cmd: "quick",
      confidence: 0.8,
      patterns: [
        /quick (fix|change|update|edit)/,
        /just (change|fix|update|edit|add|remove)/,
        /small (change|update|fix)/,
        /tweak/,
        /minor/,
      ],
    },
  ];

  for (const { cmd, confidence, patterns: pats } of patterns) {
    if (pats.some((pattern) => pattern.test(t))) {
      return { command: cmd, confidence, slots: {}, reasoning: `Keyword match for ${cmd}` };
    }
  }

  return {
    command: "chat",
    confidence: 0.5,
    slots: {},
    reasoning: "No clear workflow intent detected",
  };
}

function buildIntentResult(args: IntentArgs, classification: IntentClassification): IntentResult {
  const commandString = COMMAND_MAP[classification.command];
  const canAutoRun =
    args.hasActiveWorkflow === false ||
    (args.hasActiveWorkflow === true && args.workflowPhase === "idle");
  const autoRun =
    classification.confidence >= 0.75 && classification.command !== "chat" && canAutoRun;

  return {
    ...classification,
    autoRun,
    commandString,
  };
}

function confidenceLabel(confidence: number): string {
  if (confidence >= 0.75) return "HIGH";
  if (confidence >= 0.5) return "MEDIUM";
  return "LOW";
}

function formatSlots(slots: Record<string, string>): string {
  const entries = Object.entries(slots);
  if (entries.length === 0) return "none";
  return entries.map(([key, value]) => `${key}: "${value}"`).join(", ");
}

function escapeHtmlCommentJson(value: string): string {
  return value.replace(/--/g, "\\u002d\\u002d").replace(/>/g, "\\u003e");
}

function formatResult(args: IntentArgs, result: IntentResult): string {
  const displayCommand =
    result.commandString.length > 0 ? `\`${result.commandString}\` (${result.command})` : "chat";
  const autoRunText = result.autoRun
    ? `✅ Running \`${result.commandString}\` automatically...`
    : "Not running automatically. Ask a clarification or run the command manually.";
  const json = escapeHtmlCommentJson(
    JSON.stringify({
      command: result.command,
      confidence: result.confidence,
      slots: result.slots,
      autoRun: result.autoRun,
      commandString: result.commandString,
    }),
  );

  return [
    "## Intent Classification",
    "",
    `**Transcript:** "${args.transcript}"`,
    `**Command:** ${displayCommand}  `,
    `**Confidence:** ${result.confidence.toFixed(2)} (${confidenceLabel(result.confidence)})`,
    `**Slots:** ${formatSlots(result.slots)}`,
    "",
    `**Reasoning:** ${result.reasoning}`,
    "",
    "---",
    `**Auto-run:** ${autoRunText}`,
    "",
    "<!-- JSON for programmatic use:",
    json,
    "-->",
  ].join("\n");
}

function appendAdl(
  ctx: PluginContext,
  type: ADLEntry["type"],
  description: string,
  action: string,
): void {
  try {
    ctx.stateManager.appendADL({
      timestamp: new Date().toISOString(),
      rule: type === "deviation" ? 3 : undefined,
      type,
      description,
      action,
      files: ["packages/opencode-plugin/src/tools/goop-infer-intent/index.ts"],
    });
  } catch {
    // ADL logging must never affect tool output.
  }
}

async function classifyTranscript(
  ctx: PluginContext,
  transcript: string,
): Promise<{ classification: IntentClassification; method: "sdk" | "keyword" | "failed" }> {
  try {
    const sdkClassification = await classifyWithSdk(ctx, transcript);
    if (sdkClassification !== null) {
      return {
        classification: sdkClassification,
        method: sdkClassification === FAILED_CLASSIFICATION ? "failed" : "sdk",
      };
    }

    if (!loggedFallbackUnavailable) {
      loggedFallbackUnavailable = true;
      appendAdl(
        ctx,
        "deviation",
        "goop_infer_intent used keyword classification because ctx.sdk exposes no direct complete/chat/generate/ask method.",
        "Implemented safe keyword fallback while keeping the SDK completion seam for future OpenCode plugin APIs.",
      );
    }

    return { classification: classifyByKeywords(transcript), method: "keyword" };
  } catch {
    return { classification: FAILED_CLASSIFICATION, method: "failed" };
  }
}

export function createGoopInferIntentTool(ctx: PluginContext): ToolDefinition {
  return tool({
    description:
      "Classify a raw voice transcript into a GoopSpec command intent. " +
      "Returns command, confidence, extracted slots, reasoning, and auto-run metadata.",
    args: {
      transcript: tool.schema.string(),
      workflowPhase: tool.schema.string().optional(),
      hasActiveWorkflow: tool.schema.boolean().optional(),
    },
    async execute(args: IntentArgs, _context: ToolContext): Promise<string> {
      try {
        const transcript = args.transcript.trim();
        const { classification, method } = await classifyTranscript(ctx, transcript);
        const result = buildIntentResult({ ...args, transcript }, classification);

        if (method === "sdk") {
          appendAdl(
            ctx,
            "observation",
            "goop_infer_intent used SDK-based intent classification.",
            "Returned structured voice intent classification markdown.",
          );
        }

        return formatResult({ ...args, transcript }, result);
      } catch {
        const result = buildIntentResult(args, FAILED_CLASSIFICATION);
        return formatResult(args, result);
      }
    },
  });
}
