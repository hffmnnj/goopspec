/**
 * Path helpers for @goopspec/pi-package.
 *
 * Provides consistent path resolution for the GoopSpec directory structure,
 * database location, and workflow document paths.
 */

import path from "node:path";

import { DB_FILENAME, GOOPSPEC_DIR } from "../core/constants.js";
import type { DocType } from "../core/types.js";

/** Absolute path to the `.goopspec` directory for a project. */
export function getGoopspecDir(projectDir: string): string {
  return path.join(projectDir, GOOPSPEC_DIR);
}

/** Absolute path to the GoopSpec SQLite database for a project. */
export function getDbPath(projectDir: string): string {
  return path.join(getGoopspecDir(projectDir), DB_FILENAME);
}

/** Absolute path to a workflow's document directory within `.goopspec/`. */
export function getWorkflowDocDir(projectDir: string, workflowId: string): string {
  return path.join(getGoopspecDir(projectDir), workflowId);
}

/**
 * Absolute path to a specific workflow document's markdown sidecar file.
 *
 * Converts the doc type to an uppercase filename (e.g. "spec" -> "SPEC.md",
 * "adl" -> "ADL.md").
 */
export function getWorkflowDocPath(
  projectDir: string,
  workflowId: string,
  docType: DocType,
): string {
  const filename = `${docType.toUpperCase().replace(/-/g, "_")}.md`;
  return path.join(getWorkflowDocDir(projectDir, workflowId), filename);
}

/** Returns the default workflow ID. */
export function getDefaultWorkflowId(): string {
  return "default";
}
