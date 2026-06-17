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
import {
  checkDirtyWorktree,
  buildFixOptionsPrompt,
  getAvailableFixOptions,
  parseFixSelection,
} from "./prompts.js";
import { createDefaultReport } from "./types.js";
import { isSpecModeEnabled } from "./spec-context.js";
import { orchestrateFixes } from "./fix-orchestrator.js";
import type { ExecResult } from "./github.js";
import {
  promptMergeStrategy,
  confirmMerge,
  executeMerge,
  handleMergeResult,
} from "./merge.js";

type ToolDeps = {
  ghPreflight: typeof ghPreflight;
  resolvePr: typeof resolvePr;
  formatPrSummary: typeof formatPrSummary;
  buildReviewContext: typeof buildReviewContext;
  analyzeQuality: typeof analyzeQuality;
  analyzeSecurity: typeof analyzeSecurity;
  analyzeSpecAlignment: typeof analyzeSpecAlignment;
  formatReviewReport: typeof formatReviewReport;
  deriveVerdict: typeof deriveVerdict;
  countFindings: typeof countFindings;
  createDefaultReport: typeof createDefaultReport;
  isSpecModeEnabled: typeof isSpecModeEnabled;
  checkDirtyWorktree: typeof checkDirtyWorktree;
  buildFixOptionsPrompt: typeof buildFixOptionsPrompt;
  getAvailableFixOptions: typeof getAvailableFixOptions;
  parseFixSelection: typeof parseFixSelection;
  orchestrateFixes: typeof orchestrateFixes;
  promptMergeStrategy: typeof promptMergeStrategy;
  confirmMerge: typeof confirmMerge;
  executeMerge: typeof executeMerge;
  handleMergeResult: typeof handleMergeResult;
  run: (command: string) => Promise<ExecResult>;
};

function defaultRun(command: string): Promise<ExecResult> {
  const proc = Bun.spawn(["sh", "-c", command], {
    stdout: "pipe",
    stderr: "pipe",
  });

  return Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]).then(([stdout, stderr, exitCode]) => ({
    stdout: stdout.trim(),
    stderr: stderr.trim(),
    exitCode,
  }));
}

const DEFAULT_DEPS: ToolDeps = {
  ghPreflight,
  resolvePr,
  formatPrSummary,
  buildReviewContext,
  analyzeQuality,
  analyzeSecurity,
  analyzeSpecAlignment,
  formatReviewReport,
  deriveVerdict,
  countFindings,
  createDefaultReport,
  isSpecModeEnabled,
  checkDirtyWorktree,
  buildFixOptionsPrompt,
  getAvailableFixOptions,
  parseFixSelection,
  orchestrateFixes,
  promptMergeStrategy,
  confirmMerge,
  executeMerge,
  handleMergeResult,
  run: defaultRun,
};

/**
 * Create the goop_pr_review tool
 */
