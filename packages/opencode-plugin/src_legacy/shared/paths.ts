/**
 * Path utilities for GoopSpec
 * Handles resource resolution in both dev and production modes
 * 
 * @module shared/paths
 */

import { existsSync } from "fs";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "url";

import { getHomeDir } from "./platform.js";

const SHARED_RESOURCE_NAMES = ["memory.db", "config.json", "archive"] as const;

/**
 * Files that are workflow-scoped (live in .goopspec/<workflowId>/)
 */
export const WORKFLOW_SCOPED_FILES = [
  "SPEC.md",
  "BLUEPRINT.md",
  "CHRONICLE.md",
  "REQUIREMENTS.md",
  "HANDOFF.md",
  "RESEARCH.md",
  "ADL.md",
  "checkpoints/",
  "history/",
] as const;

export type WorkflowScopedFile = (typeof WORKFLOW_SCOPED_FILES)[number];

/**
 * Files that are always global (live at .goopspec/ root)
 */
export const GLOBAL_FILES = [
  "state.json",
  "config.json",
  "memory.db",
  "archive",
  "sessions/",
] as const;

export type GlobalFile = (typeof GLOBAL_FILES)[number];

type PathLike = {
  basename(value: string): string;
  resolve(...paths: string[]): string;
};

function hasSessionId(sessionId?: string): sessionId is string {
  return typeof sessionId === "string" && sessionId.trim().length > 0;
}

function isSharedResource(filename: string): boolean {
  return SHARED_RESOURCE_NAMES.some(
    (resource) => filename === resource || filename.startsWith(`${resource}/`),
  );
}

export function isDistDirectory(currentDir: string, pathImpl: PathLike = { basename, resolve }): boolean {
  return pathImpl.basename(pathImpl.resolve(currentDir)) === "dist";
}

/**
 * Get the package root directory
 * Works in both development (src/) and production (dist/) modes
 */
export function getPackageRoot(): string {
  if (process.env.GOOPSPEC_PACKAGE_ROOT) {
    return process.env.GOOPSPEC_PACKAGE_ROOT;
  }

  // In ESM, we need to derive __dirname
  const currentFile = fileURLToPath(import.meta.url);
  const currentDir = dirname(currentFile);
  
  // After bundling, we're in dist/index.js (single file)
  // In development, we're in src/shared/paths.ts
  // Check if we're in dist/ (bundled) or src/shared/ (dev)
  if (isDistDirectory(currentDir)) {
    // Bundled: go up 1 level from dist/
    return resolve(currentDir, "..");
  }
  
  // Development: go up 2 levels from src/shared/
  return resolve(currentDir, "..", "..");
}

/**
 * Check if we're running in development mode (from src/)
 */
export function isDevMode(): boolean {
  const packageRoot = getPackageRoot();
  const srcIndex = join(packageRoot, "src", "index.ts");
  return existsSync(srcIndex);
}

/**
 * Get the .goopspec directory path for a project
 */
export function getProjectGoopspecDir(projectDir: string): string {
  return join(projectDir, ".goopspec");
}

/**
 * Check if a filename is workflow-scoped
 */
export function isWorkflowScopedFile(filename: string): boolean {
  return WORKFLOW_SCOPED_FILES.some((file) => {
    if (file.endsWith("/")) {
      const dir = file.slice(0, -1);
      return filename === file || filename === dir || filename.startsWith(`${dir}/`);
    }

    return filename === file;
  });
}

/**
 * Get the workflow-scoped directory: .goopspec/<workflowId>/
 */
export function getWorkflowDir(projectDir: string, workflowId: string): string {
  if (!workflowId || workflowId === "default") {
    return getProjectGoopspecDir(projectDir);
  }

  return join(getProjectGoopspecDir(projectDir), workflowId);
}

/**
 * Get the full path for a workflow-scoped document
 * .goopspec/<workflowId>/SPEC.md, etc.
 */
export function getWorkflowDocPath(
  projectDir: string,
  workflowId: string,
  filename: string,
): string {
  return join(getWorkflowDir(projectDir, workflowId), filename);
}

/**
 * Ensure the workflow directory exists
 */
export async function ensureWorkflowDir(
  projectDir: string,
  workflowId: string,
): Promise<void> {
  if (!workflowId || workflowId === "default") {
    return;
  }

  await ensureDir(getWorkflowDir(projectDir, workflowId));
}

/**
 * Get the global goopspec config directory
 */
export function getGlobalConfigDir(): string {
  return join(getHomeDir(), ".config", "opencode");
}

