/**
 * Project name auto-detection utility.
 * Reads common manifest files to detect project name, description, and version.
 * Falls back to the directory name when no manifest is found.
 */

import { readFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";

export type ProjectSource =
  | "package.json"
  | "Cargo.toml"
  | "pyproject.toml"
  | "go.mod"
  | "directory";

export interface ProjectDetectionResult {
  name: string;
  source: ProjectSource;
  path: string;
  description?: string;
  version?: string;
}

/**
 * Detect project name from manifest files in the given directory.
 * Checks: package.json → Cargo.toml → pyproject.toml → go.mod → directory name
 */
export async function detectProjectName(
  dir: string,
): Promise<ProjectDetectionResult> {
  const resolvedDir = resolve(dir);

  const readers: Array<
    (d: string) => Promise<ProjectDetectionResult | null>
  > = [readPackageJson, readCargoToml, readPyprojectToml, readGoMod];

  for (const reader of readers) {
    const result = await reader(resolvedDir);
    if (result !== null) {
      return result;
    }
  }

  return fromDirectoryName(resolvedDir);
}

/**
 * Read a file and return its contents, or null if the file doesn't exist
 * or can't be read.
 */
async function safeReadFile(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, "utf8");
  } catch {
    return null;
  }
}

/**
 * Read package.json and extract name/description/version.
 */
async function readPackageJson(
  dir: string,
): Promise<ProjectDetectionResult | null> {
  const filePath = join(dir, "package.json");
  const contents = await safeReadFile(filePath);
  if (contents === null) {
    return null;
  }

  try {
    const parsed = JSON.parse(contents) as Record<string, unknown>;
    const name =
      typeof parsed.name === "string" && parsed.name.trim() !== ""
        ? parsed.name.trim()
        : null;

    if (name === null) {
      return null;
    }

    return {
      name,
      source: "package.json",
      path: filePath,
      ...(typeof parsed.description === "string" &&
      parsed.description.trim() !== ""
        ? { description: parsed.description.trim() }
        : {}),
      ...(typeof parsed.version === "string" && parsed.version.trim() !== ""
        ? { version: parsed.version.trim() }
        : {}),
    };
  } catch {
    // Malformed JSON — skip
    return null;
  }
}

/**
 * Read Cargo.toml and extract [package].name/version.
 * Uses simple regex parsing — no TOML library dependency.
 */
async function readCargoToml(
  dir: string,
): Promise<ProjectDetectionResult | null> {
  const filePath = join(dir, "Cargo.toml");
  const contents = await safeReadFile(filePath);
  if (contents === null) {
    return null;
  }

  // Find the [package] section and extract name/version
  const packageSection = extractTomlSection(contents, "package");
  if (packageSection === null) {
    return null;
  }

  const name = extractTomlStringValue(packageSection, "name");
  if (name === null) {
    return null;
  }

  const version = extractTomlStringValue(packageSection, "version");

  return {
    name,
    source: "Cargo.toml",
    path: filePath,
    ...(version !== null ? { version } : {}),
  };
}

/**
 * Read pyproject.toml and extract [project].name/version.
 * Uses simple regex parsing — no TOML library dependency.
 */
async function readPyprojectToml(
  dir: string,
): Promise<ProjectDetectionResult | null> {
  const filePath = join(dir, "pyproject.toml");
  const contents = await safeReadFile(filePath);
  if (contents === null) {
    return null;
  }

  // Find the [project] section and extract name/version
  const projectSection = extractTomlSection(contents, "project");
  if (projectSection === null) {
    return null;
  }

  const name = extractTomlStringValue(projectSection, "name");
  if (name === null) {
    return null;
  }

  const version = extractTomlStringValue(projectSection, "version");

  return {
    name,
    source: "pyproject.toml",
    path: filePath,
    ...(version !== null ? { version } : {}),
  };
}

/**
 * Read go.mod and extract module name (last path segment).
 */
async function readGoMod(
  dir: string,
): Promise<ProjectDetectionResult | null> {
  const filePath = join(dir, "go.mod");
  const contents = await safeReadFile(filePath);
  if (contents === null) {
    return null;
  }

  // First line should be: module github.com/user/repo
  const match = /^module\s+(\S+)/m.exec(contents);
  if (match === null) {
    return null;
  }

  const modulePath = match[1];
  // Extract the last path segment as the project name
  const segments = modulePath.split("/");
  const name = segments[segments.length - 1];

  if (!name || name.trim() === "") {
    return null;
  }

  return {
    name: name.trim(),
    source: "go.mod",
    path: filePath,
  };
}

/**
 * Fallback: use directory name.
 */
function fromDirectoryName(dir: string): ProjectDetectionResult {
  const resolvedDir = resolve(dir);
  return {
    name: basename(resolvedDir),
    source: "directory",
    path: resolvedDir,
  };
}

/**
 * Extract a TOML section's content (text between [sectionName] and the next
 * section header or end of file).
 */
function extractTomlSection(
  contents: string,
  sectionName: string,
): string | null {
  // Match [sectionName] (not [[sectionName]] which is an array of tables)
  const sectionPattern = new RegExp(
    `^\\[${escapeRegex(sectionName)}\\]\\s*$`,
    "m",
  );
  const sectionMatch = sectionPattern.exec(contents);
  if (sectionMatch === null) {
    return null;
  }

  const startIndex = sectionMatch.index + sectionMatch[0].length;
  // Find the next section header [something] or end of file
  const nextSectionMatch = /^\[/m.exec(contents.slice(startIndex));
  const endIndex =
    nextSectionMatch !== null
      ? startIndex + nextSectionMatch.index
      : contents.length;

  return contents.slice(startIndex, endIndex);
}

/**
 * Extract a string value from a TOML section.
 * Matches: key = "value" or key = 'value'
 */
function extractTomlStringValue(
  section: string,
  key: string,
): string | null {
  const pattern = new RegExp(
    `^${escapeRegex(key)}\\s*=\\s*["']([^"']+)["']`,
    "m",
  );
  const match = pattern.exec(section);
  if (match === null) {
    return null;
  }

  const value = match[1].trim();
  return value !== "" ? value : null;
}

/**
 * Escape special regex characters in a string.
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