export function createGoopPrReviewTool(
  ctx: PluginContext,
  deps: Partial<ToolDeps> = {},
): ToolDefinition {
  void ctx;
  const d: ToolDeps = { ...DEFAULT_DEPS, ...deps };

  return tool({
    description:
      "Review a GitHub pull request: validates gh CLI, resolves PR metadata, runs analysis, displays report, and offers fix options",
    args: {
      pr: tool.schema.string().optional(),
      fixSelection: tool.schema.string().optional(),
      mergeStrategy: tool.schema.string().optional(),
      mergeConfirm: tool.schema.string().optional(),
    },
    async execute(args, _context: ToolContext): Promise<string> {
      const lines: string[] = [];

      // Step 1: Preflight — verify gh is installed and authenticated
      const preflight = await d.ghPreflight();
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
      const result = await d.resolvePr(args.pr);
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
      lines.push(d.formatPrSummary(result.pr));
      lines.push("");
      lines.push("---");
      lines.push("");

      // Step 5: Build review context (fetch PR data from gh)
      const reviewContext = await d.buildReviewContext({ pr: result.pr });

      // Step 6: Run analyzers
      const specAvailable = d.isSpecModeEnabled(reviewContext.specAvailability);
      const report = d.createDefaultReport(result.pr, specAvailable);

      report.quality = d.analyzeQuality(reviewContext);
      report.security = d.analyzeSecurity(reviewContext);
      report.spec = d.analyzeSpecAlignment(reviewContext);
      report.changeSummary = {
        filesChanged: reviewContext.files.map((f) => f.path),
        additions: result.pr.additions,
        deletions: result.pr.deletions,
        summary: `${reviewContext.files.length} file(s) changed (+${result.pr.additions} -${result.pr.deletions}).`,
      };
      report.verdict = d.deriveVerdict(report);

      // Step 7: Format and display the review report
      lines.push(d.formatReviewReport(report));
      lines.push("");
      lines.push("---");
      lines.push("");

      // Step 8: Check dirty worktree and present fix options
      const worktreeResult = await d.checkDirtyWorktree();
      const fixPrompt = d.buildFixOptionsPrompt(report, worktreeResult);
      const availableFixes = d.getAvailableFixOptions(report);

      if (fixPrompt) {
        lines.push(fixPrompt);
      } else {
        const totalFindings = d.countFindings(report);
        if (totalFindings === 0) {
          lines.push("No actionable findings. No fixes needed.");
        } else {
          lines.push("All findings are informational. No automated fixes available.");
        }
      }

      // Step 9: Route selected fixes through orchestration dispatcher
      if (availableFixes.length > 0) {
        lines.push("");
        lines.push("### Fix Execution");

        if (!args.fixSelection) {
          lines.push("No fix selection provided yet. Re-run with `fixSelection` (for example: `lint,tests`, `all`, or `none`).");
        } else {
          const selectedFixes = d.parseFixSelection(args.fixSelection, availableFixes);

          if (selectedFixes.length === 0) {
            lines.push("No fix categories selected. Skipping fix execution.");
          } else {
            const orchestration = await d.orchestrateFixes(selectedFixes, reviewContext);
            lines.push(`Selected: ${orchestration.selected.join(", ")}`);

            for (const result of orchestration.results) {
              lines.push(`- ${result.category}: ${result.status} - ${result.message}`);
            }

            const appliedCount = orchestration.summary.applied.length;
            const skippedCount = orchestration.summary.skipped.length;
            const failedCount = orchestration.summary.failed.length;
            lines.push(`Summary: applied=${appliedCount}, skipped=${skippedCount}, failed=${failedCount}`);

            lines.push("");
            lines.push("Post-fix verification:");
            lines.push(`- status: ${orchestration.verification.status}`);
            lines.push(`- summary: ${orchestration.verification.summary}`);

            for (const check of orchestration.verification.checks) {
              const marker = check.passed ? "pass" : "fail";
              lines.push(`- ${check.name}: ${marker} (${check.command})`);
            }

            if (orchestration.verification.rollbackGuidance) {
              lines.push("- rollback guidance:");
              lines.push(`  ${orchestration.verification.rollbackGuidance.reason}`);
            }
          }
        }
      }

      lines.push("");
      lines.push("---");
      lines.push("");

      // Step 10: Merge strategy + confirmation + execution
      const unresolved = d.countFindings(report, "medium");

      lines.push("### Merge Flow");
      lines.push(`Unresolved medium+ findings: ${unresolved}.`);

      const strategyPrompt = d.promptMergeStrategy(args.mergeStrategy);
      lines.push(strategyPrompt.prompt);

      if (strategyPrompt.status !== "ready" || !strategyPrompt.strategy) {
        lines.push("Merge paused until a strategy is selected.");
      } else {
        const confirmation = d.confirmMerge({
          prNumber: result.pr.number,
          strategy: strategyPrompt.strategy,
          unresolvedFindings: unresolved,
          confirmation: args.mergeConfirm,
        });

        lines.push(confirmation.prompt);

        if (confirmation.status === "cancelled") {
          lines.push("Merge cancelled. PR remains open.");
        } else if (confirmation.status !== "confirmed") {
          lines.push("Merge paused until explicit confirmation is provided.");
        } else {
          const mergeCommandResult = await d.executeMerge(
            result.pr.number,
            strategyPrompt.strategy,
            d.run,
          );
          const mergeResult = d.handleMergeResult(mergeCommandResult);

          lines.push(`- status: ${mergeResult.status}`);
          lines.push(`- message: ${mergeResult.message}`);
          if (mergeResult.remediation) {
            lines.push(`- remediation: ${mergeResult.remediation}`);
          }
          if (mergeResult.details) {
            lines.push(`- details: ${mergeResult.details}`);
          }
        }
      }

      lines.push("");
      lines.push("---");
      lines.push("");

      // Step 11: Summary footer
      if (availableFixes.length > 0) {
        lines.push(`**${availableFixes.length} fix option(s) available.** Select fixes to apply and continue merge flow.`);
      } else {
        lines.push("Review complete. Merge flow ready.");
      }

      return lines.join("\n");
    },
  });
}
