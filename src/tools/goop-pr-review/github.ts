/**
 * GitHub CLI integration for PR review
 *
 * Provides preflight validation (gh installed + authenticated) and
 * PR metadata resolution via `gh pr view`.
 *
 * @module tools/goop-pr-review/github
 */

import { log, logError } from "../../shared/logger.js";
import type {
  PrMetadata,
  PrChangedFile,
  PrCheckRun,
  PrReviewComment,
  PrComment,
} from "./types.js";

// Re-export types for convenience
export type { PrMetadata } from "./types.js";
export type { PrChangedFile, PrCheckRun, PrReviewComment, PrComment };

// ============================================================================
// Types
// ============================================================================

export interface GhPreflightResult {
  ok: boolean;
  ghVersion?: string;
  authenticated?: boolean;
  error?: string;
  remediation?: string;
}

export interface PrResolveResult {
  ok: boolean;
  pr?: PrMetadata;
  error?: string;
  remediation?: string;
}

// ============================================================================
// Shell Execution
// ============================================================================

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * Execute a shell command and capture output.
 * Extracted for testability — tests can replace this with a stub.
 */
export async function exec(command: string): Promise<ExecResult> {
  try {
    const proc = Bun.spawn(["sh", "-c", command], {
      stdout: "pipe",
      stderr: "pipe",
    });

    const [stdout, stderr] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);

    const exitCode = await proc.exited;

    return { stdout: stdout.trim(), stderr: stderr.trim(), exitCode };
  } catch (error) {
    logError("exec failed", error);
    return { stdout: "", stderr: String(error), exitCode: 1 };
  }
}

// ============================================================================
// Preflight
// ============================================================================

/**
 * Verify that `gh` CLI is installed and the user is authenticated.
 */
export async function ghPreflight(
  run: (cmd: string) => Promise<ExecResult> = exec,
): Promise<GhPreflightResult> {
  // Step 1: Check gh is installed
  const versionResult = await run("gh --version");
  if (versionResult.exitCode !== 0) {
    return {
      ok: false,
      error: "GitHub CLI (gh) is not installed or not on PATH.",
      remediation:
        "Install gh: https://cli.github.com/ — then run `gh auth login`.",
    };
  }

  const versionMatch = versionResult.stdout.match(/gh version ([\d.]+)/);
  const ghVersion = versionMatch?.[1] ?? versionResult.stdout.split("\n")[0];

  // Step 2: Check authentication
  const authResult = await run("gh auth status");
  if (authResult.exitCode !== 0) {
    return {
      ok: false,
      ghVersion,
      authenticated: false,
      error: "GitHub CLI is not authenticated.",
      remediation: "Run `gh auth login` to authenticate.",
    };
  }

  log("gh preflight passed", { ghVersion });

  return {
    ok: true,
    ghVersion,
    authenticated: true,
  };
}

// ============================================================================
// PR Input Parsing
// ============================================================================

/**
 * Extract a PR number from user input.
 * Accepts:
 *  - Plain number: "42"
 *  - GitHub URL: "https://github.com/owner/repo/pull/42"
 */
export function parsePrInput(input: string): number | null {
  const trimmed = input.trim();

  // Plain number
  if (/^\d+$/.test(trimmed)) {
    return parseInt(trimmed, 10);
  }

  // GitHub URL — extract trailing number after /pull/
  const urlMatch = trimmed.match(/\/pull\/(\d+)/);
  if (urlMatch) {
    return parseInt(urlMatch[1], 10);
  }

  return null;
}

// ============================================================================
// PR Resolution
// ============================================================================

const GH_PR_VIEW_FIELDS = [
  "number",
  "title",
  "author",
  "state",
  "headRefName",
  "baseRefName",
  "url",
  "additions",
  "deletions",
  "changedFiles",
  "isDraft",
].join(",");

