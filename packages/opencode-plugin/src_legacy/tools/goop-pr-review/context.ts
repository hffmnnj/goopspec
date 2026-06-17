/**
 * PR Review Context Builder
 *
 * Assembles a normalized ReviewContext from multiple `gh` queries,
 * with in-process caching to avoid duplicate expensive calls.
 *
 * @module tools/goop-pr-review/context
 */

import { log, logError } from "../../shared/logger.js";
import {
  fetchPrFiles,
  fetchPrChecks,
  fetchPrReviews,
  fetchPrComments,
  exec,
  type ExecResult,
} from "./github.js";
import { detectSpecContext } from "./spec-context.js";
import type {
  PrMetadata,
  PrChangedFile,
  PrCheckRun,
  PrReviewComment,
  PrComment,
  ReviewContext,
  SpecAvailability,
} from "./types.js";

// ============================================================================
// Cache
// ============================================================================

interface CachedContext {
  prNumber: number;
  context: ReviewContext;
  timestamp: number;
}

let contextCache: CachedContext | null = null;

/**
 * Clear the in-process context cache.
 * Useful for testing or when forcing a fresh fetch.
 */
export function clearContextCache(): void {
  contextCache = null;
}

/**
 * Check if a cached context exists for the given PR number.
 */
export function hasCachedContext(prNumber: number): boolean {
  return contextCache !== null && contextCache.prNumber === prNumber;
}

// ============================================================================
// Working Directory Check
// ============================================================================

/**
 * Check whether the working directory has uncommitted changes.
 */
export async function isWorkingDirectoryClean(
  run: (cmd: string) => Promise<ExecResult> = exec,
): Promise<boolean> {
  try {
    const result = await run("git status --porcelain");
    if (result.exitCode !== 0) {
      return true; // Assume clean if git fails (non-git repo)
    }
    return result.stdout.trim() === "";
  } catch {
    return true;
  }
}

// ============================================================================
// Context Builder
// ============================================================================

export interface BuildContextOptions {
  /** PR metadata from the resolver step */
  pr: PrMetadata;
  /** Override the shell executor for testing */
  run?: (cmd: string) => Promise<ExecResult>;
  /** Override the project directory for spec detection */
  projectDir?: string;
  /** Skip cache and force a fresh fetch */
  skipCache?: boolean;
}

/**
 * Build a normalized ReviewContext by fetching PR data from `gh`.
 *
 * Fetches files, checks, reviews, and comments in parallel,
 * then combines them with spec availability and working directory state.
 *
 * Results are cached in-process keyed by PR number to avoid
 * duplicate expensive calls within the same command run.
 */
export async function buildReviewContext(
  options: BuildContextOptions,
): Promise<ReviewContext> {
  const { pr, run = exec, projectDir, skipCache = false } = options;

  // Return cached context if available
  if (!skipCache && hasCachedContext(pr.number)) {
    log("Returning cached review context", { prNumber: pr.number });
    return contextCache!.context;
  }

  log("Building review context", { prNumber: pr.number });

  // Fetch all PR data in parallel for efficiency
  const [files, checks, reviews, comments, workingDirectoryClean] =
    await Promise.all([
      fetchPrFiles(pr.number, run).catch((error): PrChangedFile[] => {
        logError("fetchPrFiles failed, using empty fallback", error);
        return [];
      }),
      fetchPrChecks(pr.number, run).catch((error): PrCheckRun[] => {
        logError("fetchPrChecks failed, using empty fallback", error);
        return [];
      }),
      fetchPrReviews(pr.number, run).catch((error): PrReviewComment[] => {
        logError("fetchPrReviews failed, using empty fallback", error);
        return [];
      }),
      fetchPrComments(pr.number, run).catch((error): PrComment[] => {
        logError("fetchPrComments failed, using empty fallback", error);
        return [];
      }),
      isWorkingDirectoryClean(run),
    ]);

  // Detect spec availability
  const specAvailability: SpecAvailability = detectSpecContext(projectDir);

  const context: ReviewContext = {
    pr,
    files,
    checks,
    reviews,
    comments,
    specAvailability,
    workingDirectoryClean,
  };

  // Cache the result
  contextCache = {
    prNumber: pr.number,
    context,
    timestamp: Date.now(),
  };

  log("Review context built", {
    prNumber: pr.number,
    fileCount: files.length,
    checkCount: checks.length,
    reviewCount: reviews.length,
    commentCount: comments.length,
    specMode: specAvailability.specExists,
    cleanWorkdir: workingDirectoryClean,
  });

  return context;
}
