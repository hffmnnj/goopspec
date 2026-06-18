/**
 * Tests for the archive subsystem.
 *
 * Uses temp directories for isolation. MemoryManager is injected via the
 * mock factory from test-utils.ts — no real database involved.
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { MemoryManager } from "../../core/types.js";
import { createMockMemory, setupTestEnvironment } from "../../test-utils.js";
import { archiveWorkflow, extractLearnings, generateRetrospective, listArchived } from "./index.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Scaffold a workflow directory with sample docs. */
function scaffoldWorkflow(
  testDir: string,
  workflowId: string,
  docs: Record<string, string> = {},
): string {
  const goopDir = join(testDir, ".goopspec");
  const wfDir = workflowId === "default" ? goopDir : join(goopDir, workflowId);
  mkdirSync(wfDir, { recursive: true });

  const defaults: Record<string, string> = {
    "SPEC.md": "# Spec\n\nDecision: Use TypeScript\nDecision: Use Bun runtime\n",
    "BLUEPRINT.md": "# Blueprint\n\n## Wave 1\n\n### Task 1.1: Setup\n",
    "CHRONICLE.md": [
      "# Chronicle",
      "",
      "## Wave 1",
      "",
      "- Task 1.1: Setup (2025-01-10)",
      "- [x] Task 1.2: Config (2025-01-15)",
      "",
      "## Wave 2",
      "",
      "- Task 2.1: Build",
    ].join("\n"),
  };

  for (const [filename, content] of Object.entries({ ...defaults, ...docs })) {
    writeFileSync(join(wfDir, filename), content, "utf-8");
  }

  return wfDir;
}

// ---------------------------------------------------------------------------
// archiveWorkflow
// ---------------------------------------------------------------------------

