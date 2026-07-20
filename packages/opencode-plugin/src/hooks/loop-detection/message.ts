import type { ClassificationResult } from "./classify.js";

function describeLoop(result: ClassificationResult): string {
  const tool = result.tool ?? "unknown";
  const repeats = result.repeatCount ?? 0;
  return `Tool "${tool}" repeated ${repeats} times with identical arguments and output.`;
}

/**
 * Build the Tier 1 result that replaces the original tool output.
 */
export function buildTier1Message(result: ClassificationResult, originalOutput: string): string {
  const originalResultNote = originalOutput.trim()
    ? "The original tool result is withheld to prevent retry amplification."
    : "The tool returned no output.";

  return [
    "LOOP DETECTED — STOP RETRYING THIS CALL.",
    describeLoop(result),
    originalResultNote,
    "Do not retry this exact call. Change approach, use a different tool or inputs, or escalate via the Four-Rule Deviation System (Rule 4).",
  ].join("\n");
}

/**
 * Build the Tier 2 note appended to the original tool output.
 */
export function buildTier2Message(result: ClassificationResult): string {
  const tool = result.tool ?? "this tool";
  const repeats = result.repeatCount ?? 0;
  return `[Loop warning: ${tool} has produced similar results ${repeats} times. Consider a different approach before retrying.]`;
}
