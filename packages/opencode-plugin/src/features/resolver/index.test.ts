import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createResourceResolver, defaultReferencePaths } from "./index.js";

// ---------------------------------------------------------------------------
// Test scaffold
// ---------------------------------------------------------------------------

let testDir: string;
let refsDir: string;
let tplDir: string;

function cleanup(): void {
  if (existsSync(testDir)) {
    rmSync(testDir, { recursive: true, force: true });
  }
}

beforeEach(() => {
  testDir = join(tmpdir(), `resolver-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  refsDir = join(testDir, "references");
  tplDir = join(testDir, "templates");

  mkdirSync(refsDir, { recursive: true });
  mkdirSync(tplDir, { recursive: true });

  // Seed reference files
  writeFileSync(join(refsDir, "core-protocol.md"), "# Core Protocol\nContent here.", "utf-8");
  writeFileSync(join(refsDir, "git-workflow.md"), "# Git Workflow\nCommit rules.", "utf-8");
  writeFileSync(join(refsDir, "tdd.md"), "# TDD\nRed green refactor.", "utf-8");

  // Seed template files
  writeFileSync(join(tplDir, "spec.md"), "# SPEC Template\n{{title}}", "utf-8");
  writeFileSync(join(tplDir, "blueprint.md"), "# BLUEPRINT Template\n{{waves}}", "utf-8");
});

afterEach(cleanup);

// ---------------------------------------------------------------------------
// resolve()
// ---------------------------------------------------------------------------

describe("resolve", () => {
  it("returns content for an existing reference", () => {
    const resolver = createResourceResolver({ referencesDir: refsDir, templatesDir: tplDir });
    const result = resolver.resolve("reference", "core-protocol");

    expect(result).not.toBeNull();
    expect(result?.name).toBe("core-protocol");
    expect(result?.type).toBe("reference");
    expect(result?.content).toContain("# Core Protocol");
  });

  it("returns content for an existing template", () => {
    const resolver = createResourceResolver({ referencesDir: refsDir, templatesDir: tplDir });
    const result = resolver.resolve("template", "spec");

    expect(result).not.toBeNull();
    expect(result?.name).toBe("spec");
    expect(result?.type).toBe("template");
    expect(result?.content).toContain("{{title}}");
  });

  it("returns null for a non-existent resource", () => {
    const resolver = createResourceResolver({ referencesDir: refsDir, templatesDir: tplDir });
    const result = resolver.resolve("reference", "does-not-exist");

    expect(result).toBeNull();
  });

  it("strips .md suffix from the name before resolving", () => {
    const resolver = createResourceResolver({ referencesDir: refsDir, templatesDir: tplDir });
    const result = resolver.resolve("reference", "tdd.md");

    expect(result).not.toBeNull();
    expect(result?.name).toBe("tdd");
    expect(result?.content).toContain("Red green refactor");
  });

  it("returns null when the directory does not exist", () => {
    const resolver = createResourceResolver({
      referencesDir: join(testDir, "nonexistent"),
    });
    const result = resolver.resolve("reference", "core-protocol");

    expect(result).toBeNull();
  });

  it("returns null for template type when templatesDir is not provided", () => {
    const resolver = createResourceResolver({ referencesDir: refsDir });
    const result = resolver.resolve("template", "spec");

    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// resolveMany()
// ---------------------------------------------------------------------------

describe("resolveMany", () => {
  it("resolves multiple references in input order", () => {
    const resolver = createResourceResolver({ referencesDir: refsDir, templatesDir: tplDir });
    const results = resolver.resolveMany(["git-workflow", "core-protocol"]);

    expect(results).toHaveLength(2);
    expect(results[0].name).toBe("git-workflow");
    expect(results[1].name).toBe("core-protocol");
  });

  it("skips names that do not exist", () => {
    const resolver = createResourceResolver({ referencesDir: refsDir, templatesDir: tplDir });
    const results = resolver.resolveMany(["core-protocol", "missing", "tdd"]);

    expect(results).toHaveLength(2);
    expect(results[0].name).toBe("core-protocol");
    expect(results[1].name).toBe("tdd");
  });

  it("deduplicates by name", () => {
    const resolver = createResourceResolver({ referencesDir: refsDir, templatesDir: tplDir });
    const results = resolver.resolveMany(["tdd", "tdd", "tdd.md"]);

    expect(results).toHaveLength(1);
    expect(results[0].name).toBe("tdd");
  });

  it("falls back from reference to template", () => {
    const resolver = createResourceResolver({ referencesDir: refsDir, templatesDir: tplDir });
    // "spec" exists only in templates, not references
    const results = resolver.resolveMany(["spec"]);

    expect(results).toHaveLength(1);
    expect(results[0].name).toBe("spec");
    expect(results[0].type).toBe("template");
  });

  it("returns empty array when all names are missing", () => {
    const resolver = createResourceResolver({ referencesDir: refsDir });
    const results = resolver.resolveMany(["nope", "also-nope"]);

    expect(results).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// listNames()
// ---------------------------------------------------------------------------

describe("listNames", () => {
  it("returns sorted base names for references", () => {
    const resolver = createResourceResolver({ referencesDir: refsDir, templatesDir: tplDir });
    const names = resolver.listNames("reference");

    expect(names).toEqual(["core-protocol", "git-workflow", "tdd"]);
  });

  it("returns sorted base names for templates", () => {
    const resolver = createResourceResolver({ referencesDir: refsDir, templatesDir: tplDir });
    const names = resolver.listNames("template");

    expect(names).toEqual(["blueprint", "spec"]);
  });

  it("returns empty array when directory does not exist", () => {
    const resolver = createResourceResolver({
      referencesDir: join(testDir, "nonexistent"),
    });
    const names = resolver.listNames("reference");

    expect(names).toEqual([]);
  });

  it("returns empty array for template type when templatesDir is not provided", () => {
    const resolver = createResourceResolver({ referencesDir: refsDir });
    const names = resolver.listNames("template");

    expect(names).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// resolveAll()
// ---------------------------------------------------------------------------

describe("resolveAll", () => {
  it("returns all references sorted by name", () => {
    const resolver = createResourceResolver({ referencesDir: refsDir, templatesDir: tplDir });
    const all = resolver.resolveAll("reference");

    expect(all).toHaveLength(3);
    expect(all[0].name).toBe("core-protocol");
    expect(all[1].name).toBe("git-workflow");
    expect(all[2].name).toBe("tdd");
    for (const r of all) {
      expect(r.type).toBe("reference");
      expect(r.content.length).toBeGreaterThan(0);
    }
  });

  it("returns all templates sorted by name", () => {
    const resolver = createResourceResolver({ referencesDir: refsDir, templatesDir: tplDir });
    const all = resolver.resolveAll("template");

    expect(all).toHaveLength(2);
    expect(all[0].name).toBe("blueprint");
    expect(all[1].name).toBe("spec");
  });

  it("returns empty array when directory is missing", () => {
    const resolver = createResourceResolver({
      referencesDir: join(testDir, "nonexistent"),
    });
    const all = resolver.resolveAll("reference");

    expect(all).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// defaultReferencePaths()
// ---------------------------------------------------------------------------

describe("defaultReferencePaths", () => {
  it("derives correct paths from a package root", () => {
    const paths = defaultReferencePaths("/some/package");

    expect(paths.referencesDir).toBe("/some/package/references");
    expect(paths.templatesDir).toBe("/some/package/templates");
  });
});
