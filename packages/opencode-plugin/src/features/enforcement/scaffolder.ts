/**
 * Document scaffolder for the enforcement subsystem.
 *
 * When entering a workflow phase, ensures the required documents exist
 * under `.goopspec/<workflowId>/`. Creates minimal templates if missing.
 *
 * Pure-ish functions (filesystem I/O only). No PluginContext dependency —
 * callers pass the project directory and workflow ID directly.
 *
 * @module features/enforcement/scaffolder
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { GOOPSPEC_DIR } from "../../core/constants.js";
import type { WorkflowPhase } from "../../core/types.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DocumentName =
  | "SPEC.md"
  | "BLUEPRINT.md"
  | "CHRONICLE.md"
  | "ADL.md"
  | "RESEARCH.md"
  | "HANDOFF.md";

interface DocumentRule {
  name: DocumentName;
  requiredIn: ReadonlySet<WorkflowPhase>;
  template: (workflowId: string, date: string) => string;
}

export interface ScaffoldResult {
  created: DocumentName[];
  skipped: DocumentName[];
  errors: string[];
}

export interface DocumentCheckResult {
  valid: boolean;
  existing: DocumentName[];
  missing: DocumentName[];
}

// ---------------------------------------------------------------------------
// Document rules
// ---------------------------------------------------------------------------

const DOCUMENT_RULES: readonly DocumentRule[] = [
  {
    name: "SPEC.md",
    requiredIn: new Set<WorkflowPhase>(["plan", "execute", "accept"]),
    template: (workflowId, date) =>
      `# SPEC: ${workflowId}\n\n**Created:** ${date}\n**Status:** Draft\n\n---\n\n## Vision\n\n[Describe what you're building and why]\n\n---\n\n## Must-Haves\n\n- [ ] [Requirement 1]\n\n---\n\n## Out of Scope\n\n- [Item 1]\n`,
  },
  {
    name: "BLUEPRINT.md",
    requiredIn: new Set<WorkflowPhase>(["execute", "accept"]),
    template: (workflowId, date) =>
      `# BLUEPRINT: ${workflowId}\n\n**Created:** ${date}\n**Mode:** standard\n\n---\n\n## Overview\n\n**Goal:** [Define the goal]\n\n---\n\n## Waves\n\n[Define waves and tasks here]\n`,
  },
  {
    name: "CHRONICLE.md",
    requiredIn: new Set<WorkflowPhase>(["execute", "accept"]),
    template: (workflowId, date) =>
      `# CHRONICLE: ${workflowId}\n\n**Last Updated:** ${date}\n\n---\n\n## Status\n\n**Position:** Starting\n\n---\n\n## Recent Activity\n\n[Activity will be logged here]\n`,
  },
  {
    name: "ADL.md",
    requiredIn: new Set<WorkflowPhase>(["execute", "accept"]),
    template: (_workflowId, date) =>
      `# Automated Decision Log\n\n**Created:** ${date}\n\n---\n\n[Decisions and deviations will be logged here]\n`,
  },
  {
    name: "RESEARCH.md",
    requiredIn: new Set<WorkflowPhase>(["plan"]),
    template: (workflowId, date) =>
      `# RESEARCH: ${workflowId}\n\n**Created:** ${date}\n\n---\n\n## Research Goals\n\n[What are you researching?]\n\n---\n\n## Findings\n\n[Document findings here]\n`,
  },
] as const;

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

/**
 * Get the workflow document directory path.
 *
 * For the "default" workflow, docs live at `.goopspec/default/`.
 * For named workflows, docs live at `.goopspec/<workflowId>/`.
 */
export function getWorkflowDocDir(projectDir: string, workflowId: string): string {
  return join(projectDir, GOOPSPEC_DIR, workflowId);
}

/**
 * Get the full path for a specific document in a workflow.
 */
export function getWorkflowDocPath(
  projectDir: string,
  workflowId: string,
  docName: DocumentName,
): string {
  return join(getWorkflowDocDir(projectDir, workflowId), docName);
}

// ---------------------------------------------------------------------------
// Core functions
// ---------------------------------------------------------------------------

/**
 * Get the list of documents required for a given phase.
 */
export function getRequiredDocuments(phase: WorkflowPhase): DocumentName[] {
  return DOCUMENT_RULES.filter((rule) => rule.requiredIn.has(phase)).map((rule) => rule.name);
}

/**
 * Check which required documents exist for a phase.
 */
export function checkPhaseDocuments(
  projectDir: string,
  workflowId: string,
  phase: WorkflowPhase,
): DocumentCheckResult {
  const docDir = getWorkflowDocDir(projectDir, workflowId);
  const required = getRequiredDocuments(phase);

  const existing: DocumentName[] = [];
  const missing: DocumentName[] = [];

  for (const docName of required) {
    const docPath = join(docDir, docName);
    if (existsSync(docPath)) {
      existing.push(docName);
    } else {
      missing.push(docName);
    }
  }

  return {
    valid: missing.length === 0,
    existing,
    missing,
  };
}

/**
 * Scaffold missing documents for a phase.
 *
 * Creates the workflow document directory if needed, then writes minimal
 * template content for any required documents that don't already exist.
 * Existing documents are never overwritten.
 */
export function scaffoldPhaseDocuments(
  projectDir: string,
  workflowId: string,
  phase: WorkflowPhase,
): ScaffoldResult {
  const result: ScaffoldResult = {
    created: [],
    skipped: [],
    errors: [],
  };

  const docDir = getWorkflowDocDir(projectDir, workflowId);
  const date = new Date().toISOString().split("T")[0];

  try {
    if (!existsSync(docDir)) {
      mkdirSync(docDir, { recursive: true });
    }
  } catch (err) {
    result.errors.push(
      `Failed to create directory ${docDir}: ${err instanceof Error ? err.message : String(err)}`,
    );
    return result;
  }

  for (const rule of DOCUMENT_RULES) {
    if (!rule.requiredIn.has(phase)) continue;

    const docPath = join(docDir, rule.name);

    if (existsSync(docPath)) {
      result.skipped.push(rule.name);
      continue;
    }

    try {
      const content = rule.template(workflowId, date);
      writeFileSync(docPath, content, "utf-8");
      result.created.push(rule.name);
    } catch (err) {
      result.errors.push(
        `Failed to create ${rule.name}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return result;
}
