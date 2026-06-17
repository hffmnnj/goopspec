/**
 * PR Review Fix Handlers
 *
 * Implements concrete fix handlers for lint/format, failing tests,
 * review comments, and missing requirement coverage.
 *
 * @module tools/goop-pr-review/fix-handlers
 */

import { log, logError } from "../../shared/logger.js";
import { exec, type ExecResult } from "./github.js";
import type { FixCategory, ReviewContext } from "./types.js";
import type { FixDelegationRequest, FixExecutionStatus } from "./fix-orchestrator.js";

export interface FixHandlerContext {
  category: FixCategory;
  reviewContext: ReviewContext;
}

export interface FixCommandExecution {
  command: string;
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface FixHandlerResult {
  status: FixExecutionStatus;
  message: string;
  delegated?: FixDelegationRequest;
  commands?: FixCommandExecution[];
}

export interface FixHandlerDependencies {
  run?: (cmd: string) => Promise<ExecResult>;
  delegateFix?: (request: FixDelegationRequest) => Promise<{
    status: FixExecutionStatus;
    message: string;
  }>;
}

const LINT_FIX_COMMANDS = ["bun run lint --fix", "bun run format"] as const;

const TESTS_DELEGATION: Omit<FixDelegationRequest, "category"> = {
  agent: "goop-executor-high",
  reason:
    "Failing test remediation may require implementation-level code changes beyond deterministic local autofixes.",
};

const COMMENTS_DELEGATION: Omit<FixDelegationRequest, "category"> = {
  agent: "goop-executor-medium",
  reason:
    "Review comment remediation can span multiple files and should follow repository conventions through an executor.",
};

const REQUIREMENTS_DELEGATION: Omit<FixDelegationRequest, "category"> = {
  agent: "goop-executor-high",
  reason:
    "Missing requirement remediation may involve architecture-sensitive implementation updates.",
};

function formatCommandFailure(command: string, result: ExecResult): string {
  const stderr = result.stderr.trim();
  if (stderr.length > 0) {
    return `${command} failed: ${stderr}`;
  }
  return `${command} failed with exit code ${result.exitCode}.`;
}

function hasFailingTestSignals(reviewContext: ReviewContext): boolean {
  const failedChecks = reviewContext.checks.some((check) => {
    const name = check.name.toLowerCase();
    return (
      name.includes("test") &&
      (check.conclusion ?? "").toLowerCase() === "failure"
    );
  });

  const failedComments = reviewContext.reviews.some((review) =>
    review.state.toLowerCase().includes("changes_requested"),
  );

  return failedChecks || failedComments;
}

function hasReviewCommentSignals(reviewContext: ReviewContext): boolean {
  if (reviewContext.comments.length > 0) {
    return true;
  }

  return reviewContext.reviews.some((review) => review.body.trim().length > 0);
}

function hasRequirementSignals(reviewContext: ReviewContext): boolean {
  return reviewContext.specAvailability.specExists;
}

async function runDelegatedFix(
  category: FixCategory,
  profile: Omit<FixDelegationRequest, "category">,
  deps: FixHandlerDependencies,
): Promise<FixHandlerResult> {
  const request: FixDelegationRequest = {
    category,
    agent: profile.agent,
    reason: profile.reason,
  };

  if (!deps.delegateFix) {
    return {
      status: "skipped",
      message: `No delegation function configured for '${category}' remediation.`,
      delegated: request,
    };
  }

  try {
    const delegatedResult = await deps.delegateFix(request);
    return {
      status: delegatedResult.status,
      message: delegatedResult.message,
      delegated: request,
    };
  } catch (error) {
    logError("Delegated fix execution failed", error);
    return {
      status: "failed",
      message: error instanceof Error ? error.message : "Delegated fix execution failed.",
      delegated: request,
    };
  }
}

/**
 * Apply deterministic lint/format remediations.
 */
export async function handleLintFormat(
  context: FixHandlerContext,
  deps: FixHandlerDependencies = {},
): Promise<FixHandlerResult> {
  const run = deps.run ?? exec;
  const commands: FixCommandExecution[] = [];

  log("Running lint/format handler", {
    prNumber: context.reviewContext.pr.number,
    category: context.category,
  });

  for (const command of LINT_FIX_COMMANDS) {
    const result = await run(command);
    commands.push({
      command,
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
    });

    if (result.exitCode !== 0) {
      return {
        status: "failed",
        message: formatCommandFailure(command, result),
        commands,
      };
    }
  }

  return {
    status: "applied",
    message: "Applied lint and format remediation commands.",
    commands,
  };
}

/**
 * Route failing test remediation through delegated executor support.
 */
export async function handleTestRemediation(
  context: FixHandlerContext,
  deps: FixHandlerDependencies = {},
): Promise<FixHandlerResult> {
  if (!hasFailingTestSignals(context.reviewContext)) {
    return {
      status: "skipped",
      message: "No failing test signals detected in review context.",
    };
  }

  return runDelegatedFix("tests", TESTS_DELEGATION, deps);
}

/**
 * Route review-comment remediation through delegated executor support.
 */
export async function handleCommentRemediation(
  context: FixHandlerContext,
  deps: FixHandlerDependencies = {},
): Promise<FixHandlerResult> {
  if (!hasReviewCommentSignals(context.reviewContext)) {
    return {
      status: "skipped",
      message: "No actionable review comments detected in review context.",
    };
  }

  return runDelegatedFix("comments", COMMENTS_DELEGATION, deps);
}

/**
 * Route missing requirement remediation through delegated executor support.
 */
export async function handleRequirementRemediation(
  context: FixHandlerContext,
  deps: FixHandlerDependencies = {},
): Promise<FixHandlerResult> {
  if (!hasRequirementSignals(context.reviewContext)) {
    return {
      status: "skipped",
      message: "Spec files are unavailable; requirement remediation skipped.",
    };
  }

  return runDelegatedFix("requirements", REQUIREMENTS_DELEGATION, deps);
}

export interface CreateFixHandlersOptions extends FixHandlerDependencies {}

/**
 * Build the default concrete fix-handler map.
 */
export function createFixHandlers(options: CreateFixHandlersOptions = {}) {
  return {
    lint: (context: FixHandlerContext) => handleLintFormat(context, options),
    tests: (context: FixHandlerContext) => handleTestRemediation(context, options),
    comments: (context: FixHandlerContext) => handleCommentRemediation(context, options),
    requirements: (context: FixHandlerContext) =>
      handleRequirementRemediation(context, options),
  };
}
