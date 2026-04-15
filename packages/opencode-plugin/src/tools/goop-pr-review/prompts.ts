/**
 * PR Review Interactive Prompts
 *
 * Provides the fix-option multi-select menu and dirty-worktree
 * warning for the PR review command flow.
 *
 * @module tools/goop-pr-review/prompts
 */

import type { ExecResult } from "./github.js";
import { exec } from "./github.js";
import { FIX_CATEGORIES, type FixCategory, type ReviewReport } from "./types.js";

// ============================================================================
// Fix Category Metadata
// ============================================================================

interface FixCategoryOption {
  value: FixCategory;
  label: string;
  hint: string;
}

const FIX_CATEGORY_OPTIONS: FixCategoryOption[] = [
  {
    value: "lint",
    label: "Lint & Format",
    hint: "Auto-fix linting and formatting issues",
  },
  {
    value: "tests",
    label: "Failing Tests",
    hint: "Attempt to remediate failing test cases",
  },
  {
    value: "comments",
    label: "Review Comments",
    hint: "Address unresolved review feedback",
  },
  {
    value: "requirements",
    label: "Missing Requirements",
    hint: "Fill gaps in spec requirement coverage",
  },
];

// ============================================================================
// Dirty Worktree Detection
// ============================================================================

export interface DirtyWorktreeResult {
  clean: boolean;
  warning?: string;
  changedFiles?: string[];
}

/**
 * Check the working directory for uncommitted changes and produce
 * a warning message if the worktree is dirty.
 *
 * Returns a structured result so callers can decide how to surface
 * the warning (inline text, prompt, etc.).
 */
export async function checkDirtyWorktree(
  run: (cmd: string) => Promise<ExecResult> = exec,
): Promise<DirtyWorktreeResult> {
  try {
    const result = await run("git status --porcelain");

    if (result.exitCode !== 0) {
      // Not a git repo or git unavailable — treat as clean
      return { clean: true };
    }

    const output = result.stdout.trim();
    if (output === "") {
      return { clean: true };
    }

    const changedFiles = output
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    return {
      clean: false,
      warning: `Working directory has ${changedFiles.length} uncommitted change(s). Fix operations may conflict with existing modifications.`,
      changedFiles,
    };
  } catch {
    return { clean: true };
  }
}

/**
 * Format a dirty-worktree warning as a displayable string block.
 * Returns empty string if the worktree is clean.
 */
export function formatDirtyWorktreeWarning(result: DirtyWorktreeResult): string {
  if (result.clean) {
    return "";
  }

  const lines: string[] = [];
  lines.push("⚠️  Dirty Working Directory");
  lines.push("");
  lines.push(result.warning ?? "Uncommitted changes detected.");

  if (result.changedFiles && result.changedFiles.length > 0) {
    const displayCount = Math.min(result.changedFiles.length, 5);
    lines.push("");
    for (const file of result.changedFiles.slice(0, displayCount)) {
      lines.push(`  ${file}`);
    }
    const remaining = result.changedFiles.length - displayCount;
    if (remaining > 0) {
      lines.push(`  … and ${remaining} more`);
    }
  }

  lines.push("");
  lines.push("Consider committing or stashing changes before applying fixes.");

  return lines.join("\n");
}

// ============================================================================
// Fix Option Selection
// ============================================================================

/**
 * Determine which fix categories are relevant based on report findings.
 *
 * Only categories with actionable findings are offered:
 * - `lint`: quality findings from lint/format checks
 * - `tests`: quality findings from test checks
 * - `comments`: review comments with change requests
 * - `requirements`: uncovered spec requirements (when spec is available)
 */
