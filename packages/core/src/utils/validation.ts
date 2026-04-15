import { existsSync, statSync } from "fs";
import { join } from "path";

/** Check if a directory exists and is accessible. */
export function directoryExists(path: string): boolean {
  try {
    return existsSync(path) && statSync(path).isDirectory();
  } catch {
    return false;
  }
}

/** Check if a path contains `.goopspec/` (is a valid GoopSpec project). */
export function isGoopSpecProject(projectPath: string): boolean {
  return directoryExists(join(projectPath, ".goopspec"));
}

/** Generate a URL-safe kebab-case slug from arbitrary text. */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Validate that a string is a valid kebab-case slug (lowercase alphanumeric segments separated by single hyphens). */
export function isValidSlug(slug: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);
}

/** Validate a project name (non-empty, max 200 chars after trimming). */
export function isValidProjectName(name: string): boolean {
  return name.trim().length > 0 && name.trim().length <= 200;
}
