/**
 * Compaction Hook — injects workflow state, spec, and ADL into
 * compaction context so agents resume coherently after resets.
 *
 * @module hooks/compaction-hook
 */

import { existsSync, readFileSync } from "fs";
import { join } from "path";

import type { PluginContext } from "../core/types.js";
import { log, logError } from "../shared/logger.js";
import { getProjectGoopspecDir } from "../shared/paths.js";

/** Imperative directive block for current workflow phase, wave, and lock status. */
export function buildWorkflowStateBlock(ctx: PluginContext): string {
  try {
    const state = ctx.stateManager.getState();
    const workflow = state?.workflow;

    const phase = (workflow?.phase ?? "idle").toUpperCase();
    const currentWave = workflow?.currentWave ?? 0;
    const totalWaves = workflow?.totalWaves ?? 0;
    const interviewComplete = workflow?.interviewComplete ?? false;
    const specLocked = workflow?.specLocked ?? false;
    const acceptanceConfirmed = workflow?.acceptanceConfirmed ?? false;

    const lines: string[] = [];

    lines.push("## GoopSpec Workflow State");
    lines.push("");
    lines.push(`RESUME FROM THIS POINT. You are in the ${phase} phase.`);
    lines.push("");
    lines.push("Current Status:");

    // Omit wave line when both are 0
    if (currentWave !== 0 || totalWaves !== 0) {
      lines.push(`- Wave: ${currentWave} of ${totalWaves}`);
    }

    lines.push(
      `- Interview: ${interviewComplete ? "Complete" : "Not yet complete — continue gathering requirements"}`
    );

    if (specLocked) {
      lines.push(
        "- Spec: LOCKED — Do not re-plan or re-discuss requirements"
      );
    } else {
      lines.push(
        "- Spec: UNLOCKED — Specification may still change"
      );
    }

    lines.push(
      `- Acceptance: ${acceptanceConfirmed ? "Confirmed" : "Pending"}`
    );

    // Autopilot directive — injected only when flag is truthy
    const autopilot = workflow?.autopilot;
    if (autopilot) {
      lines.push("");
      lines.push(
        "AUTOPILOT ACTIVE: Do not pause between phases. Continue to the next phase immediately."
      );
    }

    // Lazy Autopilot directive — stronger rules for zero-question mode
    const lazyAutopilot = workflow?.lazyAutopilot;
    if (lazyAutopilot) {
      lines.push("");
      lines.push("LAZY AUTOPILOT ACTIVE. Rules:");
      lines.push("- Do NOT ask the user any questions.");
      lines.push("- Do NOT pause for phase confirmations or reviews.");
      lines.push("- Do NOT request clarifications — infer from context.");
      lines.push(
        "- ONLY stop for: (1) Rule 4 architectural decisions (schema changes, framework switches), " +
        "(2) missing credentials or secrets you cannot infer, " +
        "(3) ambiguous destructive operations (deletes, force pushes, irreversible changes), " +
        "(4) external blockers (unavailable dependencies, broken CI, unresolvable test failures)."
      );
      lines.push("- For ALL other situations: make your best inference and continue.");
    }

    // Autopilot session rules — suppress compaction/session reminders in any autopilot mode
    if (autopilot || lazyAutopilot) {
      lines.push("");
      lines.push(
        "AUTOPILOT SESSION RULES: Do NOT warn about context length or token limits. " +
        "Do NOT suggest starting a new session. " +
        "Do NOT mention compaction or memory constraints. " +
        "Continue working until the task is complete or a permitted stop condition is reached."
      );
    }

    lines.push("");

    // Closing directive paragraph
    const phaseDirective = buildPhaseDirective(phase, currentWave, specLocked);
    lines.push(phaseDirective);

    return lines.join("\n");
  } catch (error) {
    logError("Failed to build workflow state block", error);
    return "";
  }
}

/** Build a closing imperative directive sentence tailored to the current phase. */
function buildPhaseDirective(
  phase: string,
  currentWave: number,
  specLocked: boolean
): string {
  const parts: string[] = [];

  switch (phase) {
    case "IDLE":
      parts.push("No active workflow. Await user instructions.");
      break;
    case "PLAN":
      parts.push("You are in the planning phase. Continue gathering requirements and refining the plan.");
      break;
    case "RESEARCH":
      parts.push("You are in the research phase. Continue investigating and documenting findings.");
      break;
    case "SPECIFY":
      parts.push("You are in the specification phase. Finalize and lock the specification.");
      break;
    case "EXECUTE":
      parts.push(`You are in the execution phase. Resume executing Wave ${currentWave}.`);
      break;
    case "ACCEPT":
      parts.push("You are in the acceptance phase. Verify work against the specification.");
      break;
    default:
      parts.push(`You are in the ${phase} phase. Continue from where you left off.`);
      break;
  }

  if (specLocked) {
    parts.push("The spec is locked. Do not re-plan.");
  }

  return parts.join(" ");
}

