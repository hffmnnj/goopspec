import { afterEach, beforeEach, describe, expect, it } from "bun:test";

import type { PluginContext, ToolContext } from "../../test-utils.js";
import {
  createMockPluginContext,
  createMockToolContext,
  setupTestEnvironment,
} from "../../test-utils.js";
import { createMemorySaveTool } from "./index.js";

describe("memory_save tool", () => {
  let ctx: PluginContext;
  let toolCtx: ToolContext;
  let cleanup: () => void;

  beforeEach(() => {
    const env = setupTestEnvironment("memory-save");
    cleanup = env.cleanup;
    ctx = createMockPluginContext({ testDir: env.testDir });
    toolCtx = createMockToolContext();
  });

  afterEach(() => cleanup());

  // -------------------------------------------------------------------------
  // Basic save (observation — default type)
  // -------------------------------------------------------------------------

  it("saves an observation with default type and importance", async () => {
    const tool = createMemorySaveTool(ctx);
    const result = await tool.execute(
      { title: "Test observation", content: "Some content" },
      toolCtx,
    );

    expect(result).toContain("Memory saved successfully!");
    expect(result).toContain("**ID:** 1");
    expect(result).toContain("**Type:** observation");
    expect(result).toContain("**Importance:** 5/10");
  });

  it("saves with explicit type, concepts, facts, sourceFiles", async () => {
    const tool = createMemorySaveTool(ctx);
    const result = await tool.execute(
      {
        title: "Pattern found",
        content: "Repository pattern used in src/data/",
        type: "observation",
        concepts: ["patterns", "architecture"],
        facts: ["Uses repository pattern"],
        sourceFiles: ["src/data/repo.ts"],
        importance: 8,
      },
      toolCtx,
    );

    expect(result).toContain("Memory saved successfully!");
    expect(result).toContain("**Facts:** 1 recorded");
    expect(result).toContain("**Concepts:** patterns, architecture");
  });

  // -------------------------------------------------------------------------
  // Decision type (absorbs old memory_decision)
  // -------------------------------------------------------------------------

  it("saves a decision with reasoning and alternatives folded into content", async () => {
    const tool = createMemorySaveTool(ctx);
    const result = await tool.execute(
      {
        title: "Use PostgreSQL for storage",
        content: "Chose PostgreSQL as the primary database.",
        type: "decision",
        reasoning: "Better JSON support and complex query capabilities.",
        alternatives: ["MySQL", "MongoDB", "SQLite"],
        concepts: ["database", "architecture"],
      },
      toolCtx,
    );

    expect(result).toContain("Memory saved successfully!");
    expect(result).toContain("**Type:** decision");
    // Default importance for decisions is 7
    expect(result).toContain("**Importance:** 7/10");
    expect(result).toContain("**Reasoning:** included");
    expect(result).toContain("**Alternatives:** 3 considered");
  });

  it("auto-generates facts for decisions when none supplied", async () => {
    const tool = createMemorySaveTool(ctx);
    await tool.execute(
      {
        title: "Use jose for JWT",
        content: "Selected jose library.",
        type: "decision",
        alternatives: ["jsonwebtoken"],
      },
      toolCtx,
    );

    // Verify the mock memory received auto-generated facts
    const searchResults = await ctx.memory.search({ query: "jose" });
    expect(searchResults.length).toBe(1);
    // The stored content should include the alternatives section
    expect(searchResults[0].memory.content).toContain("## Alternatives Considered");
    expect(searchResults[0].memory.content).toContain("- jsonwebtoken");
  });

  it("preserves explicit facts for decisions", async () => {
    const tool = createMemorySaveTool(ctx);
    await tool.execute(
      {
        title: "Use Vitest",
        content: "Chose Vitest for testing.",
        type: "decision",
        facts: ["Vitest is faster than Jest with Bun"],
        alternatives: ["Jest"],
      },
      toolCtx,
    );

    const searchResults = await ctx.memory.search({ query: "Vitest" });
    expect(searchResults.length).toBe(1);
    expect(searchResults[0].memory.facts).toEqual(["Vitest is faster than Jest with Bun"]);
  });

  // -------------------------------------------------------------------------
  // Note type (absorbs old memory_note)
  // -------------------------------------------------------------------------

  it("saves a note with lower default importance", async () => {
    const tool = createMemorySaveTool(ctx);
    const result = await tool.execute(
      {
        title: "Auth tests are flaky on CI",
        content: "Auth tests are flaky on CI",
        type: "note",
      },
      toolCtx,
    );

    expect(result).toContain("Memory saved successfully!");
    expect(result).toContain("**Type:** note");
    expect(result).toContain("**Importance:** 4/10");
  });

  // -------------------------------------------------------------------------
  // Todo type
  // -------------------------------------------------------------------------

  it("saves a todo", async () => {
    const tool = createMemorySaveTool(ctx);
    const result = await tool.execute(
      {
        title: "Refactor auth middleware",
        content: "Extract shared auth logic into a helper.",
        type: "todo",
      },
      toolCtx,
    );

    expect(result).toContain("**Type:** todo");
    expect(result).toContain("**Importance:** 5/10");
  });

  // -------------------------------------------------------------------------
  // Importance normalisation
  // -------------------------------------------------------------------------

  it("scales 0-1 importance values to 1-10", async () => {
    const tool = createMemorySaveTool(ctx);
    const result = await tool.execute(
      {
        title: "Scaled importance",
        content: "Testing 0.8 → 8",
        importance: 0.8,
      },
      toolCtx,
    );

    expect(result).toContain("**Importance:** 8/10");
  });

  it("rejects importance outside 1-10 range", async () => {
    const tool = createMemorySaveTool(ctx);
    const result = await tool.execute(
      {
        title: "Bad importance",
        content: "Testing",
        importance: 15,
      },
      toolCtx,
    );

    expect(result).toContain("Error: Importance must be between 1 and 10");
  });

  // -------------------------------------------------------------------------
  // Validation
  // -------------------------------------------------------------------------

  it("rejects titles longer than 100 characters", async () => {
    const tool = createMemorySaveTool(ctx);
    const result = await tool.execute(
      {
        title: "A".repeat(101),
        content: "Content",
      },
      toolCtx,
    );

    expect(result).toContain("Error: Title must be 100 characters or less");
  });

  // -------------------------------------------------------------------------
  // Error handling
  // -------------------------------------------------------------------------

  it("returns error message on save failure (never throws)", async () => {
    // Override memory.save to throw
    const brokenCtx = createMockPluginContext({ testDir: "/tmp/broken" });
    brokenCtx.memory.save = async () => {
      throw new Error("Database locked");
    };

    const tool = createMemorySaveTool(brokenCtx);
    const result = await tool.execute({ title: "Test", content: "Content" }, toolCtx);

    expect(result).toContain("Error saving memory: Database locked");
  });
});
