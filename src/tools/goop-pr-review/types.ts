/**
 * PR Review Types and Schemas
 * Typed contracts for review report output sections and PR metadata.
 *
 * @module tools/goop-pr-review/types
 */

import { z } from "zod";

// ============================================================================
// Severity and Status Constants
// ============================================================================

export const FINDING_SEVERITIES = ["critical", "high", "medium", "low", "info"] as const;
export type FindingSeverity = (typeof FINDING_SEVERITIES)[number];

export const CHECK_STATUSES = ["pass", "fail", "pending", "skipped"] as const;
export type CheckStatus = (typeof CHECK_STATUSES)[number];

export const REVIEW_VERDICTS = ["approve", "request-changes", "comment"] as const;
export type ReviewVerdict = (typeof REVIEW_VERDICTS)[number];

export const FIX_CATEGORIES = ["lint", "tests", "comments", "requirements"] as const;
export type FixCategory = (typeof FIX_CATEGORIES)[number];

// ============================================================================
// PR Metadata
// ============================================================================

export const PrMetadataSchema = z.object({
  number: z.number(),
  title: z.string(),
  author: z.string(),
  sourceBranch: z.string(),
  targetBranch: z.string(),
  state: z.enum(["open", "closed", "merged"]),
  url: z.string(),
  additions: z.number().default(0),
  deletions: z.number().default(0),
  changedFiles: z.number().default(0),
});

export type PrMetadata = z.infer<typeof PrMetadataSchema>;

// ============================================================================
// Review Findings
// ============================================================================

export interface ReviewFinding {
  severity: FindingSeverity;
  category: string;
  message: string;
  file?: string;
  line?: number;
  suggestion?: string;
}

// ============================================================================
// Quality Section
// ============================================================================

export interface QualityCheck {
  name: string;
  status: CheckStatus;
  detail?: string;
}

export interface QualitySection {
  checks: QualityCheck[];
  findings: ReviewFinding[];
  summary: string;
}

// ============================================================================
// Security Section
// ============================================================================

export interface SecuritySection {
  findings: ReviewFinding[];
  summary: string;
}

// ============================================================================
// Spec Alignment Section
// ============================================================================

export interface SpecRequirement {
  id: string;
  description: string;
  covered: boolean;
  evidence?: string;
}

export interface SpecSection {
  available: boolean;
  requirements: SpecRequirement[];
  findings: ReviewFinding[];
  summary: string;
}

// ============================================================================
// Change Summary Section
// ============================================================================

export interface ChangeSummarySection {
  filesChanged: string[];
  additions: number;
  deletions: number;
  summary: string;
}

// ============================================================================
// Review Report
// ============================================================================

export interface ReviewReport {
  pr: PrMetadata;
  quality: QualitySection;
  security: SecuritySection;
  spec: SpecSection;
  changeSummary: ChangeSummarySection;
  verdict: ReviewVerdict;
  fixOptions: FixCategory[];
  generatedAt: string;
}

// ============================================================================
// PR Data (from gh queries)
// ============================================================================

export interface PrChangedFile {
  path: string;
  additions: number;
  deletions: number;
}

export interface PrCheckRun {
  name: string;
  status: string;
  conclusion: string | null;
  detailsUrl?: string;
}

export interface PrReviewComment {
  author: string;
  body: string;
  state: string;
  submittedAt?: string;
}

export interface PrComment {
  author: string;
  body: string;
  createdAt: string;
}

// ============================================================================
// Spec Context
// ============================================================================

export interface SpecAvailability {
  specExists: boolean;
  blueprintExists: boolean;
  specPath: string;
  blueprintPath: string;
}

export interface ReviewContext {
  pr: PrMetadata;
  files: PrChangedFile[];
  checks: PrCheckRun[];
  reviews: PrReviewComment[];
  comments: PrComment[];
  specAvailability: SpecAvailability;
  workingDirectoryClean: boolean;
}

// ============================================================================
// Validation Helpers
// ============================================================================

/**
 * Create an empty quality section with no findings.
 */
export function createEmptyQualitySection(): QualitySection {
  return { checks: [], findings: [], summary: "No quality checks performed." };
}

/**
 * Create an empty security section with no findings.
 */
export function createEmptySecuritySection(): SecuritySection {
  return { findings: [], summary: "No security findings." };
}

/**
 * Create a spec section reflecting no-spec mode.
 */
export function createNoSpecSection(): SpecSection {
  return {
    available: false,
    requirements: [],
    findings: [],
    summary: "No spec files detected. Spec alignment checks skipped.",
  };
}

/**
 * Create an empty change summary section.
 */
export function createEmptyChangeSummary(): ChangeSummarySection {
  return { filesChanged: [], additions: 0, deletions: 0, summary: "No changes detected." };
}

/**
 * Create a default review report shell from PR metadata and spec availability.
 */
export function createDefaultReport(pr: PrMetadata, specAvailable: boolean): ReviewReport {
  return {
    pr,
    quality: createEmptyQualitySection(),
    security: createEmptySecuritySection(),
    spec: specAvailable
      ? { available: true, requirements: [], findings: [], summary: "Spec alignment pending analysis." }
      : createNoSpecSection(),
    changeSummary: {
      filesChanged: [],
      additions: pr.additions,
      deletions: pr.deletions,
      summary: `${pr.changedFiles} file(s) changed (+${pr.additions} -${pr.deletions}).`,
    },
    verdict: "comment",
    fixOptions: [],
    generatedAt: new Date().toISOString(),
  };
}
