/**
 * Path helpers for GoopSpec 1.0.0 plugin.
 */

import { existsSync } from "node:fs";
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

/** Absolute path to the GoopSpec unified SQLite database for a project. */
export function getDbPath(projectDir: string): string {
  return join(projectDir, GOOPSPEC_DIR, "goopspec.db");
}

/**
 * Resolve the plugin package root: the directory containing the bundled
 * resource folders (`references/`, `templates/`, `agents/`, `commands/`).
 *
 * This must work across three distinct layouts, where this module lives at a
 * different depth relative to the package root in each:
 *   1. Source / tests:  `src/shared/paths.ts`                     (2 levels deep)
 *   2. Bundled dist:    `dist/index.js` (single inlined file)     (1 level deep)
 *   3. Installed:       `node_modules/@goopspec/opencode-plugin/dist/index.js`
 *
 * Because `bun build` inlines this module into a single `dist/index.js`, a
 * fixed "N levels up" walk is fragile — it overshoots for the bundle. Instead
 * we walk up from this file until we reach the nearest ancestor that actually
 * carries the package markers (`package.json` + `references/`).
 *
 * Never throws — falls back to the legacy two-levels-up heuristic if no marker
 * directory is found.
 */
export function getPackageRoot(): string {
  const thisFile = fileURLToPath(import.meta.url);
  let dir = dirname(thisFile);

  while (true) {
    if (existsSync(join(dir, "package.json")) && existsSync(join(dir, "references"))) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) break; // reached the filesystem root
    dir = parent;
  }

  // Fallback: legacy heuristic (two directories above this file's dir).
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