/**
 * Extract must-haves and out-of-scope sections from a large SPEC.md.
 *
 * Scans for `## Must-Haves` and `## Out of Scope` headers (case-insensitive,
 * tolerates minor variations) and returns the content of each section up to
 * the next `## ` heading or end of file.
 */
function extractKeySections(lines: string[]): string {
  const mustHavePattern = /^## .*Must.?Have/i;
  const outOfScopePattern = /^## .*Out.?of.?Scope/i;

  const sections: string[] = [];

  for (const pattern of [mustHavePattern, outOfScopePattern]) {
    const startIdx = lines.findIndex((line) => pattern.test(line));
    if (startIdx === -1) continue;

    // Find the next ## heading after the matched one
    let endIdx = lines.length;
    for (let i = startIdx + 1; i < lines.length; i++) {
      if (lines[i].startsWith("## ")) {
        endIdx = i;
        break;
      }
    }

    sections.push(lines.slice(startIdx, endIdx).join("\n"));
  }

  return sections.join("\n\n");
}

/** Active SPEC.md content (full if <=200 lines, must-haves + out-of-scope otherwise). */
export function buildSpecBlock(projectDir: string): string {
  try {
    const specPath = join(getProjectGoopspecDir(projectDir), "SPEC.md");
    if (!existsSync(specPath)) return "";

    const content = readFileSync(specPath, "utf-8");
    const lines = content.split("\n");

    let specContent: string;
    if (lines.length <= 200) {
      specContent = content;
    } else {
      specContent = extractKeySections(lines);
    }

    if (!specContent.trim()) return "";

    return `## Active Specification Contract\n\nThis is your active contract. Execute against it. Do not deviate.\n\n${specContent}`;
  } catch (error) {
    logError("Failed to build spec block", error);
    return "";
  }
}

/** Last 3-5 ADL entries with imperative framing. */
export function buildADLBlock(ctx: PluginContext): string {
  try {
    const raw = ctx.stateManager.getADL();
    if (!raw || !raw.trim()) return "";

    // Split on H3 boundaries — each entry starts with "### "
    const parts = raw.split(/^(?=### )/m).filter((p) => p.trim().length > 0);
    if (parts.length === 0) return "";

    // Take the last 5 entries (or fewer if less exist)
    const recent = parts.slice(-5);

    const lines: string[] = [];
    lines.push("## Recent Architectural Decisions");
    lines.push("");
    lines.push(
      "These architectural decisions have already been made. Honour them. Do not re-debate."
    );
    lines.push("");
    lines.push(recent.map((entry) => entry.trimEnd()).join("\n\n"));

    return lines.join("\n");
  } catch (error) {
    logError("Failed to build ADL block", error);
    return "";
  }
}

/** Static tool re-hydration instructions — always injected last. */
export function buildToolInstructionsBlock(): string {
  return `## GoopSpec Re-hydration Required

Your session was compacted. Run these tools NOW, in this order, before taking any action:

1. \`goop_status\` — Restore live workflow phase and next-step guidance
2. \`goop_spec({ "action": "read", "file": "spec" })\` — Load the full active specification contract
3. \`goop_adl({ "action": "read" })\` — Load all architectural decisions

Do NOT proceed with any planning, coding, or decision-making until you have run all three tools above.`;
}

/**
 * Create the experimental.session.compacting hook.
 *
 * Pushes non-empty builder results to `output.context`, with tool
 * instructions always last. Never throws — errors logged via `logError`.
 */
export function createCompactionHook(ctx: PluginContext) {
  return async (
    _input: unknown,
    output: { context: string[]; prompt?: string }
  ): Promise<void> => {
    log("Compaction hook triggered");

    try {
      const blocks = [
        buildWorkflowStateBlock(ctx),
        buildSpecBlock(ctx.input.directory),
        buildADLBlock(ctx),
      ];

      let pushed = 0;
      for (const block of blocks) {
        if (block.trim().length > 0) {
          output.context.push(block);
          pushed++;
        }
      }

      // Tool instructions always last
      const toolBlock = buildToolInstructionsBlock();
      if (toolBlock.trim().length > 0) {
        output.context.push(toolBlock);
        pushed++;
      }

      log("Compaction hook complete", { contextBlocksPushed: pushed });
    } catch (error) {
      logError("Compaction hook failed", error);
    }
  };
}