interface GhPrViewJson {
  number: number;
  title: string;
  author: { login: string } | null;
  state: string;
  headRefName: string;
  baseRefName: string;
  url: string;
  additions: number;
  deletions: number;
  changedFiles: number;
  isDraft: boolean;
}

/**
 * Resolve a PR number to full metadata via `gh pr view`.
 *
 * Returns early with actionable messages for:
 *  - Invalid input format
 *  - PR not found
 *  - Closed / merged PRs
 */
export async function resolvePr(
  input: string,
  run: (cmd: string) => Promise<ExecResult> = exec,
): Promise<PrResolveResult> {
  const prNumber = parsePrInput(input);
  if (prNumber === null) {
    return {
      ok: false,
      error: `Invalid PR reference: "${input}". Provide a PR number or GitHub URL.`,
      remediation: "Examples: 42, https://github.com/owner/repo/pull/42",
    };
  }

  const cmd = `gh pr view ${prNumber} --json ${GH_PR_VIEW_FIELDS}`;
  const result = await run(cmd);

  if (result.exitCode !== 0) {
    const notFound =
      result.stderr.includes("not found") ||
      result.stderr.includes("Could not resolve");
    if (notFound) {
      return {
        ok: false,
        error: `PR #${prNumber} was not found in this repository.`,
        remediation:
          "Verify the PR number and ensure you are in the correct repository.",
      };
    }

    return {
      ok: false,
      error: `Failed to fetch PR #${prNumber}: ${result.stderr}`,
      remediation: "Check your network connection and `gh auth status`.",
    };
  }

  let data: GhPrViewJson;
  try {
    data = JSON.parse(result.stdout) as GhPrViewJson;
  } catch {
    return {
      ok: false,
      error: `Failed to parse gh output for PR #${prNumber}.`,
      remediation: "Ensure gh CLI is up to date: `gh upgrade`.",
    };
  }

  // Normalize state to lowercase to match types.ts PrMetadata schema
  const state = data.state.toLowerCase() as PrMetadata["state"];

  if (state === "closed") {
    return {
      ok: false,
      error: `PR #${prNumber} is closed.`,
      remediation: "Only open PRs can be reviewed. Reopen the PR or choose another.",
    };
  }

  if (state === "merged") {
    return {
      ok: false,
      error: `PR #${prNumber} has already been merged.`,
      remediation: "Choose an open PR to review.",
    };
  }

  const pr: PrMetadata = {
    number: data.number,
    title: data.title,
    author: data.author?.login ?? "unknown",
    state,
    sourceBranch: data.headRefName,
    targetBranch: data.baseRefName,
    url: data.url,
    additions: data.additions ?? 0,
    deletions: data.deletions ?? 0,
    changedFiles: data.changedFiles ?? 0,
  };

  log("PR resolved", { number: pr.number, title: pr.title });

  return { ok: true, pr };
}

/**
 * Format PR metadata as a human-readable summary for display before analysis.
 */
export function formatPrSummary(pr: PrMetadata): string {
  const lines: string[] = [];
  lines.push(`## PR #${pr.number}: ${pr.title}`);
  lines.push("");
  lines.push(`| Field | Value |`);
  lines.push(`|-------|-------|`);
  lines.push(`| **Author** | ${pr.author} |`);
  lines.push(`| **Branch** | \`${pr.sourceBranch}\` → \`${pr.targetBranch}\` |`);
  lines.push(`| **Changes** | +${pr.additions} / -${pr.deletions} across ${pr.changedFiles} files |`);
  lines.push(`| **URL** | ${pr.url} |`);
  return lines.join("\n");
}

// ============================================================================
// PR Changed Files
// ============================================================================

interface GhFileEntry {
  path: string;
  additions: number;
  deletions: number;
}

/**
 * Fetch the list of changed files for a PR via `gh pr view --json files`.
 */
