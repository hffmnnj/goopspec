import { logError } from "../../../shared/logger.js";
import type { ReviewContext, ReviewFinding, SecuritySection } from "../types.js";

interface SecuritySignal {
  category: string;
  severity: ReviewFinding["severity"];
  pattern: RegExp;
}

const SECURITY_SIGNALS: SecuritySignal[] = [
  { category: "security", severity: "critical", pattern: /auth(?:entication)?\s+bypass/i },
  { category: "security", severity: "high", pattern: /sql\s*injection/i },
  { category: "security", severity: "high", pattern: /command\s*injection/i },
  { category: "security", severity: "high", pattern: /\bxss\b|cross\s*site\s*scripting/i },
  { category: "security", severity: "high", pattern: /vulnerab(?:ility|le)|security\s+issue/i },
  { category: "security", severity: "critical", pattern: /\bcve[-\s:]?\d{4}-\d+/i },
  { category: "security", severity: "medium", pattern: /dependency\s+(?:risk|advisory|alert)/i },
];

const SECURITY_CHECK_PATTERNS = [
  /security/i,
  /codeql/i,
  /snyk/i,
  /trivy/i,
  /dependabot/i,
  /audit/i,
  /vulnerability/i,
];

function detectSignals(text: string): Array<Pick<ReviewFinding, "category" | "severity">> {
  const matches: Array<Pick<ReviewFinding, "category" | "severity">> = [];

  for (const signal of SECURITY_SIGNALS) {
    if (signal.pattern.test(text)) {
      matches.push({ category: signal.category, severity: signal.severity });
    }
  }

  return matches;
}

function summarize(findings: ReviewFinding[]): string {
  if (findings.length === 0) {
    return "No security-relevant signals detected in checks or discussion.";
  }

  const counts = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    info: 0,
  };

  for (const finding of findings) {
    counts[finding.severity] += 1;
  }

  const base = `Security findings: ${counts.critical} critical, ${counts.high} high, ${counts.medium} medium, ${counts.low} low.`;
  if (counts.critical > 0 || counts.high > 0) {
    return `${base} Immediate review is required before merge.`;
  }

  return `${base} No blocking security signal identified.`;
}

export function analyzeSecurity(context: ReviewContext): SecuritySection {
  try {
    const findings: ReviewFinding[] = [];

    for (const check of context.checks) {
      const checkName = check.name.toLowerCase();
      const isSecurityCheck = SECURITY_CHECK_PATTERNS.some((pattern) => pattern.test(checkName));

      if (isSecurityCheck && check.status.toUpperCase() === "COMPLETED") {
        const conclusion = check.conclusion?.toUpperCase() ?? "UNKNOWN";
        if (conclusion !== "SUCCESS" && conclusion !== "NEUTRAL" && conclusion !== "SKIPPED") {
          findings.push({
            severity: "high",
            category: "security",
            message: `Security-related check failed: ${check.name}`,
            suggestion: "Review check output and remediate vulnerabilities before merge.",
          });
        }
      }

      const signalText = `${check.name} ${check.conclusion ?? ""}`;
      for (const signal of detectSignals(signalText)) {
        findings.push({
          severity: signal.severity,
          category: signal.category,
          message: `Security keyword detected in check signal: ${check.name}`,
        });
      }
    }

    for (const review of context.reviews) {
      for (const signal of detectSignals(review.body)) {
        findings.push({
          severity: signal.severity,
          category: signal.category,
          message: `Security keyword detected in review by ${review.author}.`,
          suggestion: "Confirm the concern is addressed and documented.",
        });
      }
    }

    for (const comment of context.comments) {
      for (const signal of detectSignals(comment.body)) {
        findings.push({
          severity: signal.severity,
          category: signal.category,
          message: `Security keyword detected in discussion comment by ${comment.author}.`,
          suggestion: "Confirm the concern is addressed and documented.",
        });
      }
    }

    const deduped = findings.filter((finding, index, arr) => {
      return (
        arr.findIndex(
          (candidate) =>
            candidate.severity === finding.severity &&
            candidate.category === finding.category &&
            candidate.message === finding.message,
        ) === index
      );
    });

    return {
      findings: deduped,
      summary: summarize(deduped),
    };
  } catch (error) {
    logError("Security analyzer failed", error);
    return {
      findings: [
        {
          severity: "medium",
          category: "security",
          message: "Security analysis failed; findings may be incomplete.",
        },
      ],
      summary: "Security analysis failed; unable to evaluate all signals.",
    };
  }
}
