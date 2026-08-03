import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createResourceResolver, defaultReferencePaths } from "./index.js";

interface ReferencePointer {
  name: string;
  rawPointer: string;
  sourceFile: string;
}

/**
 * Extract only the two runtime-supported pointer syntaxes. Placeholder names
 * such as `<name>` are documentation examples, not live pointers.
 */
function extractReferencePointers(content: string, sourceFile: string): ReferencePointer[] {
  const pointers: ReferencePointer[] = [];
  const invocationPattern = /goop_reference\s*\(\s*\{\s*name\s*:\s*(["'`])([^"'`]+)\1\s*\}\s*\)/g;
  const pathPattern = /references\/[A-Za-z0-9][A-Za-z0-9_-]*\.md/g;

  for (const match of content.matchAll(invocationPattern)) {
    const name = match[2];
    if (name.startsWith("<") && name.endsWith(">")) continue;
    pointers.push({ name, rawPointer: match[0], sourceFile });
  }

  for (const match of content.matchAll(pathPattern)) {
    const rawPointer = match[0];
    pointers.push({ name: rawPointer.slice("references/".length, -3), rawPointer, sourceFile });
  }

  return pointers;
}

function readPromptFiles(directory: string): Array<{ content: string; sourceFile: string }> {
  return readdirSync(directory)
    .filter((fileName) => fileName.endsWith(".md"))
    .sort()
    .map((fileName) => ({
      content: readFileSync(join(directory, fileName), "utf-8"),
      sourceFile: join(directory, fileName),
    }));
}

function findUnresolvedPointers(
  pointers: ReferencePointer[],
  resolver: ReturnType<typeof createResourceResolver>,
): string[] {
  return pointers
    .filter((pointer) => resolver.resolve("reference", pointer.name) === null)
    .map(
      (pointer) =>
        `${pointer.sourceFile}: ${pointer.rawPointer} -> missing reference '${pointer.name}'`,
    );
}

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
// Real prompt reference pointers
// ---------------------------------------------------------------------------

describe("real prompt reference pointers", () => {
  const packageRoot = join(import.meta.dir, "../../..");
  const agentsDir = join(packageRoot, "agents");
  const commandsDir = join(packageRoot, "commands");
  const referencesDir = join(packageRoot, "references");

  it("extracts goop_reference name pointers with supported quote and spacing variants", () => {
    const pointers = extractReferencePointers(
      'goop_reference({name:\'core-protocol\'}) and goop_reference( { name : "git-workflow" } )',
      "synthetic.md",
    );

    expect(pointers.map((pointer) => pointer.name)).toEqual(["core-protocol", "git-workflow"]);
    expect(pointers[0].rawPointer).toBe("goop_reference({name:'core-protocol'})");
  });

  it("extracts references markdown paths and excludes placeholder examples", () => {
    const pointers = extractReferencePointers(
      'See `references/phase-gates.md`; load with goop_reference({ name: "<name>" }).',
      "synthetic.md",
    );

    expect(pointers).toEqual([
      { name: "phase-gates", rawPointer: "references/phase-gates.md", sourceFile: "synthetic.md" },
    ]);
  });

  it("detects a deliberately broken pointer with source and target diagnostics", () => {
    const resolver = createResourceResolver({ referencesDir });
    const failures = findUnresolvedPointers(
      [
        {
          name: "does-not-exist",
          rawPointer: 'goop_reference({ name: "does-not-exist" })',
          sourceFile: "synthetic-agent.md",
        },
      ],
      resolver,
    );

    expect(failures).toEqual([
      "synthetic-agent.md: goop_reference({ name: \"does-not-exist\" }) -> missing reference 'does-not-exist'",
    ]);
  });

  it("resolves every live pointer in all real agent and command prose", () => {
    const promptFiles = [...readPromptFiles(agentsDir), ...readPromptFiles(commandsDir)];
    const pointers = promptFiles.flatMap(({ content, sourceFile }) =>
      extractReferencePointers(content, sourceFile),
    );
    const resolver = createResourceResolver({ referencesDir });
    const failures = findUnresolvedPointers(pointers, resolver);

    if (failures.length > 0) {
      throw new Error(`Dangling reference pointers:\n${failures.join("\n")}`);
    }

    expect(promptFiles).toHaveLength(23);
    expect(pointers.length).toBeGreaterThan(0);
    expect(new Set(pointers.map((pointer) => pointer.name)).size).toBeGreaterThan(0);
  });
});

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
