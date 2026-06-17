import { logError } from "../../../shared/logger.js";
import type {
  CheckStatus,
  PrCheckRun,
  QualityCheck,
  QualitySection,
  ReviewContext,
  ReviewFinding,
} from "../types.js";

type CheckCategory = "lint" | "tests" | "typecheck" | "build" | "other";

const CATEGORY_PATTERNS: Record<Exclude<CheckCategory, "other">, RegExp[]> = {
  lint: [/\blint\b/i, /eslint/i, /prettier/i, /format/i],
  tests: [/\btest\b/i, /jest/i, /vitest/i, /cypress/i, /playwright/i, /e2e/i],
  typecheck: [/typecheck/i, /\btsc\b/i, /typescript/i, /pyright/i, /mypy/i],
  build: [/\bbuild\b/i, /compile/i, /bundle/i],
};

const FAIL_CONCLUSIONS = new Set([
  "FAILURE",
  "TIMED_OUT",
  "CANCELLED",
  "ACTION_REQUIRED",
  "STARTUP_FAILURE",
  "STALE",
]);

const PASS_CONCLUSIONS = new Set(["SUCCESS", "NEUTRAL"]);

function detectCategory(checkName: string): CheckCategory {
  for (const [category, patterns] of Object.entries(CATEGORY_PATTERNS) as Array<[
    Exclude<CheckCategory, "other">,
    RegExp[],
  ]>) {
    if (patterns.some((pattern) => pattern.test(checkName))) {
      return category;
    }
  }

  return "other";
}

function toCheckStatus(check: PrCheckRun): CheckStatus {
  const normalizedStatus = check.status.toUpperCase();
  const normalizedConclusion = check.conclusion?.toUpperCase() ?? null;

  if (normalizedStatus !== "COMPLETED") {
    return "pending";
  }

  if (normalizedConclusion === "SKIPPED") {
    return "skipped";
  }

  if (normalizedConclusion !== null && FAIL_CONCLUSIONS.has(normalizedConclusion)) {
    return "fail";
  }

  if (normalizedConclusion !== null && PASS_CONCLUSIONS.has(normalizedConclusion)) {
    return "pass";
  }

  return "pending";
}

function toQualityCheck(check: PrCheckRun): QualityCheck {
  const status = toCheckStatus(check);
  const category = detectCategory(check.name);

  return {
    name: check.name,
    status,
    detail: `${category} check (${check.status}${check.conclusion ? `/${check.conclusion}` : ""})`,
  };
}

function toFindings(checks: QualityCheck[]): ReviewFinding[] {
  const findings: ReviewFinding[] = [];

  for (const check of checks) {
    if (check.status === "fail") {
      const isHighRisk = check.detail?.startsWith("tests") || check.detail?.startsWith("typecheck");
      findings.push({
        severity: isHighRisk ? "high" : "medium",
        category: "quality",
        message: `Quality check failed: ${check.name}`,
        suggestion: "Address the failing check before merge.",
      });
    }

    if (check.status === "pending") {
      findings.push({
        severity: "low",
        category: "quality",
        message: `Quality check pending: ${check.name}`,
        suggestion: "Wait for completion or re-run the check.",
      });
    }
  }

  return findings;
}

function summarize(checks: QualityCheck[]): string {
  if (checks.length === 0) {
    return "No check-run data available; quality status is unknown.";
  }

  const totals = {
    pass: 0,
    fail: 0,
    pending: 0,
    skipped: 0,
  };

  for (const check of checks) {
    totals[check.status] += 1;
  }

  const base = `Quality checks: ${totals.pass} passed, ${totals.fail} failed, ${totals.pending} pending, ${totals.skipped} skipped.`;
  if (totals.fail > 0) {
    return `${base} Merge readiness is blocked by failing checks.`;
  }

  if (totals.pending > 0) {
    return `${base} Final quality verdict is pending.`;
  }

  return `${base} Quality gate is passing.`;
}

export function analyzeQuality(context: ReviewContext): QualitySection {
  try {
    const checks = context.checks.map(toQualityCheck);
    const findings = toFindings(checks);

    return {
      checks,
      findings,
      summary: summarize(checks),
    };
  } catch (error) {
    logError("Quality analyzer failed", error);
    return {
      checks: [],
      findings: [
        {
          severity: "medium",
          category: "quality",
          message: "Quality analysis failed; check-run status could not be evaluated.",
        },
      ],
      summary: "Quality analysis failed; unable to determine check-run status.",
    };
  }
}
