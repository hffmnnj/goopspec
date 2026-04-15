/**
 * Tests for PR Review: types, spec-context detection, preflight, resolver, and context builder
 * @module tools/goop-pr-review/index.test
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import {
  createMockPluginContext,
  createMockToolContext,
  setupTestEnvironment,
  type PluginContext,
} from "../../test-utils.js";
import { createGoopPrReviewTool } from "./index.js";
import {
  ghPreflight,
  resolvePr,
  parsePrInput,
  formatPrSummary,
  fetchPrFiles,
  fetchPrChecks,
  fetchPrReviews,
  fetchPrComments,
  type ExecResult,
} from "./github.js";
import {
  PrMetadataSchema,
  createDefaultReport,
  createEmptyQualitySection,
  createEmptySecuritySection,
  createNoSpecSection,
  createEmptyChangeSummary,
  type PrMetadata,
  type ReviewReport,
  type QualitySection,
  type SecuritySection,
  type SpecSection,
  type ChangeSummarySection,
  type ReviewFinding,
  type FixCategory,
  type ReviewContext,
  FIX_CATEGORIES,
  FINDING_SEVERITIES,
  CHECK_STATUSES,
  REVIEW_VERDICTS,
} from "./types.js";
import { detectSpecContext, isSpecModeEnabled } from "./spec-context.js";
import {
  buildReviewContext,
  clearContextCache,
  hasCachedContext,
  isWorkingDirectoryClean,
} from "./context.js";
import { analyzeQuality } from "./analyzers/quality.js";
import { analyzeSecurity } from "./analyzers/security.js";
import { analyzeSpecAlignment } from "./analyzers/spec.js";
import { formatReviewReport, countFindings, deriveVerdict } from "./report.js";
import {
  checkDirtyWorktree,
  formatDirtyWorktreeWarning,
  buildFixOptionsPrompt,
  getAvailableFixOptions,
  parseFixSelection,
  getAllFixCategoryOptions,
  type DirtyWorktreeResult,
} from "./prompts.js";
import { orchestrateFixes, type FixHandler } from "./fix-orchestrator.js";
import {
  createFixHandlers,
  handleLintFormat,
  handleTestRemediation,
  handleCommentRemediation,
  handleRequirementRemediation,
} from "./fix-handlers.js";
import { verifyAfterFix } from "./verify-after-fix.js";
import {
  promptMergeStrategy,
  confirmMerge,
  executeMerge,
  handleMergeResult,
  type MergeCommandResult,
} from "./merge.js";

// ============================================================================
// Fixtures
// ============================================================================

function validPrMetadata(): PrMetadata {
  return {
    number: 42,
    title: "Add user authentication",
    author: "dev-user",
    sourceBranch: "feat/auth",
    targetBranch: "main",
    state: "open",
    url: "https://github.com/org/repo/pull/42",
    additions: 150,
    deletions: 30,
    changedFiles: 8,
  };
}

// ============================================================================
// Report Schema Tests
// ============================================================================

describe("report-schema", () => {
  describe("PrMetadataSchema validation", () => {
    it("accepts valid PR metadata", () => {
      const result = PrMetadataSchema.safeParse(validPrMetadata());
      expect(result.success).toBe(true);
    });

    it("rejects missing required fields", () => {
      const result = PrMetadataSchema.safeParse({ number: 1 });
      expect(result.success).toBe(false);
    });

    it("rejects invalid state value", () => {
      const data = { ...validPrMetadata(), state: "draft" };
      const result = PrMetadataSchema.safeParse(data);
      expect(result.success).toBe(false);
    });

    it("defaults additions/deletions/changedFiles to 0", () => {
      const minimal = {
        number: 1,
        title: "Test",
        author: "user",
        sourceBranch: "feat/x",
        targetBranch: "main",
        state: "open",
        url: "https://github.com/org/repo/pull/1",
      };
      const result = PrMetadataSchema.safeParse(minimal);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.additions).toBe(0);
        expect(result.data.deletions).toBe(0);
        expect(result.data.changedFiles).toBe(0);
      }
    });
  });

  describe("constant arrays", () => {
    it("defines expected finding severities", () => {
      expect(FINDING_SEVERITIES).toContain("critical");
      expect(FINDING_SEVERITIES).toContain("info");
      expect(FINDING_SEVERITIES.length).toBe(5);
    });

    it("defines expected check statuses", () => {
      expect(CHECK_STATUSES).toContain("pass");
      expect(CHECK_STATUSES).toContain("fail");
      expect(CHECK_STATUSES.length).toBe(4);
    });

    it("defines expected review verdicts", () => {
      expect(REVIEW_VERDICTS).toContain("approve");
      expect(REVIEW_VERDICTS).toContain("request-changes");
      expect(REVIEW_VERDICTS.length).toBe(3);
    });

    it("defines expected fix categories", () => {
      expect(FIX_CATEGORIES).toContain("lint");
      expect(FIX_CATEGORIES).toContain("tests");
      expect(FIX_CATEGORIES).toContain("comments");
      expect(FIX_CATEGORIES).toContain("requirements");
      expect(FIX_CATEGORIES.length).toBe(4);
    });
  });

  describe("factory helpers", () => {
    it("creates empty quality section", () => {
      const section: QualitySection = createEmptyQualitySection();
      expect(section.checks).toEqual([]);
      expect(section.findings).toEqual([]);
      expect(section.summary).toBeTruthy();
    });

    it("creates empty security section", () => {
      const section: SecuritySection = createEmptySecuritySection();
      expect(section.findings).toEqual([]);
      expect(section.summary).toBeTruthy();
    });

    it("creates no-spec section with available=false", () => {
      const section: SpecSection = createNoSpecSection();
      expect(section.available).toBe(false);
      expect(section.requirements).toEqual([]);
      expect(section.summary).toContain("skipped");
    });

    it("creates empty change summary", () => {
      const section: ChangeSummarySection = createEmptyChangeSummary();
      expect(section.filesChanged).toEqual([]);
      expect(section.additions).toBe(0);
      expect(section.deletions).toBe(0);
    });
  });

  describe("createDefaultReport", () => {
    it("creates report with spec mode enabled", () => {
      const pr = validPrMetadata();
      const report: ReviewReport = createDefaultReport(pr, true);

      expect(report.pr).toEqual(pr);
      expect(report.spec.available).toBe(true);
      expect(report.verdict).toBe("comment");
      expect(report.fixOptions).toEqual([]);
      expect(report.generatedAt).toBeTruthy();
      expect(report.changeSummary.additions).toBe(150);
      expect(report.changeSummary.deletions).toBe(30);
    });

    it("creates report with spec mode disabled", () => {
      const pr = validPrMetadata();
      const report: ReviewReport = createDefaultReport(pr, false);

      expect(report.spec.available).toBe(false);
      expect(report.spec.summary).toContain("skipped");
    });

    it("populates change summary from PR metadata", () => {
      const pr = validPrMetadata();
      const report = createDefaultReport(pr, false);

      expect(report.changeSummary.summary).toContain("8 file(s)");
      expect(report.changeSummary.summary).toContain("+150");
      expect(report.changeSummary.summary).toContain("-30");
    });
  });

  describe("type contracts", () => {
    it("ReviewFinding supports optional fields", () => {
      const finding: ReviewFinding = {
        severity: "high",
        category: "security",
        message: "Hardcoded secret detected",
      };
      expect(finding.file).toBeUndefined();
      expect(finding.line).toBeUndefined();
      expect(finding.suggestion).toBeUndefined();
    });

    it("ReviewFinding supports all optional fields populated", () => {
      const finding: ReviewFinding = {
        severity: "medium",
        category: "quality",
        message: "Unused import",
        file: "src/index.ts",
        line: 5,
        suggestion: "Remove unused import",
      };
      expect(finding.file).toBe("src/index.ts");
      expect(finding.line).toBe(5);
      expect(finding.suggestion).toBeTruthy();
    });

    it("FixCategory values match spec requirements", () => {
      const categories: FixCategory[] = [...FIX_CATEGORIES];
      expect(categories).toContain("lint");
      expect(categories).toContain("tests");
      expect(categories).toContain("comments");
      expect(categories).toContain("requirements");
    });
  });
});

// ============================================================================
// Spec Context Tests
// ============================================================================

describe("spec-context", () => {
  let testDir: string;
  let cleanup: () => void;

  beforeEach(() => {
    const env = setupTestEnvironment("pr-review-spec-ctx");
    testDir = env.testDir;
    cleanup = env.cleanup;
  });

  afterEach(() => {
    cleanup();
  });

  describe("detectSpecContext", () => {
    it("detects both files present", () => {
      writeFileSync(join(testDir, ".goopspec", "SPEC.md"), "# Spec");
      writeFileSync(join(testDir, ".goopspec", "BLUEPRINT.md"), "# Blueprint");

      const result = detectSpecContext(testDir);

      expect(result.specExists).toBe(true);
      expect(result.blueprintExists).toBe(true);
      expect(result.specPath).toContain("SPEC.md");
      expect(result.blueprintPath).toContain("BLUEPRINT.md");
    });

    it("detects only SPEC.md present", () => {
      writeFileSync(join(testDir, ".goopspec", "SPEC.md"), "# Spec");

      const result = detectSpecContext(testDir);

      expect(result.specExists).toBe(true);
      expect(result.blueprintExists).toBe(false);
    });

    it("detects only BLUEPRINT.md present", () => {
      writeFileSync(join(testDir, ".goopspec", "BLUEPRINT.md"), "# Blueprint");

      const result = detectSpecContext(testDir);

      expect(result.specExists).toBe(false);
      expect(result.blueprintExists).toBe(true);
    });

    it("detects neither file present", () => {
      const result = detectSpecContext(testDir);

      expect(result.specExists).toBe(false);
      expect(result.blueprintExists).toBe(false);
    });

    it("handles missing .goopspec directory", () => {
      const emptyDir = join(testDir, "empty-project");
      mkdirSync(emptyDir, { recursive: true });

      const result = detectSpecContext(emptyDir);

      expect(result.specExists).toBe(false);
      expect(result.blueprintExists).toBe(false);
    });

    it("returns correct absolute paths", () => {
      const result = detectSpecContext(testDir);

      expect(result.specPath).toBe(join(testDir, ".goopspec", "SPEC.md"));
      expect(result.blueprintPath).toBe(join(testDir, ".goopspec", "BLUEPRINT.md"));
    });
  });

  describe("isSpecModeEnabled", () => {
    it("returns true when SPEC.md exists", () => {
      writeFileSync(join(testDir, ".goopspec", "SPEC.md"), "# Spec");
      const availability = detectSpecContext(testDir);

      expect(isSpecModeEnabled(availability)).toBe(true);
    });

    it("returns true when both files exist", () => {
      writeFileSync(join(testDir, ".goopspec", "SPEC.md"), "# Spec");
      writeFileSync(join(testDir, ".goopspec", "BLUEPRINT.md"), "# Blueprint");
      const availability = detectSpecContext(testDir);

      expect(isSpecModeEnabled(availability)).toBe(true);
    });

    it("returns false when only BLUEPRINT.md exists", () => {
      writeFileSync(join(testDir, ".goopspec", "BLUEPRINT.md"), "# Blueprint");
      const availability = detectSpecContext(testDir);

      expect(isSpecModeEnabled(availability)).toBe(false);
    });

    it("returns false when no spec files exist", () => {
      const availability = detectSpecContext(testDir);

      expect(isSpecModeEnabled(availability)).toBe(false);
    });
  });
});

// ============================================================================
// Test Helpers for gh mock
// ============================================================================

function mockExec(overrides: Partial<ExecResult> = {}): (cmd: string) => Promise<ExecResult> {
  return async () => ({
    stdout: "",
    stderr: "",
    exitCode: 0,
    ...overrides,
  });
}

function mockExecByCommand(
  handlers: Record<string, Partial<ExecResult>>,
): (cmd: string) => Promise<ExecResult> {
  return async (cmd: string) => {
    for (const [pattern, result] of Object.entries(handlers)) {
      if (cmd.includes(pattern)) {
        return { stdout: "", stderr: "", exitCode: 0, ...result };
      }
    }
    return { stdout: "", stderr: "unknown command", exitCode: 1 };
  };
}

const SAMPLE_PR_JSON: string = JSON.stringify({
  number: 42,
  title: "Add user authentication",
  author: { login: "octocat" },
  state: "OPEN",
  headRefName: "feat/auth",
  baseRefName: "main",
  url: "https://github.com/owner/repo/pull/42",
  additions: 150,
  deletions: 30,
  changedFiles: 8,
  isDraft: false,
});

// ============================================================================
// parsePrInput
// ============================================================================

describe("parsePrInput", () => {
  it("parses plain number", () => {
    expect(parsePrInput("42")).toBe(42);
  });

  it("parses number with whitespace", () => {
    expect(parsePrInput("  42  ")).toBe(42);
  });

  it("parses GitHub URL", () => {
    expect(parsePrInput("https://github.com/owner/repo/pull/99")).toBe(99);
  });

  it("parses GitHub URL with trailing slash", () => {
    expect(parsePrInput("https://github.com/owner/repo/pull/7/")).toBe(7);
  });

  it("parses GitHub URL with extra path segments", () => {
    expect(parsePrInput("https://github.com/owner/repo/pull/7/files")).toBe(7);
  });

  it("returns null for non-numeric text", () => {
    expect(parsePrInput("not-a-number")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parsePrInput("")).toBeNull();
  });

  it("returns null for URL without pull segment", () => {
    expect(parsePrInput("https://github.com/owner/repo/issues/5")).toBeNull();
  });
});

// ============================================================================
// ghPreflight
// ============================================================================

describe("preflight", () => {
  it("succeeds when gh is installed and authenticated", async () => {
    const run = mockExecByCommand({
      "gh --version": { stdout: "gh version 2.45.0 (2024-01-01)" },
      "gh auth status": { stdout: "Logged in to github.com" },
    });

    const result = await ghPreflight(run);

    expect(result.ok).toBe(true);
    expect(result.ghVersion).toBe("2.45.0");
    expect(result.authenticated).toBe(true);
  });

  it("fails when gh is not installed", async () => {
    const run = mockExec({ exitCode: 127, stderr: "command not found: gh" });

    const result = await ghPreflight(run);

    expect(result.ok).toBe(false);
    expect(result.error).toContain("not installed");
    expect(result.remediation).toContain("https://cli.github.com/");
  });

  it("fails when gh is not authenticated", async () => {
    const run = mockExecByCommand({
      "gh --version": { stdout: "gh version 2.45.0 (2024-01-01)" },
      "gh auth status": { exitCode: 1, stderr: "not logged in" },
    });

    const result = await ghPreflight(run);

    expect(result.ok).toBe(false);
    expect(result.authenticated).toBe(false);
    expect(result.error).toContain("not authenticated");
    expect(result.remediation).toContain("gh auth login");
  });

  it("extracts version even with multi-line output", async () => {
    const run = mockExecByCommand({
      "gh --version": {
        stdout: "gh version 2.50.0 (2024-06-01)\nhttps://github.com/cli/cli/releases/tag/v2.50.0",
      },
      "gh auth status": { stdout: "Logged in" },
    });

    const result = await ghPreflight(run);

    expect(result.ok).toBe(true);
    expect(result.ghVersion).toBe("2.50.0");
  });
});

// ============================================================================
// resolvePr
// ============================================================================

describe("resolver", () => {
  it("resolves an open PR by number", async () => {
    const run = mockExecByCommand({
      "gh pr view": { stdout: SAMPLE_PR_JSON },
    });

    const result = await resolvePr("42", run);

    expect(result.ok).toBe(true);
    expect(result.pr).toBeDefined();
    expect(result.pr!.number).toBe(42);
    expect(result.pr!.title).toBe("Add user authentication");
    expect(result.pr!.author).toBe("octocat");
    expect(result.pr!.state).toBe("open");
    expect(result.pr!.sourceBranch).toBe("feat/auth");
    expect(result.pr!.targetBranch).toBe("main");
    expect(result.pr!.additions).toBe(150);
    expect(result.pr!.deletions).toBe(30);
    expect(result.pr!.changedFiles).toBe(8);
  });

  it("resolves a PR from a GitHub URL", async () => {
    const run = mockExecByCommand({
      "gh pr view": { stdout: SAMPLE_PR_JSON },
    });

    const result = await resolvePr("https://github.com/owner/repo/pull/42", run);

    expect(result.ok).toBe(true);
    expect(result.pr!.number).toBe(42);
  });

  it("rejects invalid input format", async () => {
    const run = mockExec();

    const result = await resolvePr("not-valid", run);

    expect(result.ok).toBe(false);
    expect(result.error).toContain("Invalid PR reference");
    expect(result.remediation).toContain("Examples");
  });

  it("handles PR not found", async () => {
    const run = mockExecByCommand({
      "gh pr view": {
        exitCode: 1,
        stderr: "Could not resolve to a PullRequest",
      },
    });

    const result = await resolvePr("9999", run);

    expect(result.ok).toBe(false);
    expect(result.error).toContain("not found");
    expect(result.remediation).toContain("Verify the PR number");
  });

  it("handles closed PR", async () => {
    const closedPr = JSON.stringify({
      number: 10,
      title: "Old feature",
      author: { login: "dev" },
      state: "CLOSED",
      headRefName: "feat/old",
      baseRefName: "main",
      url: "https://github.com/owner/repo/pull/10",
      additions: 5,
      deletions: 2,
      changedFiles: 1,
      isDraft: false,
    });

    const run = mockExecByCommand({
      "gh pr view": { stdout: closedPr },
    });

    const result = await resolvePr("10", run);

    expect(result.ok).toBe(false);
    expect(result.error).toContain("closed");
    expect(result.remediation).toContain("Reopen");
  });

  it("handles merged PR", async () => {
    const mergedPr = JSON.stringify({
      number: 11,
      title: "Merged feature",
      author: { login: "dev" },
      state: "MERGED",
      headRefName: "feat/done",
      baseRefName: "main",
      url: "https://github.com/owner/repo/pull/11",
      additions: 20,
      deletions: 5,
      changedFiles: 3,
      isDraft: false,
    });

    const run = mockExecByCommand({
      "gh pr view": { stdout: mergedPr },
    });

    const result = await resolvePr("11", run);

    expect(result.ok).toBe(false);
    expect(result.error).toContain("merged");
    expect(result.remediation).toContain("open PR");
  });

  it("handles gh command failure", async () => {
    const run = mockExecByCommand({
      "gh pr view": {
        exitCode: 1,
        stderr: "HTTP 500: Internal Server Error",
      },
    });

    const result = await resolvePr("42", run);

    expect(result.ok).toBe(false);
    expect(result.error).toContain("Failed to fetch");
    expect(result.remediation).toContain("network");
  });

  it("handles malformed JSON from gh", async () => {
    const run = mockExecByCommand({
      "gh pr view": { stdout: "not json {{{" },
    });

    const result = await resolvePr("42", run);

    expect(result.ok).toBe(false);
    expect(result.error).toContain("parse");
  });

  it("handles missing author gracefully", async () => {
    const noAuthor = JSON.stringify({
      number: 42,
      title: "No author PR",
      author: null,
      state: "OPEN",
      headRefName: "feat/x",
      baseRefName: "main",
      url: "https://github.com/owner/repo/pull/42",
      additions: 1,
      deletions: 0,
      changedFiles: 1,
      isDraft: false,
    });

    const run = mockExecByCommand({
      "gh pr view": { stdout: noAuthor },
    });

    const result = await resolvePr("42", run);

    expect(result.ok).toBe(true);
    expect(result.pr!.author).toBe("unknown");
  });
});

// ============================================================================
// formatPrSummary
// ============================================================================

describe("formatPrSummary", () => {
  const pr: PrMetadata = {
    number: 42,
    title: "Add user authentication",
    author: "octocat",
    state: "open",
    sourceBranch: "feat/auth",
    targetBranch: "main",
    url: "https://github.com/owner/repo/pull/42",
    additions: 150,
    deletions: 30,
    changedFiles: 8,
  };

  it("includes PR number and title", () => {
    const summary = formatPrSummary(pr);
    expect(summary).toContain("PR #42");
    expect(summary).toContain("Add user authentication");
  });

  it("includes author", () => {
    const summary = formatPrSummary(pr);
    expect(summary).toContain("octocat");
  });

  it("includes branch info", () => {
    const summary = formatPrSummary(pr);
    expect(summary).toContain("feat/auth");
    expect(summary).toContain("main");
  });

  it("includes change stats", () => {
    const summary = formatPrSummary(pr);
    expect(summary).toContain("+150");
    expect(summary).toContain("-30");
    expect(summary).toContain("8 files");
  });

  it("includes URL", () => {
    const summary = formatPrSummary(pr);
    expect(summary).toContain("https://github.com/owner/repo/pull/42");
  });
});

// ============================================================================
// Tool Integration
// ============================================================================

describe("createGoopPrReviewTool", () => {
  let ctx: PluginContext;
  let toolContext: ReturnType<typeof createMockToolContext>;
  let cleanup: () => void;

  beforeEach(() => {
    const env = setupTestEnvironment("goop-pr-review-test");
    cleanup = env.cleanup;
    ctx = createMockPluginContext({ testDir: env.testDir });
    toolContext = createMockToolContext({ directory: env.testDir });
  });

  afterEach(() => {
    cleanup();
  });

  it("creates tool with correct description", () => {
    const t = createGoopPrReviewTool(ctx);
    expect(t.description).toContain("pull request");
  });

  it("creates tool with pr arg", () => {
    const t = createGoopPrReviewTool(ctx);
    expect(t.args).toHaveProperty("pr");
  });

  it("returns a string result when executed without args", async () => {
    const t = createGoopPrReviewTool(ctx);
    const result = await t.execute({}, toolContext);

    // Either preflight fails (no gh in CI) or it asks for PR input
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// gh-fetch: fetchPrFiles
// ============================================================================

describe("gh-fetch: fetchPrFiles", () => {
  it("returns parsed file list from gh output", async () => {
    const ghOutput = JSON.stringify({
      files: [
        { path: "src/index.ts", additions: 10, deletions: 2 },
        { path: "src/utils.ts", additions: 5, deletions: 0 },
      ],
    });
    const run = mockExec({ stdout: ghOutput });

    const files = await fetchPrFiles(42, run);

    expect(files).toHaveLength(2);
    expect(files[0].path).toBe("src/index.ts");
    expect(files[0].additions).toBe(10);
    expect(files[0].deletions).toBe(2);
    expect(files[1].path).toBe("src/utils.ts");
  });

  it("returns empty array on gh failure", async () => {
    const run = mockExec({ exitCode: 1, stderr: "network error" });

    const files = await fetchPrFiles(42, run);

    expect(files).toEqual([]);
  });

  it("returns empty array on malformed JSON", async () => {
    const run = mockExec({ stdout: "not json" });

    const files = await fetchPrFiles(42, run);

    expect(files).toEqual([]);
  });

  it("handles missing files array gracefully", async () => {
    const run = mockExec({ stdout: JSON.stringify({}) });

    const files = await fetchPrFiles(42, run);

    expect(files).toEqual([]);
  });

  it("defaults missing additions/deletions to 0", async () => {
    const ghOutput = JSON.stringify({
      files: [{ path: "README.md" }],
    });
    const run = mockExec({ stdout: ghOutput });

    const files = await fetchPrFiles(42, run);

    expect(files[0].additions).toBe(0);
    expect(files[0].deletions).toBe(0);
  });
});

// ============================================================================
// gh-fetch: fetchPrChecks
// ============================================================================

describe("gh-fetch: fetchPrChecks", () => {
  it("returns parsed check runs from gh output", async () => {
    const ghOutput = JSON.stringify({
      statusCheckRollup: [
        { name: "CI / build", status: "COMPLETED", conclusion: "SUCCESS", detailsUrl: "https://ci.example.com/1" },
        { name: "CI / lint", status: "COMPLETED", conclusion: "FAILURE" },
        { name: "CI / test", status: "IN_PROGRESS", conclusion: null },
      ],
    });
    const run = mockExec({ stdout: ghOutput });

    const checks = await fetchPrChecks(42, run);

    expect(checks).toHaveLength(3);
    expect(checks[0].name).toBe("CI / build");
    expect(checks[0].status).toBe("COMPLETED");
    expect(checks[0].conclusion).toBe("SUCCESS");
    expect(checks[0].detailsUrl).toBe("https://ci.example.com/1");
    expect(checks[1].conclusion).toBe("FAILURE");
    expect(checks[2].conclusion).toBeNull();
  });

  it("returns empty array on gh failure", async () => {
    const run = mockExec({ exitCode: 1, stderr: "error" });

    const checks = await fetchPrChecks(42, run);

    expect(checks).toEqual([]);
  });

  it("handles missing statusCheckRollup gracefully", async () => {
    const run = mockExec({ stdout: JSON.stringify({}) });

    const checks = await fetchPrChecks(42, run);

    expect(checks).toEqual([]);
  });

  it("uses __typename as fallback name", async () => {
    const ghOutput = JSON.stringify({
      statusCheckRollup: [
        { __typename: "StatusContext", status: "COMPLETED", conclusion: "SUCCESS" },
      ],
    });
    const run = mockExec({ stdout: ghOutput });

    const checks = await fetchPrChecks(42, run);

    expect(checks[0].name).toBe("StatusContext");
  });

  it("omits detailsUrl when not present", async () => {
    const ghOutput = JSON.stringify({
      statusCheckRollup: [
        { name: "test", status: "COMPLETED", conclusion: "SUCCESS" },
      ],
    });
    const run = mockExec({ stdout: ghOutput });

    const checks = await fetchPrChecks(42, run);

    expect(checks[0].detailsUrl).toBeUndefined();
  });
});

// ============================================================================
// gh-fetch: fetchPrReviews
// ============================================================================

describe("gh-fetch: fetchPrReviews", () => {
  it("returns parsed reviews from gh output", async () => {
    const ghOutput = JSON.stringify({
      reviews: [
        { author: { login: "reviewer1" }, body: "LGTM", state: "APPROVED", submittedAt: "2026-01-15T10:00:00Z" },
        { author: { login: "reviewer2" }, body: "Needs changes", state: "CHANGES_REQUESTED" },
      ],
    });
    const run = mockExec({ stdout: ghOutput });

    const reviews = await fetchPrReviews(42, run);

    expect(reviews).toHaveLength(2);
    expect(reviews[0].author).toBe("reviewer1");
    expect(reviews[0].body).toBe("LGTM");
    expect(reviews[0].state).toBe("APPROVED");
    expect(reviews[0].submittedAt).toBe("2026-01-15T10:00:00Z");
    expect(reviews[1].submittedAt).toBeUndefined();
  });

  it("returns empty array on gh failure", async () => {
    const run = mockExec({ exitCode: 1, stderr: "error" });

    const reviews = await fetchPrReviews(42, run);

    expect(reviews).toEqual([]);
  });

  it("handles null author gracefully", async () => {
    const ghOutput = JSON.stringify({
      reviews: [{ author: null, body: "Comment", state: "COMMENTED" }],
    });
    const run = mockExec({ stdout: ghOutput });

    const reviews = await fetchPrReviews(42, run);

    expect(reviews[0].author).toBe("unknown");
  });

  it("handles missing reviews array gracefully", async () => {
    const run = mockExec({ stdout: JSON.stringify({}) });

    const reviews = await fetchPrReviews(42, run);

    expect(reviews).toEqual([]);
  });
});

// ============================================================================
// gh-fetch: fetchPrComments
// ============================================================================

describe("gh-fetch: fetchPrComments", () => {
  it("returns parsed comments from gh output", async () => {
    const ghOutput = JSON.stringify({
      comments: [
        { author: { login: "user1" }, body: "Great work!", createdAt: "2026-01-15T10:00:00Z" },
        { author: { login: "user2" }, body: "Question about line 5", createdAt: "2026-01-15T11:00:00Z" },
      ],
    });
    const run = mockExec({ stdout: ghOutput });

    const comments = await fetchPrComments(42, run);

    expect(comments).toHaveLength(2);
    expect(comments[0].author).toBe("user1");
    expect(comments[0].body).toBe("Great work!");
    expect(comments[0].createdAt).toBe("2026-01-15T10:00:00Z");
  });

  it("returns empty array on gh failure", async () => {
    const run = mockExec({ exitCode: 1, stderr: "error" });

    const comments = await fetchPrComments(42, run);

    expect(comments).toEqual([]);
  });

  it("handles null author gracefully", async () => {
    const ghOutput = JSON.stringify({
      comments: [{ author: null, body: "Bot comment", createdAt: "2026-01-15T10:00:00Z" }],
    });
    const run = mockExec({ stdout: ghOutput });

    const comments = await fetchPrComments(42, run);

    expect(comments[0].author).toBe("unknown");
  });

  it("handles missing comments array gracefully", async () => {
    const run = mockExec({ stdout: JSON.stringify({}) });

    const comments = await fetchPrComments(42, run);

    expect(comments).toEqual([]);
  });
});

// ============================================================================
// context: buildReviewContext
// ============================================================================

describe("context: buildReviewContext", () => {
  let testDir: string;
  let cleanup: () => void;

  beforeEach(() => {
    const env = setupTestEnvironment("pr-review-context");
    testDir = env.testDir;
    cleanup = env.cleanup;
    clearContextCache();
  });

  afterEach(() => {
    cleanup();
    clearContextCache();
  });

  function contextMockExec(
    overrides: Partial<Record<string, Partial<ExecResult>>> = {},
  ): (cmd: string) => Promise<ExecResult> {
    const defaults: Record<string, Partial<ExecResult>> = {
      "gh pr view 42 --json files": {
        stdout: JSON.stringify({
          files: [
            { path: "src/app.ts", additions: 20, deletions: 5 },
            { path: "src/utils.ts", additions: 3, deletions: 1 },
          ],
        }),
      },
      "gh pr view 42 --json statusCheckRollup": {
        stdout: JSON.stringify({
          statusCheckRollup: [
            { name: "CI / build", status: "COMPLETED", conclusion: "SUCCESS" },
            { name: "CI / test", status: "COMPLETED", conclusion: "FAILURE" },
          ],
        }),
      },
      "gh pr view 42 --json reviews": {
        stdout: JSON.stringify({
          reviews: [
            { author: { login: "reviewer" }, body: "Looks good", state: "APPROVED", submittedAt: "2026-01-15T10:00:00Z" },
          ],
        }),
      },
      "gh pr view 42 --json comments": {
        stdout: JSON.stringify({
          comments: [
            { author: { login: "commenter" }, body: "Nice!", createdAt: "2026-01-15T11:00:00Z" },
          ],
        }),
      },
      "git status --porcelain": { stdout: "" },
    };

    const merged = { ...defaults, ...overrides };

    return async (cmd: string) => {
      for (const [pattern, result] of Object.entries(merged)) {
        if (cmd.includes(pattern) || cmd === pattern) {
          return { stdout: "", stderr: "", exitCode: 0, ...result };
        }
      }
      return { stdout: "", stderr: "unknown command", exitCode: 1 };
    };
  }

  it("assembles full review context from gh data", async () => {
    const pr = validPrMetadata();
    const run = contextMockExec();

    const ctx = await buildReviewContext({ pr, run, projectDir: testDir });

    expect(ctx.pr).toEqual(pr);
    expect(ctx.files).toHaveLength(2);
    expect(ctx.files[0].path).toBe("src/app.ts");
    expect(ctx.checks).toHaveLength(2);
    expect(ctx.checks[0].name).toBe("CI / build");
    expect(ctx.reviews).toHaveLength(1);
    expect(ctx.reviews[0].author).toBe("reviewer");
    expect(ctx.comments).toHaveLength(1);
    expect(ctx.comments[0].author).toBe("commenter");
    expect(ctx.workingDirectoryClean).toBe(true);
  });

  it("detects spec availability from project directory", async () => {
    writeFileSync(join(testDir, ".goopspec", "SPEC.md"), "# Spec");
    writeFileSync(join(testDir, ".goopspec", "BLUEPRINT.md"), "# Blueprint");

    const pr = validPrMetadata();
    const run = contextMockExec();

    const ctx = await buildReviewContext({ pr, run, projectDir: testDir });

    expect(ctx.specAvailability.specExists).toBe(true);
    expect(ctx.specAvailability.blueprintExists).toBe(true);
  });

  it("reports no-spec mode when spec files are absent", async () => {
    const pr = validPrMetadata();
    const run = contextMockExec();
    const emptyDir = join(testDir, "no-spec-project");
    mkdirSync(emptyDir, { recursive: true });

    const ctx = await buildReviewContext({ pr, run, projectDir: emptyDir });

    expect(ctx.specAvailability.specExists).toBe(false);
    expect(ctx.specAvailability.blueprintExists).toBe(false);
  });

  it("detects dirty working directory", async () => {
    const pr = validPrMetadata();
    const run = contextMockExec({
      "git status --porcelain": { stdout: " M src/dirty.ts\n?? untracked.ts" },
    });

    const ctx = await buildReviewContext({ pr, run, projectDir: testDir });

    expect(ctx.workingDirectoryClean).toBe(false);
  });

  it("returns cached context on second call for same PR", async () => {
    const pr = validPrMetadata();
    let callCount = 0;
    const countingRun = async (cmd: string) => {
      callCount++;
      return contextMockExec()(cmd);
    };

    const ctx1 = await buildReviewContext({ pr, run: countingRun, projectDir: testDir });
    const firstCallCount = callCount;

    const ctx2 = await buildReviewContext({ pr, run: countingRun, projectDir: testDir });

    expect(ctx1).toEqual(ctx2);
    expect(callCount).toBe(firstCallCount); // No additional calls
    expect(hasCachedContext(pr.number)).toBe(true);
  });

  it("bypasses cache when skipCache is true", async () => {
    const pr = validPrMetadata();
    let callCount = 0;
    const countingRun = async (cmd: string) => {
      callCount++;
      return contextMockExec()(cmd);
    };

    await buildReviewContext({ pr, run: countingRun, projectDir: testDir });
    const firstCallCount = callCount;

    await buildReviewContext({ pr, run: countingRun, projectDir: testDir, skipCache: true });

    expect(callCount).toBeGreaterThan(firstCallCount);
  });

  it("does not use cache for different PR numbers", async () => {
    const pr1 = validPrMetadata();
    const pr2 = { ...validPrMetadata(), number: 99 };
    const run = contextMockExec();

    await buildReviewContext({ pr: pr1, run, projectDir: testDir });

    expect(hasCachedContext(42)).toBe(true);
    expect(hasCachedContext(99)).toBe(false);
  });

  it("clearContextCache removes cached data", async () => {
    const pr = validPrMetadata();
    const run = contextMockExec();

    await buildReviewContext({ pr, run, projectDir: testDir });
    expect(hasCachedContext(42)).toBe(true);

    clearContextCache();
    expect(hasCachedContext(42)).toBe(false);
  });

  it("gracefully handles all gh queries failing", async () => {
    const pr = validPrMetadata();
    const failRun = async () => ({
      stdout: "",
      stderr: "network error",
      exitCode: 1,
    });

    const ctx = await buildReviewContext({ pr, run: failRun, projectDir: testDir });

    expect(ctx.pr).toEqual(pr);
    expect(ctx.files).toEqual([]);
    expect(ctx.checks).toEqual([]);
    expect(ctx.reviews).toEqual([]);
    expect(ctx.comments).toEqual([]);
    // Working directory defaults to clean when git fails
    expect(ctx.workingDirectoryClean).toBe(true);
  });

  it("handles partial gh failures gracefully", async () => {
    const pr = validPrMetadata();
    const run = contextMockExec({
      "gh pr view 42 --json statusCheckRollup": { exitCode: 1, stderr: "timeout" },
      "gh pr view 42 --json reviews": { exitCode: 1, stderr: "timeout" },
    });

    const ctx = await buildReviewContext({ pr, run, projectDir: testDir });

    expect(ctx.files).toHaveLength(2); // Files still fetched
    expect(ctx.checks).toEqual([]); // Failed gracefully
    expect(ctx.reviews).toEqual([]); // Failed gracefully
    expect(ctx.comments).toHaveLength(1); // Comments still fetched
  });
});

// ============================================================================
// context: isWorkingDirectoryClean
// ============================================================================

describe("context: isWorkingDirectoryClean", () => {
  it("returns true when git status is empty", async () => {
    const run = mockExec({ stdout: "" });
    expect(await isWorkingDirectoryClean(run)).toBe(true);
  });

  it("returns false when git status has changes", async () => {
    const run = mockExec({ stdout: " M src/file.ts" });
    expect(await isWorkingDirectoryClean(run)).toBe(false);
  });

  it("returns true when git command fails (non-git repo)", async () => {
    const run = mockExec({ exitCode: 128, stderr: "not a git repository" });
    expect(await isWorkingDirectoryClean(run)).toBe(true);
  });
});

// ============================================================================
// analyzers: quality
// ============================================================================

describe("quality analyzer", () => {
  function buildContext(overrides: Partial<ReviewContext> = {}): ReviewContext {
    return {
      pr: validPrMetadata(),
      files: [{ path: "src/auth.ts", additions: 10, deletions: 2 }],
      checks: [],
      reviews: [],
      comments: [],
      specAvailability: {
        specExists: false,
        blueprintExists: false,
        specPath: "",
        blueprintPath: "",
      },
      workingDirectoryClean: true,
      ...overrides,
    };
  }

  it("maps lint/test/typecheck checks to statuses", () => {
    const ctx = buildContext({
      checks: [
        { name: "CI / lint", status: "COMPLETED", conclusion: "FAILURE" },
        { name: "CI / test", status: "COMPLETED", conclusion: "SUCCESS" },
        { name: "CI / typecheck", status: "IN_PROGRESS", conclusion: null },
        { name: "CI / build", status: "COMPLETED", conclusion: "SKIPPED" },
      ],
    });

    const section = analyzeQuality(ctx);

    expect(section.checks).toHaveLength(4);
    expect(section.checks[0].status).toBe("fail");
    expect(section.checks[1].status).toBe("pass");
    expect(section.checks[2].status).toBe("pending");
    expect(section.checks[3].status).toBe("skipped");
  });

  it("creates findings for failing and pending checks", () => {
    const ctx = buildContext({
      checks: [
        { name: "CI / test", status: "COMPLETED", conclusion: "FAILURE" },
        { name: "CI / lint", status: "QUEUED", conclusion: null },
      ],
    });

    const section = analyzeQuality(ctx);

    expect(section.findings).toHaveLength(2);
    expect(section.findings[0].severity).toBe("high");
    expect(section.findings[1].severity).toBe("low");
    expect(section.summary).toContain("failed");
    expect(section.summary).toContain("pending");
  });

  it("returns unknown summary when checks are absent", () => {
    const section = analyzeQuality(buildContext());
    expect(section.checks).toEqual([]);
    expect(section.findings).toEqual([]);
    expect(section.summary).toContain("unknown");
  });
});

// ============================================================================
// analyzers: security
// ============================================================================

describe("security analyzer", () => {
  function buildContext(overrides: Partial<ReviewContext> = {}): ReviewContext {
    return {
      pr: validPrMetadata(),
      files: [],
      checks: [],
      reviews: [],
      comments: [],
      specAvailability: {
        specExists: false,
        blueprintExists: false,
        specPath: "",
        blueprintPath: "",
      },
      workingDirectoryClean: true,
      ...overrides,
    };
  }

  it("flags failed security checks", () => {
    const ctx = buildContext({
      checks: [
        {
          name: "CodeQL security scan",
          status: "COMPLETED",
          conclusion: "FAILURE",
        },
      ],
    });

    const section = analyzeSecurity(ctx);

    expect(section.findings.length).toBeGreaterThanOrEqual(1);
    expect(section.findings.some((finding) => finding.message.includes("check failed"))).toBe(true);
  });

  it("detects security keywords in reviews and comments", () => {
    const ctx = buildContext({
      reviews: [
        {
          author: "reviewer",
          state: "COMMENTED",
          body: "Potential auth bypass and SQL injection risk.",
        },
      ],
      comments: [
        {
          author: "maintainer",
          body: "CVE-2025-1234 appears relevant here.",
          createdAt: "2026-02-12T00:00:00Z",
        },
      ],
    });

    const section = analyzeSecurity(ctx);

    expect(section.findings.length).toBeGreaterThanOrEqual(2);
    expect(section.findings.some((finding) => finding.severity === "critical")).toBe(true);
    expect(section.summary).toContain("Security findings");
  });

  it("returns clean summary when no security signals exist", () => {
    const section = analyzeSecurity(buildContext());
    expect(section.findings).toEqual([]);
    expect(section.summary).toContain("No security-relevant signals");
  });
});

// ============================================================================
// analyzers: spec
// ============================================================================

describe("spec analyzer", () => {
  let testDir: string;
  let cleanup: () => void;

  beforeEach(() => {
    const env = setupTestEnvironment("pr-review-spec-analyzer");
    testDir = env.testDir;
    cleanup = env.cleanup;
  });

  afterEach(() => {
    cleanup();
  });

  function buildContext(overrides: Partial<ReviewContext> = {}): ReviewContext {
    return {
      pr: validPrMetadata(),
      files: [{ path: "src/tools/goop-pr-review/report.ts", additions: 30, deletions: 1 }],
      checks: [{ name: "CI / lint", status: "COMPLETED", conclusion: "SUCCESS" }],
      reviews: [],
      comments: [],
      specAvailability: {
        specExists: false,
        blueprintExists: false,
        specPath: "",
        blueprintPath: "",
      },
      workingDirectoryClean: true,
      ...overrides,
    };
  }

  it("skips alignment when SPEC.md is absent", () => {
    const section = analyzeSpecAlignment(buildContext());
    expect(section.available).toBe(false);
    expect(section.requirements).toEqual([]);
    expect(section.summary).toContain("skipped");
  });

  it("maps must-haves when spec files exist", () => {
    const specPath = join(testDir, ".goopspec", "SPEC.md");
    const blueprintPath = join(testDir, ".goopspec", "BLUEPRINT.md");

    writeFileSync(
      specPath,
      [
        "# SPEC",
        "",
        "### MH1: PR Selection Interface",
        "Prompt for PR number and validate with gh.",
        "",
        "### MH2: Comprehensive Review Analysis",
        "Review checks lint type test status and provides human-readable summary.",
      ].join("\n"),
    );

    writeFileSync(
      blueprintPath,
      [
        "# BLUEPRINT",
        "| MH1 | Task 1.1 |",
        "| MH2 | Task 2.2 |",
      ].join("\n"),
    );

    const section = analyzeSpecAlignment(
      buildContext({
        specAvailability: {
          specExists: true,
          blueprintExists: true,
          specPath,
          blueprintPath,
        },
        checks: [
          { name: "CI / lint", status: "COMPLETED", conclusion: "SUCCESS" },
          { name: "CI / test", status: "COMPLETED", conclusion: "SUCCESS" },
          { name: "CI / typecheck", status: "COMPLETED", conclusion: "SUCCESS" },
        ],
      }),
    );

    expect(section.available).toBe(true);
    expect(section.requirements.length).toBe(2);
    expect(section.summary).toContain("must-have");
  });

  it("surfaces uncovered and missing blueprint traceability findings", () => {
    const specPath = join(testDir, ".goopspec", "SPEC.md");
    const blueprintPath = join(testDir, ".goopspec", "BLUEPRINT.md");

    writeFileSync(
      specPath,
      [
        "# SPEC",
        "",
        "### MH1: Payment Validation",
        "Includes fraud detection and anti-tampering checks.",
      ].join("\n"),
    );

    writeFileSync(blueprintPath, "# BLUEPRINT\nNo requirement IDs listed");

    const section = analyzeSpecAlignment(
      buildContext({
        specAvailability: {
          specExists: true,
          blueprintExists: true,
          specPath,
          blueprintPath,
        },
      }),
    );

    expect(section.requirements[0].covered).toBe(false);
    expect(section.findings.some((finding) => finding.message.includes("appears uncovered"))).toBe(true);
    expect(section.findings.some((finding) => finding.message.includes("missing from BLUEPRINT"))).toBe(true);
  });
});

// ============================================================================
// Report Formatting
// ============================================================================

describe("report", () => {
  function buildReport(overrides: Partial<ReviewReport> = {}): ReviewReport {
    return {
      pr: validPrMetadata(),
      quality: createEmptyQualitySection(),
      security: createEmptySecuritySection(),
      spec: createNoSpecSection(),
      changeSummary: {
        filesChanged: ["src/app.ts", "src/utils.ts"],
        additions: 150,
        deletions: 30,
        summary: "2 file(s) changed (+150 -30).",
      },
      verdict: "comment",
      fixOptions: [],
      generatedAt: new Date().toISOString(),
      ...overrides,
    };
  }

  describe("formatReviewReport", () => {
    it("includes PR header with number and title", () => {
      const output = formatReviewReport(buildReport());
      expect(output).toContain("PR Review Report");
      expect(output).toContain("#42");
      expect(output).toContain("Add user authentication");
    });

    it("includes author and branch info", () => {
      const output = formatReviewReport(buildReport());
      expect(output).toContain("dev-user");
      expect(output).toContain("feat/auth");
      expect(output).toContain("main");
    });

    it("renders quality section header", () => {
      const output = formatReviewReport(buildReport());
      expect(output).toContain("### Quality");
    });

    it("renders security section header", () => {
      const output = formatReviewReport(buildReport());
      expect(output).toContain("### Security");
    });

    it("renders spec alignment section header", () => {
      const output = formatReviewReport(buildReport());
      expect(output).toContain("### Spec Alignment");
    });

    it("renders change summary section header", () => {
      const output = formatReviewReport(buildReport());
      expect(output).toContain("### Change Summary");
    });

    it("renders verdict section", () => {
      const output = formatReviewReport(buildReport());
      expect(output).toContain("### Verdict");
    });

    it("shows approve verdict when set", () => {
      const output = formatReviewReport(buildReport({ verdict: "approve" }));
      expect(output).toContain("APPROVE");
    });

    it("shows request-changes verdict when set", () => {
      const output = formatReviewReport(buildReport({ verdict: "request-changes" }));
      expect(output).toContain("CHANGES REQUESTED");
    });

    it("shows comment verdict when set", () => {
      const output = formatReviewReport(buildReport({ verdict: "comment" }));
      expect(output).toContain("COMMENT");
    });

    it("renders quality check statuses", () => {
      const report = buildReport({
        quality: {
          checks: [
            { name: "CI / lint", status: "pass", detail: "lint check" },
            { name: "CI / test", status: "fail", detail: "tests check" },
          ],
          findings: [],
          summary: "1 passed, 1 failed.",
        },
      });

      const output = formatReviewReport(report);
      expect(output).toContain("✓ CI / lint");
      expect(output).toContain("✗ CI / test");
    });

    it("renders findings with severity icons", () => {
      const report = buildReport({
        security: {
          findings: [
            {
              severity: "critical",
              category: "security",
              message: "CVE detected",
              suggestion: "Upgrade dependency",
            },
          ],
          summary: "1 critical finding.",
        },
      });

      const output = formatReviewReport(report);
      expect(output).toContain("🔴");
      expect(output).toContain("[CRITICAL]");
      expect(output).toContain("CVE detected");
      expect(output).toContain("→ Upgrade dependency");
    });

    it("renders finding with file location", () => {
      const report = buildReport({
        quality: {
          checks: [],
          findings: [
            {
              severity: "medium",
              category: "quality",
              message: "Unused import",
              file: "src/index.ts",
              line: 5,
            },
          ],
          summary: "1 finding.",
        },
      });

      const output = formatReviewReport(report);
      expect(output).toContain("(src/index.ts:5)");
    });

    it("renders spec requirements with coverage status", () => {
      const report = buildReport({
        spec: {
          available: true,
          requirements: [
            { id: "MH1", description: "PR Selection", covered: true, evidence: "Matched: pr, selection" },
            { id: "MH2", description: "Review Analysis", covered: false },
          ],
          findings: [],
          summary: "1/2 covered.",
        },
      });

      const output = formatReviewReport(report);
      expect(output).toContain("✓ MH1: PR Selection");
      expect(output).toContain("✗ MH2: Review Analysis");
    });

    it("renders change summary with file list", () => {
      const output = formatReviewReport(buildReport());
      expect(output).toContain("+150 / -30");
      expect(output).toContain("src/app.ts");
      expect(output).toContain("src/utils.ts");
    });

    it("truncates long file lists", () => {
      const manyFiles = Array.from({ length: 20 }, (_, i) => `src/file-${i}.ts`);
      const report = buildReport({
        changeSummary: {
          filesChanged: manyFiles,
          additions: 500,
          deletions: 100,
          summary: "20 files changed.",
        },
      });

      const output = formatReviewReport(report);
      expect(output).toContain("… and 5 more");
    });

    it("handles no-spec mode gracefully", () => {
      const output = formatReviewReport(buildReport());
      expect(output).toContain("No spec files detected");
    });
  });

  describe("countFindings", () => {
    it("counts all findings across sections", () => {
      const report = buildReport({
        quality: {
          checks: [],
          findings: [
            { severity: "high", category: "quality", message: "Test failure" },
          ],
          summary: "",
        },
        security: {
          findings: [
            { severity: "critical", category: "security", message: "CVE" },
            { severity: "medium", category: "security", message: "Advisory" },
          ],
          summary: "",
        },
      });

      expect(countFindings(report)).toBe(3);
    });

    it("returns 0 for report with no findings", () => {
      expect(countFindings(buildReport())).toBe(0);
    });

    it("filters by minimum severity", () => {
      const report = buildReport({
        quality: {
          checks: [],
          findings: [
            { severity: "high", category: "quality", message: "High issue" },
            { severity: "low", category: "quality", message: "Low issue" },
            { severity: "info", category: "quality", message: "Info note" },
          ],
          summary: "",
        },
      });

      expect(countFindings(report, "high")).toBe(1);
      expect(countFindings(report, "medium")).toBe(1);
      expect(countFindings(report, "low")).toBe(2);
      expect(countFindings(report, "info")).toBe(3);
    });
  });

  describe("deriveVerdict", () => {
    it("returns approve when no findings exist", () => {
      expect(deriveVerdict(buildReport())).toBe("approve");
    });

    it("returns request-changes when critical findings exist", () => {
      const report = buildReport({
        security: {
          findings: [
            { severity: "critical", category: "security", message: "CVE" },
          ],
          summary: "",
        },
      });

      expect(deriveVerdict(report)).toBe("request-changes");
    });

    it("returns request-changes when high findings exist", () => {
      const report = buildReport({
        quality: {
          checks: [],
          findings: [
            { severity: "high", category: "quality", message: "Test failure" },
          ],
          summary: "",
        },
      });

      expect(deriveVerdict(report)).toBe("request-changes");
    });

    it("returns comment when only medium/low findings exist", () => {
      const report = buildReport({
        quality: {
          checks: [],
          findings: [
            { severity: "medium", category: "quality", message: "Warning" },
          ],
          summary: "",
        },
      });

      expect(deriveVerdict(report)).toBe("comment");
    });
  });
});

// ============================================================================
// Fix Options
// ============================================================================

describe("fix-options", () => {
  function buildReport(overrides: Partial<ReviewReport> = {}): ReviewReport {
    return {
      pr: validPrMetadata(),
      quality: createEmptyQualitySection(),
      security: createEmptySecuritySection(),
      spec: createNoSpecSection(),
      changeSummary: {
        filesChanged: [],
        additions: 0,
        deletions: 0,
        summary: "No changes.",
      },
      verdict: "comment",
      fixOptions: [],
      generatedAt: new Date().toISOString(),
      ...overrides,
    };
  }

  describe("getAvailableFixOptions", () => {
    it("returns empty when no actionable findings exist", () => {
      const options = getAvailableFixOptions(buildReport());
      expect(options).toEqual([]);
    });

    it("includes lint option when lint check fails", () => {
      const report = buildReport({
        quality: {
          checks: [{ name: "CI / lint", status: "fail", detail: "lint check" }],
          findings: [
            { severity: "medium", category: "quality", message: "Quality check failed: CI / lint" },
          ],
          summary: "",
        },
      });

      const options = getAvailableFixOptions(report);
      expect(options.some((o) => o.value === "lint")).toBe(true);
    });

    it("includes tests option when test check fails", () => {
      const report = buildReport({
        quality: {
          checks: [{ name: "CI / test", status: "fail", detail: "tests check" }],
          findings: [
            { severity: "high", category: "quality", message: "Quality check failed: CI / test" },
          ],
          summary: "",
        },
      });

      const options = getAvailableFixOptions(report);
      expect(options.some((o) => o.value === "tests")).toBe(true);
    });

    it("includes comments option when review comment findings exist", () => {
      const report = buildReport({
        security: {
          findings: [
            { severity: "medium", category: "security", message: "Security keyword detected in review by reviewer." },
          ],
          summary: "",
        },
      });

      const options = getAvailableFixOptions(report);
      expect(options.some((o) => o.value === "comments")).toBe(true);
    });

    it("includes requirements option when spec requirements are uncovered", () => {
      const report = buildReport({
        spec: {
          available: true,
          requirements: [
            { id: "MH1", description: "Feature A", covered: false },
          ],
          findings: [],
          summary: "",
        },
      });

      const options = getAvailableFixOptions(report);
      expect(options.some((o) => o.value === "requirements")).toBe(true);
    });

    it("does not include requirements when spec is unavailable", () => {
      const report = buildReport({
        spec: {
          available: false,
          requirements: [],
          findings: [],
          summary: "",
        },
      });

      const options = getAvailableFixOptions(report);
      expect(options.some((o) => o.value === "requirements")).toBe(false);
    });

    it("returns multiple options when multiple issues exist", () => {
      const report = buildReport({
        quality: {
          checks: [
            { name: "CI / lint", status: "fail", detail: "lint check" },
            { name: "CI / test", status: "fail", detail: "tests check" },
          ],
          findings: [
            { severity: "medium", category: "quality", message: "Quality check failed: CI / lint" },
            { severity: "high", category: "quality", message: "Quality check failed: CI / test" },
          ],
          summary: "",
        },
      });

      const options = getAvailableFixOptions(report);
      expect(options.length).toBeGreaterThanOrEqual(2);
      expect(options.some((o) => o.value === "lint")).toBe(true);
      expect(options.some((o) => o.value === "tests")).toBe(true);
    });
  });

  describe("buildFixOptionsPrompt", () => {
    it("returns null when no fix options are available", () => {
      const result = buildFixOptionsPrompt(buildReport(), { clean: true });
      expect(result).toBeNull();
    });

    it("returns prompt text when fix options are available", () => {
      const report = buildReport({
        quality: {
          checks: [{ name: "CI / lint", status: "fail", detail: "lint check" }],
          findings: [
            { severity: "medium", category: "quality", message: "Quality check failed: CI / lint" },
          ],
          summary: "",
        },
      });

      const result = buildFixOptionsPrompt(report, { clean: true });
      expect(result).not.toBeNull();
      expect(result).toContain("Available Fix Options");
      expect(result).toContain("Lint & Format");
    });

    it("includes dirty worktree warning when worktree is dirty", () => {
      const report = buildReport({
        quality: {
          checks: [{ name: "CI / lint", status: "fail", detail: "lint check" }],
          findings: [
            { severity: "medium", category: "quality", message: "Quality check failed: CI / lint" },
          ],
          summary: "",
        },
      });

      const dirtyResult: DirtyWorktreeResult = {
        clean: false,
        warning: "Working directory has 3 uncommitted change(s).",
        changedFiles: [" M src/dirty.ts", "?? untracked.ts", " M README.md"],
      };

      const result = buildFixOptionsPrompt(report, dirtyResult);
      expect(result).not.toBeNull();
      expect(result).toContain("Dirty Working Directory");
      expect(result).toContain("uncommitted change");
      expect(result).toContain("Available Fix Options");
    });

    it("includes selection instructions", () => {
      const report = buildReport({
        quality: {
          checks: [{ name: "CI / lint", status: "fail", detail: "lint check" }],
          findings: [
            { severity: "medium", category: "quality", message: "Quality check failed: CI / lint" },
          ],
          summary: "",
        },
      });

      const result = buildFixOptionsPrompt(report, { clean: true });
      expect(result).toContain("comma-separated");
      expect(result).toContain("`all`");
      expect(result).toContain("`none`");
    });
  });

  describe("parseFixSelection", () => {
    const allOptions = getAllFixCategoryOptions();

    it("returns empty array for 'none'", () => {
      expect(parseFixSelection("none", allOptions)).toEqual([]);
    });

    it("returns empty array for 'skip'", () => {
      expect(parseFixSelection("skip", allOptions)).toEqual([]);
    });

    it("returns empty array for empty string", () => {
      expect(parseFixSelection("", allOptions)).toEqual([]);
    });

    it("returns all available options for 'all'", () => {
      const result = parseFixSelection("all", allOptions);
      expect(result).toEqual(["lint", "tests", "comments", "requirements"]);
    });

    it("parses single category", () => {
      const result = parseFixSelection("lint", allOptions);
      expect(result).toEqual(["lint"]);
    });

    it("parses comma-separated categories", () => {
      const result = parseFixSelection("lint,tests", allOptions);
      expect(result).toEqual(["lint", "tests"]);
    });

    it("handles whitespace in input", () => {
      const result = parseFixSelection("  lint , tests  ", allOptions);
      expect(result).toEqual(["lint", "tests"]);
    });

    it("ignores invalid category names", () => {
      const result = parseFixSelection("lint,invalid,tests", allOptions);
      expect(result).toEqual(["lint", "tests"]);
    });

    it("only returns categories that are in available options", () => {
      const limitedOptions = allOptions.filter((o) => o.value === "lint");
      const result = parseFixSelection("lint,tests", limitedOptions);
      expect(result).toEqual(["lint"]);
    });

    it("is case-insensitive", () => {
      const result = parseFixSelection("LINT,Tests", allOptions);
      expect(result).toEqual(["lint", "tests"]);
    });
  });

  describe("getAllFixCategoryOptions", () => {
    it("returns all four fix categories", () => {
      const options = getAllFixCategoryOptions();
      expect(options).toHaveLength(4);
      expect(options.map((o) => o.value)).toEqual(["lint", "tests", "comments", "requirements"]);
    });

    it("each option has label and hint", () => {
      const options = getAllFixCategoryOptions();
      for (const opt of options) {
        expect(opt.label).toBeTruthy();
        expect(opt.hint).toBeTruthy();
      }
    });
  });
});

// ============================================================================
// Dirty Worktree Detection
// ============================================================================

describe("dirty-worktree", () => {
  describe("checkDirtyWorktree", () => {
    it("returns clean when git status is empty", async () => {
      const run = mockExec({ stdout: "" });
      const result = await checkDirtyWorktree(run);
      expect(result.clean).toBe(true);
      expect(result.warning).toBeUndefined();
    });

    it("returns dirty with warning when changes exist", async () => {
      const run = mockExec({ stdout: " M src/dirty.ts\n?? untracked.ts" });
      const result = await checkDirtyWorktree(run);
      expect(result.clean).toBe(false);
      expect(result.warning).toContain("2 uncommitted change");
      expect(result.changedFiles).toHaveLength(2);
    });

    it("returns clean when git command fails", async () => {
      const run = mockExec({ exitCode: 128, stderr: "not a git repository" });
      const result = await checkDirtyWorktree(run);
      expect(result.clean).toBe(true);
    });

    it("returns clean when exec throws", async () => {
      const run = async () => {
        throw new Error("exec failed");
      };
      const result = await checkDirtyWorktree(run as (cmd: string) => Promise<ExecResult>);
      expect(result.clean).toBe(true);
    });
  });

  describe("formatDirtyWorktreeWarning", () => {
    it("returns empty string for clean worktree", () => {
      expect(formatDirtyWorktreeWarning({ clean: true })).toBe("");
    });

    it("includes warning message for dirty worktree", () => {
      const result = formatDirtyWorktreeWarning({
        clean: false,
        warning: "Working directory has 2 uncommitted change(s).",
        changedFiles: [" M src/dirty.ts", "?? untracked.ts"],
      });

      expect(result).toContain("Dirty Working Directory");
      expect(result).toContain("2 uncommitted change");
      expect(result).toContain("src/dirty.ts");
      expect(result).toContain("untracked.ts");
      expect(result).toContain("committing or stashing");
    });

    it("truncates long file lists to 5 entries", () => {
      const changedFiles = Array.from({ length: 10 }, (_, i) => ` M file-${i}.ts`);
      const result = formatDirtyWorktreeWarning({
        clean: false,
        warning: "Working directory has 10 uncommitted change(s).",
        changedFiles,
      });

      expect(result).toContain("file-0.ts");
      expect(result).toContain("file-4.ts");
      expect(result).toContain("… and 5 more");
      expect(result).not.toContain("file-5.ts");
    });

    it("handles missing changedFiles gracefully", () => {
      const result = formatDirtyWorktreeWarning({
        clean: false,
        warning: "Uncommitted changes detected.",
      });

      expect(result).toContain("Dirty Working Directory");
      expect(result).toContain("Uncommitted changes detected.");
    });
  });
});

// ============================================================================
// Fix Orchestration
// ============================================================================

describe("fix-orchestrator", () => {
  function buildReviewContext(overrides: Partial<ReviewContext> = {}): ReviewContext {
    return {
      pr: validPrMetadata(),
      files: [],
      checks: [],
      reviews: [],
      comments: [],
      specAvailability: {
        specExists: false,
        blueprintExists: false,
        specPath: "",
        blueprintPath: "",
      },
      workingDirectoryClean: true,
      ...overrides,
    };
  }

  it("routes each selected category exactly once", async () => {
    const calls: string[] = [];
    const handlers: Partial<Record<FixCategory, FixHandler>> = {
      lint: async ({ category }) => {
        calls.push(category);
        return { status: "applied", message: "lint fixed" };
      },
      tests: async ({ category }) => {
        calls.push(category);
        return { status: "applied", message: "tests fixed" };
      },
    };

    const result = await orchestrateFixes(["lint", "tests", "lint"], buildReviewContext(), {
      handlers,
      skipPostFixVerification: true,
    });

    expect(calls).toEqual(["lint", "tests"]);
    expect(result.selected).toEqual(["lint", "tests"]);
    expect(result.results).toHaveLength(2);
  });

  it("tracks applied, skipped, and failed categories", async () => {
    const handlers: Partial<Record<FixCategory, FixHandler>> = {
      lint: async () => ({ status: "applied", message: "applied" }),
      tests: async () => ({ status: "skipped", message: "skipped" }),
      comments: async () => ({ status: "failed", message: "failed" }),
    };

    const result = await orchestrateFixes(
      ["lint", "tests", "comments"],
      buildReviewContext(),
      { handlers, skipPostFixVerification: true },
    );

    expect(result.summary.applied).toEqual(["lint"]);
    expect(result.summary.skipped).toEqual(["tests"]);
    expect(result.summary.failed).toEqual(["comments"]);
  });

  it("supports delegation path for implementation-heavy categories", async () => {
    const delegated: string[] = [];
    const result = await orchestrateFixes(
      ["tests", "requirements"],
      buildReviewContext({
        checks: [{ name: "CI / test", status: "COMPLETED", conclusion: "FAILURE" }],
        specAvailability: {
          specExists: true,
          blueprintExists: true,
          specPath: "/tmp/spec",
          blueprintPath: "/tmp/blueprint",
        },
      }),
      {
        delegateFix: async (request) => {
          delegated.push(`${request.category}:${request.agent}`);
          return {
            status: "applied",
            message: `delegated to ${request.agent}`,
          };
        },
        skipPostFixVerification: true,
      },
    );

    expect(delegated).toEqual([
      "tests:goop-executor-high",
      "requirements:goop-executor-high",
    ]);
    expect(result.summary.applied).toEqual(["tests", "requirements"]);
    expect(result.results[0].delegated?.agent).toBe("goop-executor-high");
  });

  it("handles empty selection without execution", async () => {
    const result = await orchestrateFixes([], buildReviewContext(), {
      skipPostFixVerification: true,
    });
    expect(result.selected).toEqual([]);
    expect(result.results).toEqual([]);
    expect(result.summary.applied).toEqual([]);
    expect(result.summary.skipped).toEqual([]);
    expect(result.summary.failed).toEqual([]);
  });

  it("records failure when handler throws", async () => {
    const handlers: Partial<Record<FixCategory, FixHandler>> = {
      lint: async () => {
        throw new Error("boom");
      },
    };

    const result = await orchestrateFixes(["lint"], buildReviewContext(), {
      handlers,
      skipPostFixVerification: true,
    });

    expect(result.summary.failed).toEqual(["lint"]);
    expect(result.results[0].status).toBe("failed");
    expect(result.results[0].message).toContain("boom");
  });
});

describe("selection-routing", () => {
  function buildReviewContext(overrides: Partial<ReviewContext> = {}): ReviewContext {
    return {
      pr: validPrMetadata(),
      files: [],
      checks: [],
      reviews: [],
      comments: [],
      specAvailability: {
        specExists: true,
        blueprintExists: true,
        specPath: "/tmp/spec",
        blueprintPath: "/tmp/blueprint",
      },
      workingDirectoryClean: true,
      ...overrides,
    };
  }

  it("routes multiple selected categories in deterministic order", async () => {
    const calls: string[] = [];
    const handlers: Partial<Record<FixCategory, FixHandler>> = {
      lint: async ({ category }) => {
        calls.push(category);
        return { status: "applied", message: "done" };
      },
      comments: async ({ category }) => {
        calls.push(category);
        return { status: "applied", message: "done" };
      },
      requirements: async ({ category }) => {
        calls.push(category);
        return { status: "applied", message: "done" };
      },
    };

    const result = await orchestrateFixes(
      ["lint", "comments", "requirements"],
      buildReviewContext(),
      { handlers, skipPostFixVerification: true },
    );

    expect(calls).toEqual(["lint", "comments", "requirements"]);
    expect(result.results.map((entry) => entry.category)).toEqual([
      "lint",
      "comments",
      "requirements",
    ]);
  });

  it("continues routing remaining selections when one category fails", async () => {
    const calls: string[] = [];
    const handlers: Partial<Record<FixCategory, FixHandler>> = {
      lint: async ({ category }) => {
        calls.push(category);
        return { status: "failed", message: "lint failed" };
      },
      tests: async ({ category }) => {
        calls.push(category);
        return { status: "applied", message: "tests fixed" };
      },
    };

    const result = await orchestrateFixes(["lint", "tests"], buildReviewContext(), {
      handlers,
      skipPostFixVerification: true,
    });

    expect(calls).toEqual(["lint", "tests"]);
    expect(result.summary.failed).toEqual(["lint"]);
    expect(result.summary.applied).toEqual(["tests"]);
  });
});

// ============================================================================
// fix-handlers
// ============================================================================

describe("fix-handlers", () => {
  function buildReviewContext(overrides: Partial<ReviewContext> = {}): ReviewContext {
    return {
      pr: validPrMetadata(),
      files: [],
      checks: [],
      reviews: [],
      comments: [],
      specAvailability: {
        specExists: false,
        blueprintExists: false,
        specPath: "",
        blueprintPath: "",
      },
      workingDirectoryClean: true,
      ...overrides,
    };
  }

  it("handleLintFormat applies lint and format commands", async () => {
    const calls: string[] = [];
    const result = await handleLintFormat(
      { category: "lint", reviewContext: buildReviewContext() },
      {
        run: async (cmd) => {
          calls.push(cmd);
          return { stdout: "ok", stderr: "", exitCode: 0 };
        },
      },
    );

    expect(result.status).toBe("applied");
    expect(calls).toEqual(["bun run lint --fix", "bun run format"]);
    expect(result.commands?.length).toBe(2);
  });

  it("handleLintFormat reports failure when command fails", async () => {
    const result = await handleLintFormat(
      { category: "lint", reviewContext: buildReviewContext() },
      {
        run: async (cmd) => ({
          stdout: "",
          stderr: cmd.includes("lint") ? "lint failed" : "",
          exitCode: cmd.includes("lint") ? 1 : 0,
        }),
      },
    );

    expect(result.status).toBe("failed");
    expect(result.message).toContain("lint failed");
    expect(result.commands?.length).toBe(1);
  });

  it("handleTestRemediation delegates when failing test signals exist", async () => {
    const result = await handleTestRemediation(
      {
        category: "tests",
        reviewContext: buildReviewContext({
          checks: [{ name: "CI / test", status: "COMPLETED", conclusion: "FAILURE" }],
        }),
      },
      {
        delegateFix: async () => ({ status: "applied", message: "delegated test fix" }),
      },
    );

    expect(result.status).toBe("applied");
    expect(result.delegated?.agent).toBe("goop-executor-high");
  });

  it("handleTestRemediation skips when no failing test signals exist", async () => {
    const result = await handleTestRemediation(
      { category: "tests", reviewContext: buildReviewContext() },
      {},
    );

    expect(result.status).toBe("skipped");
    expect(result.message).toContain("No failing test signals");
  });

  it("handleCommentRemediation delegates when review comments exist", async () => {
    const result = await handleCommentRemediation(
      {
        category: "comments",
        reviewContext: buildReviewContext({
          comments: [{ author: "reviewer", body: "Please fix this", createdAt: "2026-02-12" }],
        }),
      },
      {
        delegateFix: async () => ({ status: "applied", message: "delegated comment fix" }),
      },
    );

    expect(result.status).toBe("applied");
    expect(result.delegated?.agent).toBe("goop-executor-medium");
  });

  it("handleRequirementRemediation skips when spec files are unavailable", async () => {
    const result = await handleRequirementRemediation(
      { category: "requirements", reviewContext: buildReviewContext() },
      {},
    );

    expect(result.status).toBe("skipped");
    expect(result.message).toContain("Spec files are unavailable");
  });

  it("handleRequirementRemediation delegates when spec files exist", async () => {
    const result = await handleRequirementRemediation(
      {
        category: "requirements",
        reviewContext: buildReviewContext({
          specAvailability: {
            specExists: true,
            blueprintExists: true,
            specPath: "/tmp/spec",
            blueprintPath: "/tmp/blueprint",
          },
        }),
      },
      {
        delegateFix: async () => ({ status: "applied", message: "delegated requirements fix" }),
      },
    );

    expect(result.status).toBe("applied");
    expect(result.delegated?.agent).toBe("goop-executor-high");
  });

  it("createFixHandlers returns all required category handlers", async () => {
    const handlers = createFixHandlers({
      run: async () => ({ stdout: "", stderr: "", exitCode: 0 }),
    });

    expect(typeof handlers.lint).toBe("function");
    expect(typeof handlers.tests).toBe("function");
    expect(typeof handlers.comments).toBe("function");
    expect(typeof handlers.requirements).toBe("function");
  });
});

// ============================================================================
// verify-after-fix
// ============================================================================

describe("verify-after-fix", () => {
  function buildReviewContext(overrides: Partial<ReviewContext> = {}): ReviewContext {
    return {
      pr: validPrMetadata(),
      files: [],
      checks: [],
      reviews: [],
      comments: [],
      specAvailability: {
        specExists: false,
        blueprintExists: false,
        specPath: "",
        blueprintPath: "",
      },
      workingDirectoryClean: true,
      ...overrides,
    };
  }

  it("skips verification when no categories were applied", async () => {
    const result = await verifyAfterFix(buildReviewContext(), []);
    expect(result.status).toBe("skipped");
    expect(result.checks).toEqual([]);
    expect(result.regressionsDetected).toBe(false);
  });

  it("runs targeted checks and passes when commands succeed", async () => {
    const calls: string[] = [];
    const result = await verifyAfterFix(buildReviewContext(), ["lint", "tests"], {
      run: async (cmd) => {
        calls.push(cmd);
        return { stdout: "ok", stderr: "", exitCode: 0 };
      },
    });

    expect(result.status).toBe("pass");
    expect(result.regressionsDetected).toBe(false);
    expect(calls).toEqual(["bun run lint", "bun run typecheck", "bun test"]);
  });

  it("detects regressions and returns rollback guidance on failure", async () => {
    const result = await verifyAfterFix(buildReviewContext(), ["requirements"], {
      run: async (cmd) => {
        if (cmd === "bun test") {
          return { stdout: "", stderr: "failing test", exitCode: 1 };
        }
        return { stdout: "ok", stderr: "", exitCode: 0 };
      },
    });

    expect(result.status).toBe("fail");
    expect(result.regressionsDetected).toBe(true);
    expect(result.rollbackGuidance).toBeDefined();
    expect(result.rollbackGuidance?.reason).toContain("Post-fix verification failed");
    expect(result.rollbackGuidance?.steps.length).toBeGreaterThan(0);
  });
});

describe("post-fix", () => {
  function buildReviewContext(overrides: Partial<ReviewContext> = {}): ReviewContext {
    return {
      pr: validPrMetadata(),
      files: [],
      checks: [],
      reviews: [],
      comments: [],
      specAvailability: {
        specExists: false,
        blueprintExists: false,
        specPath: "",
        blueprintPath: "",
      },
      workingDirectoryClean: true,
      ...overrides,
    };
  }

  it("orchestrator emits verification outcomes after applied fixes", async () => {
    const result = await orchestrateFixes(["lint"], buildReviewContext(), {
      handlers: {
        lint: async () => ({ status: "applied", message: "done" }),
      },
      run: async () => ({ stdout: "ok", stderr: "", exitCode: 0 }),
    });

    expect(result.verification.status).toBe("pass");
    expect(result.verification.checks.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// merge flow
// ============================================================================

describe("merge-strategy", () => {
  it("prompts when strategy is missing", () => {
    const result = promptMergeStrategy();
    expect(result.status).toBe("prompt");
    expect(result.prompt).toContain("merge");
    expect(result.prompt).toContain("squash");
  });

  it("accepts merge strategy", () => {
    const result = promptMergeStrategy("merge");
    expect(result.status).toBe("ready");
    expect(result.strategy).toBe("merge");
  });

  it("accepts squash strategy with whitespace and case", () => {
    const result = promptMergeStrategy("  SQUASH ");
    expect(result.status).toBe("ready");
    expect(result.strategy).toBe("squash");
  });

  it("rejects unsupported strategies", () => {
    const result = promptMergeStrategy("rebase");
    expect(result.status).toBe("prompt");
    expect(result.prompt).toContain("Invalid strategy");
  });
});

describe("merge-confirmation", () => {
  it("requires explicit confirmation before merge", () => {
    const result = confirmMerge({
      prNumber: 42,
      strategy: "merge",
      unresolvedFindings: 1,
    });

    expect(result.status).toBe("prompt");
    expect(result.prompt).toContain("Final merge confirmation required");
    expect(result.prompt).toContain("Set `mergeConfirm` to `yes`");
  });

  it("accepts affirmative confirmation values", () => {
    const result = confirmMerge({
      prNumber: 42,
      strategy: "squash",
      unresolvedFindings: 0,
      confirmation: "yes",
    });

    expect(result.status).toBe("confirmed");
  });

  it("supports boolean confirmation", () => {
    const result = confirmMerge({
      prNumber: 42,
      strategy: "merge",
      unresolvedFindings: 0,
      confirmation: true,
    });

    expect(result.status).toBe("confirmed");
  });

  it("cancels merge on negative confirmation", () => {
    const result = confirmMerge({
      prNumber: 42,
      strategy: "merge",
      unresolvedFindings: 2,
      confirmation: "no",
    });

    expect(result.status).toBe("cancelled");
  });
});

describe("merge-failure", () => {
  function commandResult(overrides: Partial<MergeCommandResult>): MergeCommandResult {
    return {
      command: "gh pr merge 42 --merge --delete-branch",
      prNumber: 42,
      strategy: "merge",
      stdout: "",
      stderr: "",
      exitCode: 1,
      ...overrides,
    };
  }

  it("executes gh pr merge with selected merge strategy", async () => {
    const calls: string[] = [];
    const result = await executeMerge(42, "merge", async (cmd) => {
      calls.push(cmd);
      return { stdout: "merged", stderr: "", exitCode: 0 };
    });

    expect(calls).toEqual(["gh pr merge 42 --merge --delete-branch"]);
    expect(result.exitCode).toBe(0);
  });

  it("executes gh pr merge with squash strategy", async () => {
    const calls: string[] = [];
    await executeMerge(42, "squash", async (cmd) => {
      calls.push(cmd);
      return { stdout: "merged", stderr: "", exitCode: 0 };
    });

    expect(calls).toEqual(["gh pr merge 42 --squash --delete-branch"]);
  });

  it("maps merge conflict errors to actionable status", () => {
    const result = handleMergeResult(
      commandResult({ stderr: "Pull request is not mergeable: merge conflict" }),
    );

    expect(result.status).toBe("conflict");
    expect(result.remediation).toContain("resolve conflicts");
  });

  it("maps permission failures to actionable status", () => {
    const result = handleMergeResult(
      commandResult({ stderr: "GraphQL: Resource not accessible by integration (permission denied)" }),
    );

    expect(result.status).toBe("permission-denied");
    expect(result.remediation).toContain("write/maintainer access");
  });

  it("maps resource-not-accessible responses to permission-denied", () => {
    const result = handleMergeResult(
      commandResult({ stderr: "GraphQL: Resource not accessible by integration" }),
    );

    expect(result.status).toBe("permission-denied");
  });

  it("returns generic failure for unknown errors", () => {
    const result = handleMergeResult(
      commandResult({ stderr: "unexpected transport error" }),
    );

    expect(result.status).toBe("failed");
    expect(result.remediation).toContain("Review the gh output");
  });
});

// ============================================================================
// Tool Integration: Success and Failure Branches (Wave 4.2)
// ============================================================================

describe("integration-flow", () => {
  let ctx: PluginContext;
  let toolContext: ReturnType<typeof createMockToolContext>;
  let cleanup: () => void;

  beforeEach(() => {
    const env = setupTestEnvironment("goop-pr-review-integration");
    cleanup = env.cleanup;
    ctx = createMockPluginContext({ testDir: env.testDir });
    toolContext = createMockToolContext({ directory: env.testDir });
  });

  afterEach(() => {
    cleanup();
  });

  function buildIntegrationContext(
    overrides: Partial<ReviewContext> = {},
  ): ReviewContext {
    return {
      pr: validPrMetadata(),
      files: [{ path: "src/auth.ts", additions: 10, deletions: 2 }],
      checks: [],
      reviews: [],
      comments: [],
      specAvailability: {
        specExists: true,
        blueprintExists: true,
        specPath: "/tmp/SPEC.md",
        blueprintPath: "/tmp/BLUEPRINT.md",
      },
      workingDirectoryClean: true,
      ...overrides,
    };
  }

  function buildBaseDeps(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      ghPreflight: async () => ({ ok: true, ghVersion: "2.50.0", authenticated: true }),
      resolvePr: async () => ({ ok: true, pr: validPrMetadata() }),
      buildReviewContext: async () => buildIntegrationContext(),
      analyzeQuality: () => ({
        checks: [],
        findings: [],
        summary: "All quality checks passed.",
      }),
      analyzeSecurity: () => ({
        findings: [],
        summary: "No security-relevant signals found.",
      }),
      analyzeSpecAlignment: () => ({
        available: true,
        requirements: [{ id: "MH4", description: "Interactive Merge Flow", covered: true }],
        findings: [],
        summary: "All requirements covered.",
      }),
      checkDirtyWorktree: async () => ({ clean: true }),
      getAvailableFixOptions: () => [],
      buildFixOptionsPrompt: () => null,
      parseFixSelection: () => [],
      orchestrateFixes: async () => ({
        selected: [],
        results: [],
        summary: { applied: [], skipped: [], failed: [] },
        verification: {
          status: "skipped",
          summary: "No verification needed",
          checks: [],
          regressionsDetected: false,
        },
      }),
      run: async () => ({ stdout: "Merged pull request #42", stderr: "", exitCode: 0 }),
      ...overrides,
    };
  }

  it("executes happy path review -> fixes -> merge", async () => {
    const mergeCommands: string[] = [];
    const deps = buildBaseDeps({
      getAvailableFixOptions: () => [
        { value: "lint", label: "Lint & Format", hint: "Fix lint and formatting issues" },
      ],
      buildFixOptionsPrompt: () => "### Available Fix Options\n- lint",
      parseFixSelection: () => ["lint"],
      orchestrateFixes: async () => ({
        selected: ["lint"],
        results: [{ category: "lint", status: "applied", message: "lint fixed" }],
        summary: { applied: ["lint"], skipped: [], failed: [] },
        verification: {
          status: "pass",
          summary: "All checks passed",
          checks: [
            { name: "lint", command: "bun run lint", passed: true },
            { name: "typecheck", command: "bun run typecheck", passed: true },
          ],
          regressionsDetected: false,
        },
      }),
      run: async (command: string) => {
        mergeCommands.push(command);
        return { stdout: "Merged pull request #42", stderr: "", exitCode: 0 };
      },
    });

    const tool = createGoopPrReviewTool(ctx, deps);
    const result = await tool.execute(
      {
        pr: "42",
        fixSelection: "lint",
        mergeStrategy: "squash",
        mergeConfirm: "yes",
      },
      toolContext,
    );

    expect(result).toContain("### Fix Execution");
    expect(result).toContain("Summary: applied=1, skipped=0, failed=0");
    expect(result).toContain("Post-fix verification:");
    expect(result).toContain("- status: success");
    expect(result).toContain("merged successfully using `squash` strategy");
    expect(mergeCommands).toEqual([
      "gh pr merge 42 --squash --delete-branch",
    ]);
  });

  it("fails fast when gh is missing", async () => {
    const tool = createGoopPrReviewTool(
      ctx,
      buildBaseDeps({
        ghPreflight: async () => ({
          ok: false,
          error: "GitHub CLI (gh) is not installed.",
          remediation: "Install gh: https://cli.github.com/",
        }),
      }),
    );

    const result = await tool.execute({ pr: "42" }, toolContext);

    expect(result).toContain("GitHub CLI Preflight Failed");
    expect(result).toContain("not installed");
    expect(result).toContain("https://cli.github.com/");
  });

  it("fails fast when gh auth is unavailable", async () => {
    const tool = createGoopPrReviewTool(
      ctx,
      buildBaseDeps({
        ghPreflight: async () => ({
          ok: false,
          error: "GitHub CLI is not authenticated.",
          remediation: "Run `gh auth login` to authenticate.",
        }),
      }),
    );

    const result = await tool.execute({ pr: "42" }, toolContext);

    expect(result).toContain("GitHub CLI Preflight Failed");
    expect(result).toContain("not authenticated");
    expect(result).toContain("gh auth login");
  });

  it("handles PR not-found resolution failure", async () => {
    const tool = createGoopPrReviewTool(
      ctx,
      buildBaseDeps({
        resolvePr: async () => ({
          ok: false,
          error: "PR #9999 was not found in this repository.",
          remediation: "Verify the PR number and ensure repository context is correct.",
        }),
      }),
    );

    const result = await tool.execute({ pr: "9999" }, toolContext);

    expect(result).toContain("PR Resolution Failed");
    expect(result).toContain("not found");
  });

  it("handles closed PR resolution failure", async () => {
    const tool = createGoopPrReviewTool(
      ctx,
      buildBaseDeps({
        resolvePr: async () => ({
          ok: false,
          error: "PR #10 is closed.",
          remediation: "Only open PRs can be reviewed.",
        }),
      }),
    );

    const result = await tool.execute({ pr: "10" }, toolContext);

    expect(result).toContain("PR Resolution Failed");
    expect(result).toContain("closed");
  });

  it("handles merged PR resolution failure", async () => {
    const tool = createGoopPrReviewTool(
      ctx,
      buildBaseDeps({
        resolvePr: async () => ({
          ok: false,
          error: "PR #11 has already been merged.",
          remediation: "Choose an open PR to review.",
        }),
      }),
    );

    const result = await tool.execute({ pr: "11" }, toolContext);

    expect(result).toContain("PR Resolution Failed");
    expect(result).toContain("merged");
  });

  it("runs in no-spec mode when .goopspec files are absent", async () => {
    const tool = createGoopPrReviewTool(
      ctx,
      buildBaseDeps({
        buildReviewContext: async () =>
          buildIntegrationContext({
            specAvailability: {
              specExists: false,
              blueprintExists: false,
              specPath: "",
              blueprintPath: "",
            },
          }),
        analyzeSpecAlignment: () => createNoSpecSection(),
      }),
    );

    const result = await tool.execute({ pr: "42" }, toolContext);

    expect(result).toContain("No spec files detected");
    expect(result).toContain("Review complete. Merge flow ready.");
  });

  it("reports merge permission denial with actionable guidance", async () => {
    const tool = createGoopPrReviewTool(
      ctx,
      buildBaseDeps({
        run: async () => ({
          stdout: "",
          stderr: "GraphQL: Resource not accessible by integration (permission denied)",
          exitCode: 1,
        }),
      }),
    );

    const result = await tool.execute(
      { pr: "42", mergeStrategy: "merge", mergeConfirm: "yes" },
      toolContext,
    );

    expect(result).toContain("- status: permission-denied");
    expect(result).toContain("insufficient permissions");
  });

  it("reports merge conflict with remediation guidance", async () => {
    const tool = createGoopPrReviewTool(
      ctx,
      buildBaseDeps({
        run: async () => ({
          stdout: "",
          stderr: "Pull request is not mergeable due to conflict",
          exitCode: 1,
        }),
      }),
    );

    const result = await tool.execute(
      { pr: "42", mergeStrategy: "merge", mergeConfirm: "yes" },
      toolContext,
    );

    expect(result).toContain("- status: conflict");
    expect(result).toContain("Merge failed due to conflicts");
  });

  it("surfaces fix handler failures in fix execution summary", async () => {
    const tool = createGoopPrReviewTool(
      ctx,
      buildBaseDeps({
        getAvailableFixOptions: () => [
          { value: "comments", label: "Comment Remediation", hint: "Address review comments" },
        ],
        parseFixSelection: () => ["comments"],
        orchestrateFixes: async () => ({
          selected: ["comments"],
          results: [
            {
              category: "comments",
              status: "failed",
              message: "delegation failed",
            },
          ],
          summary: { applied: [], skipped: [], failed: ["comments"] },
          verification: {
            status: "skipped",
            summary: "No applied fixes to verify",
            checks: [],
            regressionsDetected: false,
          },
        }),
      }),
    );

    const result = await tool.execute(
      { pr: "42", fixSelection: "comments" },
      toolContext,
    );

    expect(result).toContain("comments: failed - delegation failed");
    expect(result).toContain("Summary: applied=0, skipped=0, failed=1");
  });

  it("surfaces post-fix verification failures with rollback guidance", async () => {
    const tool = createGoopPrReviewTool(
      ctx,
      buildBaseDeps({
        getAvailableFixOptions: () => [
          { value: "requirements", label: "Requirements", hint: "Cover missing requirements" },
        ],
        parseFixSelection: () => ["requirements"],
        orchestrateFixes: async () => ({
          selected: ["requirements"],
          results: [
            {
              category: "requirements",
              status: "applied",
              message: "requirements updates applied",
            },
          ],
          summary: { applied: ["requirements"], skipped: [], failed: [] },
          verification: {
            status: "fail",
            summary: "Post-fix verification failed.",
            checks: [
              {
                name: "test",
                command: "bun test",
                passed: false,
                output: "1 failing test",
              },
            ],
            regressionsDetected: true,
            rollbackGuidance: {
              reason: "Post-fix verification failed",
              steps: ["Review the failed tests", "Revert broken changes"],
            },
          },
        }),
      }),
    );

    const result = await tool.execute(
      { pr: "42", fixSelection: "requirements" },
      toolContext,
    );

    expect(result).toContain("status: fail");
    expect(result).toContain("rollback guidance");
    expect(result).toContain("Post-fix verification failed");
  });
});
