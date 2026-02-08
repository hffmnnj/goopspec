/**
 * Path utilities for GoopSpec
 * Handles resource resolution in both dev and production modes
 * 
 * @module shared/paths
 */

import { existsSync } from "fs";
import { basename, dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

import { getHomeDir } from "./platform.js";

const SHARED_RESOURCE_NAMES = ["memory.db", "config.json", "archive"] as const;

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
