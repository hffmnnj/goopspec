/**
 * GoopSpec PR Review Tool
 *
 * Validates GitHub CLI availability, resolves PR metadata,
 * runs comprehensive review analysis, displays a structured report,
 * and presents selectable fix options before execution.
 *
 * @module tools/goop-pr-review
 */

import { tool, type ToolDefinition } from "@opencode-ai/plugin/tool";
import type { PluginContext, ToolContext } from "../../core/types.js";
import { ghPreflight, resolvePr, formatPrSummary } from "./github.js";
import { buildReviewContext } from "./context.js";
import { analyzeQuality } from "./analyzers/quality.js";
import { analyzeSecurity } from "./analyzers/security.js";
import { analyzeSpecAlignment } from "./analyzers/spec.js";
import { formatReviewReport, deriveVerdict, countFindings } from "./report.js";
import { checkDirtyWorktree, buildFixOptionsPrompt, getAvailableFixOptions } from "./prompts.js";
import { createDefaultReport } from "./types.js";
import { isSpecModeEnabled } from "./spec-context.js";

/**
 * Create the goop_pr_review tool
 */
export function createGoopPrReviewTool(ctx: PluginContext): ToolDefinition {
  void ctx;

  return tool({
    description:
      "Review a GitHub pull request: validates gh CLI, resolves PR metadata, runs analysis, displays report, and offers fix options",
    args: {
      pr: tool.schema.string().optional(),
    },
    async execute(args, _context: ToolContext): Promise<string> {
      const lines: string[] = [];

      // Step 1: Preflight — verify gh is installed and authenticated
      const preflight = await ghPreflight();
      if (!preflight.ok) {
        lines.push("## ❌ GitHub CLI Preflight Failed");
        lines.push("");
        lines.push(`**Error:** ${preflight.error}`);
        if (preflight.remediation) {
          lines.push(`**Fix:** ${preflight.remediation}`);
        }
        return lines.join("\n");
      }

      // Step 2: Require PR input
      if (!args.pr) {
        lines.push("## PR Review");
        lines.push("");
        lines.push("Provide a PR number or URL to review.");
        lines.push("");
        lines.push("**Usage:** `goop_pr_review({ pr: \"42\" })` or `goop_pr_review({ pr: \"https://github.com/owner/repo/pull/42\" })`");
        return lines.join("\n");
      }

      // Step 3: Resolve PR metadata
      const result = await resolvePr(args.pr);
      if (!result.ok || !result.pr) {
        lines.push("## ❌ PR Resolution Failed");
        lines.push("");
        lines.push(`**Error:** ${result.error}`);
        if (result.remediation) {
          lines.push(`**Fix:** ${result.remediation}`);
        }
        return lines.join("\n");
      }

      // Step 4: Display PR summary
      lines.push(formatPrSummary(result.pr));
      lines.push("");
      lines.push("---");
      lines.push("");

      // Step 5: Build review context (fetch PR data from gh)
      const reviewContext = await buildReviewContext({ pr: result.pr });

      // Step 6: Run analyzers
      const specAvailable = isSpecModeEnabled(reviewContext.specAvailability);
      const report = createDefaultReport(result.pr, specAvailable);

      report.quality = analyzeQuality(reviewContext);
      report.security = analyzeSecurity(reviewContext);
      report.spec = analyzeSpecAlignment(reviewContext);
      report.changeSummary = {
        filesChanged: reviewContext.files.map((f) => f.path),
        additions: result.pr.additions,
        deletions: result.pr.deletions,
        summary: `${reviewContext.files.length} file(s) changed (+${result.pr.additions} -${result.pr.deletions}).`,
      };
      report.verdict = deriveVerdict(report);

      // Step 7: Format and display the review report
      lines.push(formatReviewReport(report));
      lines.push("");
      lines.push("---");
      lines.push("");

      // Step 8: Check dirty worktree and present fix options
      const worktreeResult = await checkDirtyWorktree();
      const fixPrompt = buildFixOptionsPrompt(report, worktreeResult);

      if (fixPrompt) {
        lines.push(fixPrompt);
      } else {
        const totalFindings = countFindings(report);
        if (totalFindings === 0) {
          lines.push("No actionable findings. No fixes needed.");
        } else {
          lines.push("All findings are informational. No automated fixes available.");
        }
      }

      lines.push("");
      lines.push("---");
      lines.push("");

      // Step 9: Summary footer
      const availableFixes = getAvailableFixOptions(report);
      if (availableFixes.length > 0) {
        lines.push(`**${availableFixes.length} fix option(s) available.** Select fixes to apply or proceed to merge.`);
      } else {
        lines.push("Review complete. Proceed to merge when ready.");
      }

      return lines.join("\n");
    },
  });
}