export async function fetchPrFiles(
  prNumber: number,
  run: (cmd: string) => Promise<ExecResult> = exec,
): Promise<PrChangedFile[]> {
  const cmd = `gh pr view ${prNumber} --json files`;
  const result = await run(cmd);

  if (result.exitCode !== 0) {
    logError("Failed to fetch PR files", { prNumber, stderr: result.stderr });
    return [];
  }

  try {
    const data = JSON.parse(result.stdout) as { files: GhFileEntry[] };
    return (data.files ?? []).map((f) => ({
      path: f.path,
      additions: f.additions ?? 0,
      deletions: f.deletions ?? 0,
    }));
  } catch (error) {
    logError("Failed to parse PR files JSON", error);
    return [];
  }
}

// ============================================================================
// PR Check Runs
// ============================================================================

interface GhCheckRunEntry {
  name: string;
  status: string;
  conclusion: string | null;
  detailsUrl?: string;
  __typename?: string;
}

/**
 * Fetch check-run / status-check results for a PR via `gh pr view --json statusCheckRollup`.
 */
export async function fetchPrChecks(
  prNumber: number,
  run: (cmd: string) => Promise<ExecResult> = exec,
): Promise<PrCheckRun[]> {
  const cmd = `gh pr view ${prNumber} --json statusCheckRollup`;
  const result = await run(cmd);

  if (result.exitCode !== 0) {
    logError("Failed to fetch PR checks", { prNumber, stderr: result.stderr });
    return [];
  }

  try {
    const data = JSON.parse(result.stdout) as {
      statusCheckRollup: GhCheckRunEntry[];
    };
    return (data.statusCheckRollup ?? []).map((c) => ({
      name: c.name ?? c.__typename ?? "unknown",
      status: c.status ?? "UNKNOWN",
      conclusion: c.conclusion ?? null,
      ...(c.detailsUrl ? { detailsUrl: c.detailsUrl } : {}),
    }));
  } catch (error) {
    logError("Failed to parse PR checks JSON", error);
    return [];
  }
}

// ============================================================================
// PR Reviews and Comments
// ============================================================================

interface GhReviewEntry {
  author: { login: string } | null;
  body: string;
  state: string;
  submittedAt?: string;
}

interface GhCommentEntry {
  author: { login: string } | null;
  body: string;
  createdAt: string;
}

/**
 * Fetch review submissions for a PR via `gh pr view --json reviews`.
 */
export async function fetchPrReviews(
  prNumber: number,
  run: (cmd: string) => Promise<ExecResult> = exec,
): Promise<PrReviewComment[]> {
  const cmd = `gh pr view ${prNumber} --json reviews`;
  const result = await run(cmd);

  if (result.exitCode !== 0) {
    logError("Failed to fetch PR reviews", { prNumber, stderr: result.stderr });
    return [];
  }

  try {
    const data = JSON.parse(result.stdout) as { reviews: GhReviewEntry[] };
    return (data.reviews ?? []).map((r) => ({
      author: r.author?.login ?? "unknown",
      body: r.body ?? "",
      state: r.state ?? "COMMENTED",
      ...(r.submittedAt ? { submittedAt: r.submittedAt } : {}),
    }));
  } catch (error) {
    logError("Failed to parse PR reviews JSON", error);
    return [];
  }
}

/**
 * Fetch PR-level comments (conversation, not inline review comments)
 * via `gh pr view --json comments`.
 */
export async function fetchPrComments(
  prNumber: number,
  run: (cmd: string) => Promise<ExecResult> = exec,
): Promise<PrComment[]> {
  const cmd = `gh pr view ${prNumber} --json comments`;
  const result = await run(cmd);

  if (result.exitCode !== 0) {
    logError("Failed to fetch PR comments", { prNumber, stderr: result.stderr });
    return [];
  }

  try {
    const data = JSON.parse(result.stdout) as { comments: GhCommentEntry[] };
    return (data.comments ?? []).map((c) => ({
      author: c.author?.login ?? "unknown",
      body: c.body ?? "",
      createdAt: c.createdAt ?? "",
    }));
  } catch (error) {
    logError("Failed to parse PR comments JSON", error);
    return [];
  }
}