describe("archiveWorkflow", () => {
  let testDir: string;
  let cleanup: () => void;

  beforeEach(() => {
    const env = setupTestEnvironment("archive-test");
    testDir = env.testDir;
    cleanup = env.cleanup;
  });

  afterEach(() => cleanup());

  it("archives a non-default workflow and returns an ArchiveEntry", async () => {
    scaffoldWorkflow(testDir, "feat-auth");

    const entry = await archiveWorkflow({
      projectDir: testDir,
      workflowId: "feat-auth",
    });

    expect(entry.id).toStartWith("feat-auth-");
    expect(entry.name).toBe("feat-auth");
    expect(entry.archivedAt).toBeTruthy();
    expect(existsSync(entry.path)).toBe(true);

    // Archived docs should exist in destination
    expect(existsSync(join(entry.path, "SPEC.md"))).toBe(true);
    expect(existsSync(join(entry.path, "CHRONICLE.md"))).toBe(true);
    expect(existsSync(join(entry.path, "RETROSPECTIVE.md"))).toBe(true);
    expect(existsSync(join(entry.path, "LEARNINGS.md"))).toBe(true);
  });

  it("moves docs from workflow dir (non-default) and cleans up source", async () => {
    const wfDir = scaffoldWorkflow(testDir, "feat-payments");

    await archiveWorkflow({
      projectDir: testDir,
      workflowId: "feat-payments",
    });

    // Source workflow directory should be removed
    expect(existsSync(wfDir)).toBe(false);
  });

  it("copies docs for default workflow without destroying root .goopspec/", async () => {
    scaffoldWorkflow(testDir, "default");

    const entry = await archiveWorkflow({
      projectDir: testDir,
      workflowId: "default",
    });

    // Archive should exist
    expect(existsSync(join(entry.path, "SPEC.md"))).toBe(true);

    // Original .goopspec/ root should still have state.json (not destroyed)
    expect(existsSync(join(testDir, ".goopspec", "state.json"))).toBe(true);
  });

  it("uses provided retrospective content instead of generating template", async () => {
    scaffoldWorkflow(testDir, "feat-custom");
    const customRetro = "# My Custom Retrospective\n\nEverything went great.";

    const entry = await archiveWorkflow({
      projectDir: testDir,
      workflowId: "feat-custom",
      retrospective: customRetro,
    });

    const content = readFileSync(join(entry.path, "RETROSPECTIVE.md"), "utf-8");
    expect(content).toBe(customRetro);
  });

  it("persists learnings to memory when MemoryManager is provided", async () => {
    scaffoldWorkflow(testDir, "feat-mem", {
      "SPEC.md": "# Spec\n\nDecision: Use PostgreSQL for persistence\n",
      "CHRONICLE.md": "# Chronicle\n\n## Wave 1\n\n- Task 1.1: DB setup\n",
    });

    const memory = createMockMemory();

    await archiveWorkflow({
      projectDir: testDir,
      workflowId: "feat-mem",
      memory,
    });

    // Should have saved at least the main summary entry
    const results = await memory.search({ query: "Milestone Complete" });
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].memory.title).toContain("feat-mem");
  });

  it("persists individual patterns, decisions, and gotchas to memory", async () => {
    scaffoldWorkflow(testDir, "feat-detail", {
      "SPEC.md": "# Spec\n\nDecision: Use event sourcing\nDecision: Use CQRS\n",
      "CHRONICLE.md": "# Chronicle\n",
    });

    const memory = createMockMemory();
    const customRetro = [
      "# Retrospective",
      "",
      "Pattern: Event sourcing simplified audit trail",
      "Gotcha: CQRS adds complexity for simple queries",
    ].join("\n");

    await archiveWorkflow({
      projectDir: testDir,
      workflowId: "feat-detail",
      retrospective: customRetro,
      memory,
    });

    // Check for decision entries
    const decisions = await memory.search({ query: "Decision" });
    expect(decisions.length).toBeGreaterThanOrEqual(1);

    // Check for pattern entries
    const patterns = await memory.search({ query: "Pattern" });
    expect(patterns.length).toBeGreaterThanOrEqual(1);

    // Check for gotcha entries
    const gotchas = await memory.search({ query: "Gotcha" });
    expect(gotchas.length).toBeGreaterThanOrEqual(1);
  });

  it("throws when workflow directory does not exist", async () => {
    await expect(
      archiveWorkflow({
        projectDir: testDir,
        workflowId: "nonexistent",
      }),
    ).rejects.toThrow("Workflow directory not found");
  });

  it("throws when workflow directory has no documents", async () => {
    const wfDir = join(testDir, ".goopspec", "empty-wf");
    mkdirSync(wfDir, { recursive: true });
    writeFileSync(join(wfDir, "random.txt"), "not a workflow doc", "utf-8");

    await expect(
      archiveWorkflow({
        projectDir: testDir,
        workflowId: "empty-wf",
      }),
    ).rejects.toThrow("No workflow documents found");
  });

  it("handles missing optional docs gracefully (only SPEC.md present)", async () => {
    const wfDir = join(testDir, ".goopspec", "minimal");
    mkdirSync(wfDir, { recursive: true });
    writeFileSync(join(wfDir, "SPEC.md"), "# Minimal Spec\n", "utf-8");

    const entry = await archiveWorkflow({
      projectDir: testDir,
      workflowId: "minimal",
    });

    expect(existsSync(join(entry.path, "SPEC.md"))).toBe(true);
    expect(existsSync(join(entry.path, "RETROSPECTIVE.md"))).toBe(true);
    expect(existsSync(join(entry.path, "LEARNINGS.md"))).toBe(true);
    // CHRONICLE.md was not in source, so should not be in archive
    expect(existsSync(join(entry.path, "CHRONICLE.md"))).toBe(false);
  });

  it("succeeds even when memory.save throws", async () => {
    scaffoldWorkflow(testDir, "feat-fail-mem");

    const brokenMemory: MemoryManager = {
      save: async () => {
        throw new Error("DB connection lost");
      },
      search: async () => [],
      getById: async () => null,
      forget: async () => false,
      forgetByQuery: async () => 0,
    };

    // Should not throw — graceful degradation
    const entry = await archiveWorkflow({
      projectDir: testDir,
      workflowId: "feat-fail-mem",
      memory: brokenMemory,
    });

    expect(entry.id).toStartWith("feat-fail-mem-");
    expect(existsSync(entry.path)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// generateRetrospective
// ---------------------------------------------------------------------------

describe("generateRetrospective", () => {
  it("returns markdown with the workflow ID in the title", () => {
    const result = generateRetrospective("feat-auth");
    expect(result).toContain("# Retrospective: feat-auth");
    expect(result).toContain("**Completed:**");
  });

  it("includes all template sections", () => {
    const result = generateRetrospective("test-wf");
    expect(result).toContain("## What Went Well");
    expect(result).toContain("## What Could Be Improved");
    expect(result).toContain("## Key Decisions");
    expect(result).toContain("## Challenges Faced");
    expect(result).toContain("## Learnings for Next Time");
  });
});

// ---------------------------------------------------------------------------
// extractLearnings
// ---------------------------------------------------------------------------

describe("extractLearnings", () => {
  it("extracts decisions from spec content", () => {
    const spec = "Decision: Use PostgreSQL\nDecision: Use event sourcing\n";
    const result = extractLearnings(spec, "", "");

    expect(result.decisions).toContain("Use PostgreSQL");
    expect(result.decisions).toContain("Use event sourcing");
  });

  it("extracts patterns from retrospective", () => {
    const retro = "Pattern: TDD reduced bugs\nApproach: Vertical slices worked well\n";
    const result = extractLearnings("", "", retro);

    expect(result.patterns.length).toBeGreaterThanOrEqual(1);
    expect(result.patterns.some((p) => p.includes("TDD"))).toBe(true);
  });

  it("extracts gotchas from retrospective", () => {
    const retro = "Gotcha: FTS5 requires special escaping\nChallenge: Cross-device rename fails\n";
    const result = extractLearnings("", "", retro);

    expect(result.gotchas.length).toBeGreaterThanOrEqual(1);
    expect(result.gotchas.some((g) => g.includes("FTS5"))).toBe(true);
  });

  it("deduplicates decisions across spec and retrospective", () => {
    const spec = "Decision: Use TypeScript\n";
    const retro = "Decision: Use TypeScript\nDecision: Use Bun\n";
    const result = extractLearnings(spec, "", retro);

    const tsCount = result.decisions.filter((d) => d === "Use TypeScript").length;
    expect(tsCount).toBe(1);
  });

  it("returns defaults when no patterns are found", () => {
    const result = extractLearnings("", "", "");

    expect(result.patterns).toEqual(["No specific patterns documented"]);
    expect(result.decisions).toEqual(["No specific decisions documented"]);
    expect(result.gotchas).toEqual(["No specific gotchas documented"]);
  });

  it("extracts task count from chronicle", () => {
    const chronicle = [
      "# Chronicle",
      "- Task 1.1: Setup",
      "- [x] Task 1.2: Config",
      "- Task 2.1: Build",
    ].join("\n");

    const result = extractLearnings("", chronicle, "");
    expect(result.metrics.taskCount).toBe(3);
  });

  it("extracts wave count from chronicle", () => {
    const chronicle = "## Wave 1\n\nstuff\n\n## Wave 2\n\nmore stuff\n";
    const result = extractLearnings("", chronicle, "");
    expect(result.metrics.waveCount).toBe(2);
  });

  it("calculates duration from dates in documents", () => {
    const chronicle = "Started: 2025-01-01\nCompleted: 2025-01-11\n";
    const result = extractLearnings("", chronicle, "");
    expect(result.metrics.durationDays).toBe(10);
  });

  it("handles empty inputs without throwing", () => {
    const result = extractLearnings("", "", "");
    expect(result.metrics.taskCount).toBe(0);
    expect(result.metrics.waveCount).toBe(0);
    expect(result.metrics.durationDays).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// listArchived
// ---------------------------------------------------------------------------

describe("listArchived", () => {
  let testDir: string;
  let cleanup: () => void;

  beforeEach(() => {
    const env = setupTestEnvironment("archive-list-test");
    testDir = env.testDir;
    cleanup = env.cleanup;
  });

  afterEach(() => cleanup());

  it("returns empty array when no archives exist", () => {
    const result = listArchived(testDir);
    expect(result).toEqual([]);
  });

  it("lists archived workflows after archiving", async () => {
    scaffoldWorkflow(testDir, "feat-a");
    scaffoldWorkflow(testDir, "feat-b");

    await archiveWorkflow({ projectDir: testDir, workflowId: "feat-a" });
    await archiveWorkflow({ projectDir: testDir, workflowId: "feat-b" });

    const result = listArchived(testDir);
    expect(result.length).toBe(2);
    expect(result.some((e) => e.id.startsWith("feat-a-"))).toBe(true);
    expect(result.some((e) => e.id.startsWith("feat-b-"))).toBe(true);
  });

  it("sorts archives newest-first", async () => {
    scaffoldWorkflow(testDir, "feat-old");
    await archiveWorkflow({ projectDir: testDir, workflowId: "feat-old" });

    // Small delay to ensure different mtime
    await new Promise((r) => setTimeout(r, 50));

    scaffoldWorkflow(testDir, "feat-new");
    await archiveWorkflow({ projectDir: testDir, workflowId: "feat-new" });

    const result = listArchived(testDir);
    expect(result.length).toBe(2);
    expect(result[0].id).toStartWith("feat-new-");
  });

  it("returns empty array for nonexistent project dir", () => {
    const result = listArchived("/tmp/nonexistent-project-dir-xyz");
    expect(result).toEqual([]);
  });
});
