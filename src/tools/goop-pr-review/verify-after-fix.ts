/**
 * PR Review Post-Fix Verification
 *
 * Re-runs targeted checks after fix application and provides
 * rollback guidance when regressions are detected.
 *
 * @module tools/goop-pr-review/verify-after-fix
 */

import { log } from "../../shared/logger.js";
import { exec, type ExecResult } from "./github.js";
import type { FixCategory, ReviewContext } from "./types.js";

export interface VerificationCheckResult {
  name: string;
  command: string;
  passed: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface VerificationRollbackGuidance {
  reason: string;
  steps: string[];
}

export interface PostFixVerificationResult {
  status: "pass" | "fail" | "skipped";
  checks: VerificationCheckResult[];
  regressionsDetected: boolean;
  summary: string;
  rollbackGuidance?: VerificationRollbackGuidance;
}

export interface VerifyAfterFixOptions {
  run?: (cmd: string) => Promise<ExecResult>;
}

interface PlannedCheck {
  name: string;
  command: string;
}

function dedupePlannedChecks(checks: PlannedCheck[]): PlannedCheck[] {
  const seen = new Set<string>();
  const unique: PlannedCheck[] = [];

  for (const check of checks) {
    if (seen.has(check.command)) {
      continue;
    }
    seen.add(check.command);
    unique.push(check);
  }

  return unique;
}

function planChecks(categories: FixCategory[]): PlannedCheck[] {
  const checks: PlannedCheck[] = [];

  for (const category of categories) {
    if (category === "lint") {
      checks.push({ name: "lint", command: "bun run lint" });
      checks.push({ name: "typecheck", command: "bun run typecheck" });
      continue;
    }

    if (category === "tests") {
      checks.push({ name: "tests", command: "bun test" });
      checks.push({ name: "typecheck", command: "bun run typecheck" });
      continue;
    }

    if (category === "comments" || category === "requirements") {
      checks.push({ name: "tests", command: "bun test" });
      checks.push({ name: "typecheck", command: "bun run typecheck" });
      continue;
    }
  }

  return dedupePlannedChecks(checks);
}

function createRollbackGuidance(
  reviewContext: ReviewContext,
  failedChecks: VerificationCheckResult[],
): VerificationRollbackGuidance {
  const failingNames = failedChecks.map((check) => check.name).join(", ");
  return {
    reason: `Post-fix verification failed (${failingNames}). Fixes may have introduced regressions.`,
    steps: [
      "Review current workspace changes with `git status` and `git diff`.",
      "Isolate failing fix category changes and revert only problematic edits.",
      "Re-run verification commands after rollback before retrying fixes.",
      `Use PR #${reviewContext.pr.number} baseline to compare expected behavior before reapplying fixes.`,
    ],
  };
}

/**
 * Run targeted verification checks after fix handlers complete.
 */
export async function verifyAfterFix(
  reviewContext: ReviewContext,
  appliedCategories: FixCategory[],
  options: VerifyAfterFixOptions = {},
): Promise<PostFixVerificationResult> {
  if (appliedCategories.length === 0) {
    return {
      status: "skipped",
      checks: [],
      regressionsDetected: false,
      summary: "No fixes were applied; post-fix verification skipped.",
    };
  }

  const run = options.run ?? exec;
  const plannedChecks = planChecks(appliedCategories);
  const checks: VerificationCheckResult[] = [];

  log("Running post-fix verification", {
    prNumber: reviewContext.pr.number,
    categories: appliedCategories,
    checkCount: plannedChecks.length,
  });

  for (const planned of plannedChecks) {
    const result = await run(planned.command);
    checks.push({
      name: planned.name,
      command: planned.command,
      passed: result.exitCode === 0,
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
    });
  }

  const failedChecks = checks.filter((check) => !check.passed);
  if (failedChecks.length > 0) {
    return {
      status: "fail",
      checks,
      regressionsDetected: true,
      summary: `Post-fix verification failed for ${failedChecks.length} check(s).`,
      rollbackGuidance: createRollbackGuidance(reviewContext, failedChecks),
    };
  }

  return {
    status: "pass",
    checks,
    regressionsDetected: false,
    summary: `Post-fix verification passed (${checks.length} check(s)).`,
  };
}