/**
 * Get the global goopspec config file path
 */
export function getGlobalConfigPath(): string {
  return join(getGlobalConfigDir(), "goopspec.json");
}

/**
 * Get the directory containing bundled resources of a specific type
 */
export function getBundledResourceDir(type: string): string {
  const packageRoot = getPackageRoot();
  // Resources are at package root level: agents/, commands/, skills/, references/, templates/
  return join(packageRoot, `${type}s`);
}

/**
 * Get the project override directory for a resource type
 */
export function getProjectResourceDir(projectDir: string, type: string): string {
  return join(getProjectGoopspecDir(projectDir), `${type}s`);
}

/**
 * Check if a path exists
 */
export function pathExists(path: string): boolean {
  return existsSync(path);
}

/**
 * Ensure a directory exists, creating it if necessary
 */
export async function ensureDir(dir: string): Promise<void> {
  const { mkdir } = await import("fs/promises");
  await mkdir(dir, { recursive: true });
}

/**
 * Join paths safely
 */
export function joinPath(...paths: string[]): string {
  return join(...paths);
}

/**
 * Resolve a path to absolute
 */
export function resolvePath(...paths: string[]): string {
  return resolve(...paths);
}

/**
 * Get the session directory path for a project
 */
export function getSessionDir(projectDir = "", sessionId = ""): string {
  const normalizedSessionId = sessionId.trim();
  if (!normalizedSessionId) {
    return join(getProjectGoopspecDir(projectDir), "sessions");
  }

  return join(getProjectGoopspecDir(projectDir), "sessions", normalizedSessionId);
}

/**
 * Get .goopspec path for session-scoped or root-scoped resources
 */
export function getSessionGoopspecPath(
  projectDir = "",
  filename = "",
  sessionId?: string,
): string {
  if (isSharedResource(filename)) {
    return getSharedResourcePath(projectDir, filename);
  }

  if (!hasSessionId(sessionId)) {
    return join(getProjectGoopspecDir(projectDir), filename);
  }

  return join(getSessionDir(projectDir, sessionId), filename);
}

/**
 * Get root-level shared resource path
 */
export function getSharedResourcePath(projectDir = "", filename = ""): string {
  return join(getProjectGoopspecDir(projectDir), filename);
}

/**
 * Ensure a session directory exists with standard subdirectories
 */
export async function ensureSessionDir(projectDir = "", sessionId = ""): Promise<void> {
  if (!hasSessionId(sessionId)) {
    return;
  }

  const sessionDir = getSessionDir(projectDir, sessionId);
  await ensureDir(sessionDir);
  await ensureDir(join(sessionDir, "checkpoints"));
  await ensureDir(join(sessionDir, "history"));
}

// ---------------------------------------------------------------------------
// Cross-platform path normalization utilities
// ---------------------------------------------------------------------------

/**
 * Normalize a path to use forward slashes on all platforms.
 * Converts Windows backslashes, collapses double backslashes,
 * and handles UNC paths (\\server\share → //server/share).
 * Unix paths pass through unchanged.
 */
export function normalizePath(p: string): string {
  return p.replace(/\\/g, "/");
}

/**
 * Returns the GoopSpec home directory (~/.goopspec).
 * Uses os.homedir() + path.join for cross-platform safety.
 * Never ends with a trailing slash.
 */
export function goopspecHome(): string {
  return join(homedir(), ".goopspec");
}

/**
 * Returns path to the GoopSpec config file (~/.goopspec/config.json).
 */
export function goopspecConfigPath(): string {
  return join(goopspecHome(), "config.json");
}

/**
 * Returns path to the GoopSpec memory database (~/.goopspec/memory.db).
 */
export function goopspecMemoryPath(): string {
  return join(goopspecHome(), "memory.db");
}

/**
 * Cross-platform absolute path check.
 * Handles Windows drive letters (C:\..., D:/...) and Unix paths (/...).
 */
export function isAbsolutePath(p: string): boolean {
  // Node's path.isAbsolute handles platform-native paths, but on Linux
  // it won't recognise "C:\foo" as absolute. We add an explicit check
  // for Windows drive-letter patterns so the function works correctly
  // regardless of the host OS.
  if (/^[A-Za-z]:[/\\]/.test(p)) {
    return true;
  }
  return isAbsolute(p);
}

/**
 * Safely join path segments and normalize the result to forward slashes.
 */
export function safePath(...segments: string[]): string {
  return normalizePath(join(...segments));
}
