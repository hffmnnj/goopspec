/**
 * PR Review Report Formatter
 *
 * Renders analyzer outputs as a structured, human-readable CLI report
 * with four sections: quality, security, spec alignment, and change summary.
 *
 * @module tools/goop-pr-review/report
 */

import type {
  ReviewReport,
  QualitySection,
  SecuritySection,
  SpecSection,
  ChangeSummarySection,
  ReviewFinding,
  FindingSeverity,
  CheckStatus,
} from "./types.js";

// ============================================================================
// Severity & Status Formatting
// ============================================================================

const SEVERITY_ICONS: Record<FindingSeverity, string> = {
  critical: "🔴",
  high: "🟠",
  medium: "🟡",
  low: "🔵",
  info: "⚪",
};

const SEVERITY_LABELS: Record<FindingSeverity, string> = {
  critical: "CRITICAL",
  high: "HIGH",
  medium: "MEDIUM",
  low: "LOW",
  info: "INFO",
};

const CHECK_STATUS_ICONS: Record<CheckStatus, string> = {
  pass: "✓",
  fail: "✗",
  pending: "○",
  skipped: "⊘",
};

// ============================================================================
// Section Formatters
// ============================================================================

function formatFinding(finding: ReviewFinding): string {
  const icon = SEVERITY_ICONS[finding.severity];
  const label = SEVERITY_LABELS[finding.severity];
  const location = finding.file
    ? ` (${finding.file}${finding.line ? `:${finding.line}` : ""})`
    : "";
  const suggestion = finding.suggestion ? `\n     → ${finding.suggestion}` : "";

  return `  ${icon} [${label}] ${finding.message}${location}${suggestion}`;
}

function formatQualitySection(quality: QualitySection): string {
  const lines: string[] = [];
  lines.push("### Quality");
  lines.push("");

  if (quality.checks.length > 0) {
    lines.push("  Checks:");
    for (const check of quality.checks) {
      const icon = CHECK_STATUS_ICONS[check.status];
      const detail = check.detail ? ` — ${check.detail}` : "";
      lines.push(`    ${icon} ${check.name}${detail}`);
    }
    lines.push("");
  }

  if (quality.findings.length > 0) {
    lines.push("  Findings:");
    for (const finding of quality.findings) {
      lines.push(formatFinding(finding));
    }
    lines.push("");
  }

  lines.push(`  Summary: ${quality.summary}`);
  return lines.join("\n");
}

function formatSecuritySection(security: SecuritySection): string {
  const lines: string[] = [];
  lines.push("### Security");
  lines.push("");

  if (security.findings.length > 0) {
    lines.push("  Findings:");
    for (const finding of security.findings) {
      lines.push(formatFinding(finding));
    }
    lines.push("");
  }

  lines.push(`  Summary: ${security.summary}`);
  return lines.join("\n");
}

function formatSpecSection(spec: SpecSection): string {
  const lines: string[] = [];
  lines.push("### Spec Alignment");
  lines.push("");

  if (!spec.available) {
    lines.push("  No spec files detected. Spec alignment checks skipped.");
    return lines.join("\n");
  }

  if (spec.requirements.length > 0) {
    lines.push("  Requirements:");
    for (const req of spec.requirements) {
      const icon = req.covered ? "✓" : "✗";
      const evidence = req.evidence ? ` — ${req.evidence}` : "";
      lines.push(`    ${icon} ${req.id}: ${req.description}${evidence}`);
    }
    lines.push("");
  }

  if (spec.findings.length > 0) {
    lines.push("  Findings:");
    for (const finding of spec.findings) {
      lines.push(formatFinding(finding));
    }
    lines.push("");
  }

  lines.push(`  Summary: ${spec.summary}`);
  return lines.join("\n");
}

function formatChangeSummarySection(changeSummary: ChangeSummarySection): string {
  const lines: string[] = [];
  lines.push("### Change Summary");
  lines.push("");

  lines.push(`  +${changeSummary.additions} / -${changeSummary.deletions}`);

  if (changeSummary.filesChanged.length > 0) {
    const displayCount = Math.min(changeSummary.filesChanged.length, 15);
    const remaining = changeSummary.filesChanged.length - displayCount;

    lines.push("");
    lines.push("  Files:");
    for (const file of changeSummary.filesChanged.slice(0, displayCount)) {
      lines.push(`    • ${file}`);
    }
    if (remaining > 0) {
      lines.push(`    … and ${remaining} more`);
    }
  }

  lines.push("");
  lines.push(`  Summary: ${changeSummary.summary}`);
  return lines.join("\n");
}

// ============================================================================
// Verdict Formatting
// ============================================================================

function formatVerdict(report: ReviewReport): string {
  const lines: string[] = [];
  lines.push("### Verdict");
  lines.push("");

  switch (report.verdict) {
    case "approve":
      lines.push("  ✅ APPROVE — No blocking issues found.");
      break;
    case "request-changes":
      lines.push("  ⚠️  CHANGES REQUESTED — Issues require attention before merge.");
      break;
    case "comment":
      lines.push("  💬 COMMENT — Review complete with observations.");
      break;
  }

  return lines.join("\n");
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Format a complete review report as a human-readable CLI string.
 *
 * Renders four sections (quality, security, spec, summary) plus
 * an overall verdict. Designed for terminal display with clear
 * visual hierarchy and severity indicators.
 */
export function formatReviewReport(report: ReviewReport): string {
  const lines: string[] = [];

  // Header
  lines.push(`## PR Review Report — #${report.pr.number}: ${report.pr.title}`);
  lines.push("");
  lines.push(`Author: ${report.pr.author} | Branch: \`${report.pr.sourceBranch}\` → \`${report.pr.targetBranch}\``);
  lines.push("");
  lines.push("---");
  lines.push("");

  // Sections
  lines.push(formatQualitySection(report.quality));
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push(formatSecuritySection(report.security));
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push(formatSpecSection(report.spec));
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push(formatChangeSummarySection(report.changeSummary));
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push(formatVerdict(report));

  return lines.join("\n");
}

/**
 * Count total findings across all report sections, optionally filtered by minimum severity.
 */
export function countFindings(
  report: ReviewReport,
  minSeverity?: FindingSeverity,
): number {
  const allFindings = [
    ...report.quality.findings,
    ...report.security.findings,
    ...report.spec.findings,
  ];

  if (!minSeverity) {
    return allFindings.length;
  }

  const severityOrder: FindingSeverity[] = ["critical", "high", "medium", "low", "info"];
  const threshold = severityOrder.indexOf(minSeverity);

  return allFindings.filter(
    (f) => severityOrder.indexOf(f.severity) <= threshold,
  ).length;
}

/**
 * Determine the overall review verdict from report findings.
 *
 * - `request-changes` if any critical or high severity findings exist
 * - `approve` if no findings at all
 * - `comment` otherwise
 */
export function deriveVerdict(report: ReviewReport): ReviewReport["verdict"] {
  const criticalOrHigh = countFindings(report, "high");
  if (criticalOrHigh > 0) {
    return "request-changes";
  }

  const total = countFindings(report);
  if (total === 0) {
    return "approve";
  }

  return "comment";
}
