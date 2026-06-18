/**
 * File-backed ResourceResolver implementation.
 *
 * Resolves `.md` resources from disk directories. References and templates
 * each live in their own directory as `<name>.md` files.
 *
 * All filesystem access degrades gracefully — missing directories or
 * unreadable files return null/[] instead of throwing.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";

import type { ResourceType } from "../../core/constants.js";
import type { ResolvedResource, ResourceResolver } from "../../core/types.js";

// ---------------------------------------------------------------------------
// Factory options
// ---------------------------------------------------------------------------

export interface ResourceResolverOptions {
  referencesDir: string;
  templatesDir?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Return the directory path for a given resource type. */
function dirForType(opts: ResourceResolverOptions, type: ResourceType): string | undefined {
  if (type === "reference") return opts.referencesDir;
  if (type === "template") return opts.templatesDir;
  return undefined;
}

/** Strip a trailing `.md` extension if present. */
function stripMdExtension(name: string): string {
  return name.endsWith(".md") ? name.slice(0, -3) : name;
}

/** Read a single resource file. Returns null on any failure. */
function readResource(dir: string, name: string, type: ResourceType): ResolvedResource | null {
  const cleanName = stripMdExtension(name);
  const filePath = join(dir, `${cleanName}.md`);

  try {
    if (!existsSync(filePath)) return null;
    const content = readFileSync(filePath, "utf-8");
    return { name: cleanName, type, content };
  } catch {
    return null;
  }
}

/** List all `.md` base names in a directory, sorted. Returns [] on failure. */
function listMdNames(dir: string): string[] {
  try {
    if (!existsSync(dir)) return [];
    const entries = readdirSync(dir, { withFileTypes: true });
    return entries
      .filter((e) => e.isFile() && e.name.endsWith(".md"))
      .map((e) => basename(e.name, ".md"))
      .sort();
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a file-backed `ResourceResolver`.
 *
 * @param opts.referencesDir  Absolute path to the references directory.
 * @param opts.templatesDir   Absolute path to the templates directory (optional).
 */
export function createResourceResolver(opts: ResourceResolverOptions): ResourceResolver {
  return {
    resolve(type: ResourceType, name: string): ResolvedResource | null {
      const dir = dirForType(opts, type);
      if (!dir) return null;
      return readResource(dir, name, type);
    },

    resolveMany(names: string[]): ResolvedResource[] {
      const results: ResolvedResource[] = [];
      const seen = new Set<string>();

      for (const rawName of names) {
        const name = stripMdExtension(rawName);
        if (seen.has(name)) continue;

        // Try reference first, then template
        const refDir = dirForType(opts, "reference");
        const tplDir = dirForType(opts, "template");

        let resolved: ResolvedResource | null = null;
        if (refDir) resolved = readResource(refDir, name, "reference");
        if (!resolved && tplDir) resolved = readResource(tplDir, name, "template");

        if (resolved) {
          seen.add(name);
          results.push(resolved);
        }
      }

      return results;
    },

    resolveAll(type: ResourceType): ResolvedResource[] {
      const dir = dirForType(opts, type);
      if (!dir) return [];

      const names = listMdNames(dir);
      const results: ResolvedResource[] = [];

      for (const name of names) {
        const resource = readResource(dir, name, type);
        if (resource) results.push(resource);
      }

      return results;
    },

    listNames(type: ResourceType): string[] {
      const dir = dirForType(opts, type);
      if (!dir) return [];
      return listMdNames(dir);
    },
  };
}

// ---------------------------------------------------------------------------
// Default path helper
// ---------------------------------------------------------------------------

/**
 * Derive the default reference/template directory paths from a package root.
 *
 * The plugin entry point (or context factory) calls this to resolve absolute
 * paths before passing them into `createResourceResolver`.
 */
export function defaultReferencePaths(packageRoot: string): {
  referencesDir: string;
  templatesDir: string;
} {
  return {
    referencesDir: join(packageRoot, "references"),
    templatesDir: join(packageRoot, "templates"),
  };
}
