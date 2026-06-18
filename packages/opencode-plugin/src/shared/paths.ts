/**
 * Path helpers for GoopSpec 1.0.0 plugin.
 */

import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { GOOPSPEC_DIR } from "../core/constants.js";

/** Absolute path to the `.goopspec` directory for a project. */
export function getGoopspecDir(projectDir: string): string {
  return join(projectDir, GOOPSPEC_DIR);
}

/** Absolute path to the memory SQLite database for a project. */
export function getMemoryDbPath(projectDir: string): string {
  return join(projectDir, GOOPSPEC_DIR, "memory.db");
}

/**
 * Resolve the plugin package root (the directory containing `references/`,
 * `templates/`, `agents/`, etc.).
 *
 * Works by walking up from this file's location (`src/shared/paths.ts`)
 * to the package root (two levels up from `src/`).
 */
export function getPackageRoot(): string {
  const thisFile = fileURLToPath(import.meta.url);
  // thisFile → <root>/src/shared/paths.ts  (or dist/shared/paths.js)
  // package root is two directories above the `shared/` dir
  return resolve(dirname(thisFile), "..", "..");
}

/**
 * Absolute path to a workflow-scoped document within `.goopspec/`.
 *
 * For the "default" workflow, docs live at `.goopspec/default/<filename>`.
 * For named workflows, docs live at `.goopspec/<workflowId>/<filename>`.
 */
export function getWorkflowDocPath(
  projectDir: string,
  workflowId: string,
  filename: string,
): string {
  return join(projectDir, GOOPSPEC_DIR, workflowId, filename);
}

/** Path to project-root goopspec.json (user-facing config). */
export function getProjectGoopspecJsonPath(projectDir: string): string {
  return join(projectDir, "goopspec.json");
}

/**
 * Path to the global GoopSpec config (~/.config/opencode/goopspec.json).
 *
 * Override with GOOPSPEC_GLOBAL_CONFIG_PATH env var (useful for testing).
 */
export function getGlobalConfigPath(): string {
  if (process.env.GOOPSPEC_GLOBAL_CONFIG_PATH) {
    return process.env.GOOPSPEC_GLOBAL_CONFIG_PATH;
  }
  return join(homedir(), ".config", "opencode", "goopspec.json");
}