export function getAvailableFixOptions(report: ReviewReport): FixCategoryOption[] {
  const available: FixCategoryOption[] = [];

  // Lint: any quality finding mentioning lint/format or failing lint checks
  const hasLintIssues = report.quality.findings.some(
    (f) =>
      f.message.toLowerCase().includes("lint") ||
      f.message.toLowerCase().includes("format"),
  ) || report.quality.checks.some(
    (c) => c.status === "fail" && (c.detail?.includes("lint") || c.name.toLowerCase().includes("lint")),
  );

  if (hasLintIssues) {
    available.push(FIX_CATEGORY_OPTIONS[0]);
  }

  // Tests: any quality finding mentioning test or failing test checks
  const hasTestIssues = report.quality.findings.some(
    (f) => f.message.toLowerCase().includes("test"),
  ) || report.quality.checks.some(
    (c) => c.status === "fail" && (c.detail?.includes("tests") || c.name.toLowerCase().includes("test")),
  );

  if (hasTestIssues) {
    available.push(FIX_CATEGORY_OPTIONS[1]);
  }

  // Comments: review comments requesting changes
  const hasCommentIssues = report.quality.findings.some(
    (f) => f.message.toLowerCase().includes("comment"),
  ) || report.security.findings.some(
    (f) => f.message.toLowerCase().includes("review") || f.message.toLowerCase().includes("comment"),
  );

  if (hasCommentIssues) {
    available.push(FIX_CATEGORY_OPTIONS[2]);
  }

  // Requirements: uncovered spec requirements
  const hasRequirementGaps =
    report.spec.available &&
    report.spec.requirements.some((r) => !r.covered);

  if (hasRequirementGaps) {
    available.push(FIX_CATEGORY_OPTIONS[3]);
  }

  return available;
}

/**
 * Build the fix-option prompt text for display.
 *
 * Returns a structured string showing available fix categories
 * with descriptions, suitable for rendering in a tool response
 * where the agent can present choices to the user.
 *
 * @param report - The completed review report
 * @param worktreeResult - Dirty worktree check result
 * @returns Formatted prompt text, or null if no fixes are available
 */
export function buildFixOptionsPrompt(
  report: ReviewReport,
  worktreeResult: DirtyWorktreeResult,
): string | null {
  const available = getAvailableFixOptions(report);

  if (available.length === 0) {
    return null;
  }

  const lines: string[] = [];

  // Surface dirty worktree warning first
  const worktreeWarning = formatDirtyWorktreeWarning(worktreeResult);
  if (worktreeWarning) {
    lines.push(worktreeWarning);
    lines.push("");
    lines.push("---");
    lines.push("");
  }

  lines.push("### Available Fix Options");
  lines.push("");
  lines.push("Select which fixes to apply:");
  lines.push("");

  for (let i = 0; i < available.length; i++) {
    const opt = available[i];
    lines.push(`  ${i + 1}. **${opt.label}** (${opt.value})`);
    lines.push(`     ${opt.hint}`);
  }

  lines.push("");
  lines.push("Provide your selection as a comma-separated list of category names");
  lines.push(`(e.g., \`lint,tests\`) or \`all\` to apply all available fixes.`);
  lines.push("Enter `none` to skip fixes.");

  return lines.join("\n");
}

/**
 * Parse user fix selection input into validated fix categories.
 *
 * Accepts:
 * - Comma-separated category names: "lint,tests"
 * - "all" to select all available options
 * - "none" or empty to skip
 *
 * Returns only categories that are both valid and available.
 */
export function parseFixSelection(
  input: string,
  availableOptions: FixCategoryOption[],
): FixCategory[] {
  const trimmed = input.trim().toLowerCase();

  if (trimmed === "" || trimmed === "none" || trimmed === "skip") {
    return [];
  }

  const availableValues = new Set(availableOptions.map((o) => o.value));

  if (trimmed === "all") {
    return availableOptions.map((o) => o.value);
  }

  const requested = trimmed
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const valid: FixCategory[] = [];
  for (const item of requested) {
    if (
      (FIX_CATEGORIES as readonly string[]).includes(item) &&
      availableValues.has(item as FixCategory)
    ) {
      valid.push(item as FixCategory);
    }
  }

  return valid;
}

/**
 * Get all fix category option metadata (for testing and display).
 */
export function getAllFixCategoryOptions(): FixCategoryOption[] {
  return [...FIX_CATEGORY_OPTIONS];
}
