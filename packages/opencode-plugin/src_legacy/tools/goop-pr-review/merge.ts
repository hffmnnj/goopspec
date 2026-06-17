/**
 * PR Review Merge Flow
 *
 * Provides strategy prompt handling, explicit confirmation gate,
 * gh merge execution, and actionable merge outcome mapping.
 *
 * @module tools/goop-pr-review/merge
 */

import type { ExecResult } from "./github.js";
import { exec } from "./github.js";

export const MERGE_STRATEGIES = ["merge", "squash"] as const;
export type MergeStrategy = (typeof MERGE_STRATEGIES)[number];

export interface MergeStrategyPromptResult {
  status: "ready" | "prompt";
  prompt: string;
  strategy?: MergeStrategy;
}

export interface MergeConfirmationInput {
  prNumber: number;
  strategy: MergeStrategy;
  unresolvedFindings: number;
  confirmation?: string | boolean;
}

export interface MergeConfirmationResult {
  status: "confirmed" | "cancelled" | "prompt";
  prompt: string;
}

export interface MergeCommandResult extends ExecResult {
  command: string;
  prNumber: number;
  strategy: MergeStrategy;
}

export type MergeExecutionStatus =
  | "success"
  | "conflict"
  | "permission-denied"
  | "failed";

export interface MergeExecutionResult {
  status: MergeExecutionStatus;
  message: string;
  remediation?: string;
  details?: string;
}

export function promptMergeStrategy(input?: string): MergeStrategyPromptResult {
  const basePrompt = [
    "Select merge strategy:",
    "- `merge`: create a merge commit (`gh pr merge --merge`)",
    "- `squash`: squash commits (`gh pr merge --squash`)",
  ].join("\n");

  if (!input || input.trim() === "") {
    return {
      status: "prompt",
      prompt: `${basePrompt}\n\nRe-run with \`mergeStrategy: \"merge\"\` or \`mergeStrategy: \"squash\"\`.`,
    };
  }

  const normalized = input.trim().toLowerCase();
  if (normalized === "merge" || normalized === "squash") {
    return {
      status: "ready",
      strategy: normalized,
      prompt: `Merge strategy selected: \`${normalized}\``,
    };
  }

  return {
    status: "prompt",
    prompt:
      `${basePrompt}\n\nInvalid strategy: \`${input}\`. ` +
      "Use `merge` or `squash`.",
  };
}

export function confirmMerge(
  input: MergeConfirmationInput,
): MergeConfirmationResult {
  const unresolvedSummary =
    input.unresolvedFindings > 0
      ? `${input.unresolvedFindings} unresolved finding(s) remain.`
      : "No unresolved findings detected.";

  const confirmationPrompt = [
    "Final merge confirmation required.",
    `PR: #${input.prNumber}`,
    `Strategy: ${input.strategy}`,
    `Status: ${unresolvedSummary}`,
    "Set `mergeConfirm` to `yes` to execute merge, or `no` to cancel.",
  ].join("\n");

  if (input.confirmation === undefined) {
    return {
      status: "prompt",
      prompt: confirmationPrompt,
    };
  }

  const normalized =
    typeof input.confirmation === "boolean"
      ? (input.confirmation ? "yes" : "no")
      : input.confirmation.trim().toLowerCase();

  if (normalized === "yes" || normalized === "y" || normalized === "confirm") {
    return {
      status: "confirmed",
      prompt: "Merge confirmed by user.",
    };
  }

  if (normalized === "no" || normalized === "n" || normalized === "cancel") {
    return {
      status: "cancelled",
      prompt: "Merge cancelled by user.",
    };
  }

  return {
    status: "prompt",
    prompt: `${confirmationPrompt}\n\nInvalid mergeConfirm value. Use \`yes\` or \`no\`.`,
  };
}

export async function executeMerge(
  prNumber: number,
  strategy: MergeStrategy,
  run: (cmd: string) => Promise<ExecResult> = exec,
): Promise<MergeCommandResult> {
  const strategyFlag = strategy === "squash" ? "--squash" : "--merge";
  const command = `gh pr merge ${prNumber} ${strategyFlag} --delete-branch`;
  const result = await run(command);

  return {
    ...result,
    command,
    prNumber,
    strategy,
  };
}

export function handleMergeResult(result: MergeCommandResult): MergeExecutionResult {
  const combinedOutput = `${result.stderr}\n${result.stdout}`.trim();
  const lowerOutput = combinedOutput.toLowerCase();

  if (result.exitCode === 0) {
    return {
      status: "success",
      message: `PR #${result.prNumber} merged successfully using \`${result.strategy}\` strategy.`,
      details: combinedOutput || undefined,
    };
  }

  if (lowerOutput.includes("conflict") || lowerOutput.includes("merge conflict")) {
    return {
      status: "conflict",
      message: "Merge failed due to conflicts.",
      remediation:
        "Rebase or merge the base branch into the PR branch, resolve conflicts, and retry merge.",
      details: combinedOutput || undefined,
    };
  }

  if (
    lowerOutput.includes("permission") ||
    lowerOutput.includes("resource not accessible") ||
    lowerOutput.includes("not authorized") ||
    lowerOutput.includes("forbidden")
  ) {
    return {
      status: "permission-denied",
      message: "Merge failed due to insufficient permissions.",
      remediation:
        "Request repository write/maintainer access, or ask an authorized reviewer to merge this PR.",
      details: combinedOutput || undefined,
    };
  }

  return {
    status: "failed",
    message: "Merge failed.",
    remediation: "Review the gh output details and resolve the reported issue before retrying.",
    details: combinedOutput || undefined,
  };
}
