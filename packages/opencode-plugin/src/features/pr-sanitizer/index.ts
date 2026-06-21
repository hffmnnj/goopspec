/**
 * PR Sanitizer — GoopSpec terminology detection and replacement.
 *
 * Scans arbitrary text for GoopSpec-internal terms that should not appear
 * in public-facing PR titles, bodies, or branch names. Returns structured
 * violations with line/column positions and suggested plain-English
 * replacements.
 *
 * @module features/pr-sanitizer
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ViolationSeverity = "error" | "warn";

export interface TermRule {
  name: string;
  pattern: RegExp;
  replacement: string;
  severity: ViolationSeverity;
}

export interface Violation {
  term: string;
  match: string;
  line: number;
  column: number;
  severity: ViolationSeverity;
  replacement: string;
}

// ---------------------------------------------------------------------------
// Forbidden terms
// ---------------------------------------------------------------------------

/**
 * Comprehensive list of GoopSpec-internal terms that must not appear in
 * public PR content. Each rule uses word boundaries and case-insensitive
 * global matching.
 *
 * Order matters: more specific patterns (e.g. "wave N/N") are listed before
 * broader ones (e.g. standalone "wave") so that `scanForViolations` can
 * report the most precise match.
 */
export const FORBIDDEN_TERMS: TermRule[] = [
  {
    name: "wave N/N",
    pattern: /\bwave\s+\d+\/\d+\b/gi,
    replacement: "phase N of N",
    severity: "error",
  },
  {
    name: "wave standalone",
    pattern: /\bwaves?\b/gi,
    replacement: "phase",
    severity: "error",
  },
  {
    name: "task N.N",
    pattern: /\btask\s+\d+\.\d+\b/gi,
    replacement: "change",
    severity: "error",
  },
  {
    name: "nice-to-have",
    pattern: /\bnice[- ]?to[- ]?haves?\b/gi,
    replacement: "enhancement",
    severity: "error",
  },
  {
    name: "must-have",
    pattern: /\bmust[- ]?haves?\b/gi,
    replacement: "requirement",
    severity: "error",
  },
  {
    name: "MH-digits",
    pattern: /\bMH-\d+\b/gi,
    replacement: "requirement",
    severity: "error",
  },
  {
    name: "NH-digits",
    pattern: /\bNH-\d+\b/gi,
    replacement: "enhancement",
    severity: "error",
  },
  {
    name: "goop-executor variants",
    pattern: /\bgoop-executor(-\w+)?\b/gi,
    replacement: "agent",
    severity: "error",
  },
  {
    name: "executor",
    pattern: /\bexecutor\b/gi,
    replacement: "component",
    severity: "warn" as ViolationSeverity,
  },
  {
    name: "chronicle",
    pattern: /\bchronicle\b/gi,
    replacement: "change log",
    severity: "error",
  },
  {
    name: "ADL",
    pattern: /\bADL\b/gi,
    replacement: "decision log",
    severity: "error",
  },
  {
    name: "wiring task",
    pattern: /\bwiring\s+task\b/gi,
    replacement: "integration step",
    severity: "error",
  },
  {
    name: "spec locked",
    pattern: /\bspec\s+locked\b/gi,
    replacement: "requirements finalized",
    severity: "error",
  },
  {
    name: "acceptance gate",
    pattern: /\bacceptance\s+gate\b/gi,
    replacement: "review checkpoint",
    severity: "error",
  },
  {
    name: "deviation rule",
    pattern: /\bdeviation\s+rule\b/gi,
    replacement: "exception handling",
    severity: "error",
  },
  {
    name: "blueprint",
    pattern: /\bblueprint\b/gi,
    replacement: "plan",
    severity: "warn",
  },
  {
    name: "handoff",
    pattern: /\bhandoff\b/gi,
    replacement: "handover",
    severity: "warn",
  },
  {
    name: "goopspec",
    pattern: /\bgoopspec\b/gi,
    replacement: "the tool",
    severity: "warn",
  },
];

// ---------------------------------------------------------------------------
// Scanner
// ---------------------------------------------------------------------------

/**
 * Scan text for GoopSpec-internal terminology violations.
 *
 * Splits the input by newlines and runs every `TermRule` pattern against
 * each line. Returns a flat array of all violations with 1-indexed line
 * and column positions.
 */
export function scanForViolations(text: string): Violation[] {
  try {
    const lines = text.split("\n");
    const violations: Violation[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] as string;

      for (const rule of FORBIDDEN_TERMS) {
        rule.pattern.lastIndex = 0;
        let execResult = rule.pattern.exec(line);

        while (execResult !== null) {
          violations.push({
            term: rule.name,
            match: execResult[0],
            line: i + 1,
            column: execResult.index + 1,
            severity: rule.severity,
            replacement: rule.replacement,
          });
          execResult = rule.pattern.exec(line);
        }
      }
    }

    return violations;
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Auto-fix suggestion
// ---------------------------------------------------------------------------

/**
 * Apply all terminology replacements to the input text and return the
 * cleaned version.
 *
 * Processes replacements by iterating through each rule and applying
 * global regex replacement. Case of the original match is not preserved —
 * the canonical replacement string is used as-is.
 */
export function suggest(text: string): string {
  try {
    let result = text;

    for (const rule of FORBIDDEN_TERMS) {
      rule.pattern.lastIndex = 0;
      result = result.replace(rule.pattern, rule.replacement);
    }

    return result;
  } catch {
    return text;
  }
}
