import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import type { ResolvedResource } from "../../core/types.js";
import {
  type PluginContext,
  createMockPluginContext,
  createMockToolContext,
  setupTestEnvironment,
} from "../../test-utils.js";
import { createGoopReferenceTool } from "./index.js";

// ---------------------------------------------------------------------------
// Seed data
// ---------------------------------------------------------------------------

const SAMPLE_REFERENCES: ResolvedResource[] = [
  {
    name: "executor-core",
    type: "reference",
    content: [
      "# Executor Core Protocol",
      "",
      "## Scope",
      "",
      "Use this reference for all code implementation tasks.",
      "",
      "## Commit Format",
      "",
      "Use `type(scope): description` format.",
      "",
      "## Anti-Patterns",
      "",
      "Never start without loading state.",
    ].join("\n"),
  },
  {
    name: "git-workflow",
    type: "reference",
    content: [
      "# Git Workflow",
      "",
      "## Branch Naming",
      "",
      "Format: `type/short-description`",
      "",
      "## Commit Messages",
      "",
      "Follow conventional commits.",
    ].join("\n"),
  },
  {
    name: "deviation-rules",
    type: "reference",
    content: [
      "# Deviation Rules",
      "",
      "## Rule 1: Bugs",
      "",
      "Fix immediately without asking.",
      "",
      "## Rule 4: Architectural Changes",
      "",
      "STOP and ask user.",
    ].join("\n"),
  },
  {
    name: "agent-prompt",
    type: "template",
    content: "# Agent Prompt Template\n\nYou are a {{role}} agent.",
  },
];

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe("goop_reference tool", () => {
  let ctx: PluginContext;
  let cleanup: () => void;

  beforeEach(() => {
    const env = setupTestEnvironment("goop-reference-test");
    cleanup = env.cleanup;
    ctx = createMockPluginContext({
      testDir: env.testDir,
      resources: SAMPLE_REFERENCES,
    });
  });

  afterEach(() => cleanup());

  // -------------------------------------------------------------------------
  // Single-load
  // -------------------------------------------------------------------------

  describe("single-load", () => {
    it("loads a reference by name", async () => {
      const tool = createGoopReferenceTool(ctx);
      const result = await tool.execute({ name: "executor-core" }, createMockToolContext());

      expect(result).toContain("## Reference: executor-core");
      expect(result).toContain("Executor Core Protocol");
      expect(result).toContain("**Type:** reference");
    });

    it("loads a template by name and type", async () => {
      const tool = createGoopReferenceTool(ctx);
      const result = await tool.execute(
        { name: "agent-prompt", type: "template" },
        createMockToolContext(),
      );

      expect(result).toContain("## Reference: agent-prompt");
      expect(result).toContain("**Type:** template");
      expect(result).toContain("Agent Prompt Template");
    });

    it("falls back to other type when primary type misses", async () => {
      const tool = createGoopReferenceTool(ctx);
      // Request as reference, but it's a template — should fallback
      const result = await tool.execute({ name: "agent-prompt" }, createMockToolContext());

      expect(result).toContain("Agent Prompt Template");
    });

    it("returns not-found message for unknown name", async () => {
      const tool = createGoopReferenceTool(ctx);
      const result = await tool.execute({ name: "nonexistent" }, createMockToolContext());

      expect(result).toContain("not found");
      expect(result).toContain("list: true");
    });
  });

  // -------------------------------------------------------------------------
  // Multi-load (MH10)
  // -------------------------------------------------------------------------

  describe("multi-load (MH10)", () => {
    it("loads multiple references in one call", async () => {
      const tool = createGoopReferenceTool(ctx);
      const result = await tool.execute(
        { names: ["executor-core", "git-workflow"] },
        createMockToolContext(),
      );

      expect(result).toContain("## Reference: executor-core");
      expect(result).toContain("Executor Core Protocol");
      expect(result).toContain("## Reference: git-workflow");
      expect(result).toContain("Git Workflow");
    });

    it("loads three references with separator between them", async () => {
      const tool = createGoopReferenceTool(ctx);
      const result = await tool.execute(
        { names: ["executor-core", "git-workflow", "deviation-rules"] },
        createMockToolContext(),
      );

      expect(result).toContain("## Reference: executor-core");
      expect(result).toContain("## Reference: git-workflow");
      expect(result).toContain("## Reference: deviation-rules");
      // Sections are separated by ---
      const separatorCount = (result.match(/\n---\n/g) ?? []).length;
      expect(separatorCount).toBe(2);
    });

    it("reports not-found names alongside found ones", async () => {
      const tool = createGoopReferenceTool(ctx);
      const result = await tool.execute(
        { names: ["executor-core", "nonexistent-ref", "git-workflow"] },
        createMockToolContext(),
      );

      expect(result).toContain("## Reference: executor-core");
      expect(result).toContain("## Reference: git-workflow");
      expect(result).toContain("## Not Found");
      expect(result).toContain("`nonexistent-ref`");
    });

    it("returns all-not-found message when none resolve", async () => {
      const tool = createGoopReferenceTool(ctx);
      const result = await tool.execute({ names: ["fake-a", "fake-b"] }, createMockToolContext());

      expect(result).toContain("Not Found");
      expect(result).toContain("`fake-a`");
      expect(result).toContain("`fake-b`");
    });

    it("handles empty names array gracefully", async () => {
      const tool = createGoopReferenceTool(ctx);
      // Empty array should fall through to help text
      const result = await tool.execute({ names: [] }, createMockToolContext());

      expect(result).toContain("goop_reference");
    });

    it("applies section extraction to multi-load", async () => {
      const tool = createGoopReferenceTool(ctx);
      const result = await tool.execute(
        { names: ["executor-core", "git-workflow"], section: "Commit Format" },
        createMockToolContext(),
      );

      // executor-core has "Commit Format" section
      expect(result).toContain("## Commit Format");
      expect(result).toContain("type(scope): description");

      // git-workflow does NOT have "Commit Format" — should show full content with note
      expect(result).toContain('Section "Commit Format" not found in git-workflow');
    });
  });

  // -------------------------------------------------------------------------
  // List mode
  // -------------------------------------------------------------------------

  describe("list mode", () => {
    it("lists all references and templates", async () => {
      const tool = createGoopReferenceTool(ctx);
      const result = await tool.execute({ list: true }, createMockToolContext());

      expect(result).toContain("## Available references");
      expect(result).toContain("- executor-core");
      expect(result).toContain("- git-workflow");
      expect(result).toContain("- deviation-rules");
      expect(result).toContain("## Available templates");
      expect(result).toContain("- agent-prompt");
    });

    it("lists only references when type filter is applied", async () => {
      const tool = createGoopReferenceTool(ctx);
      const result = await tool.execute({ list: true, type: "reference" }, createMockToolContext());

      expect(result).toContain("## Available references");
      expect(result).toContain("- executor-core");
      expect(result).not.toContain("agent-prompt");
    });

    it("lists only templates when type filter is applied", async () => {
      const tool = createGoopReferenceTool(ctx);
      const result = await tool.execute({ list: true, type: "template" }, createMockToolContext());

      expect(result).toContain("## Available templates");
      expect(result).toContain("- agent-prompt");
      expect(result).not.toContain("executor-core");
    });

    it("returns empty message when no resources of type exist", async () => {
      const emptyCtx = createMockPluginContext({
        resources: [],
      });
      const tool = createGoopReferenceTool(emptyCtx);
      const result = await tool.execute({ list: true, type: "template" }, createMockToolContext());

      expect(result).toContain("No templates found");
    });

    it("returns empty message when no resources exist at all", async () => {
      const emptyCtx = createMockPluginContext({
        resources: [],
      });
      const tool = createGoopReferenceTool(emptyCtx);
      const result = await tool.execute({ list: true }, createMockToolContext());

      expect(result).toContain("No references or templates found");
    });
  });

  // -------------------------------------------------------------------------
  // Section extraction
  // -------------------------------------------------------------------------

  describe("section extraction", () => {
    it("extracts a specific section from a reference", async () => {
      const tool = createGoopReferenceTool(ctx);
      const result = await tool.execute(
        { name: "executor-core", section: "Scope" },
        createMockToolContext(),
      );

      expect(result).toContain("## Scope");
      expect(result).toContain("Use this reference for all code implementation tasks.");
      // Should NOT contain content from other sections
      expect(result).not.toContain("## Anti-Patterns");
    });

    it("extracts last section correctly", async () => {
      const tool = createGoopReferenceTool(ctx);
      const result = await tool.execute(
        { name: "executor-core", section: "Anti-Patterns" },
        createMockToolContext(),
      );

      expect(result).toContain("## Anti-Patterns");
      expect(result).toContain("Never start without loading state.");
    });

    it("returns full content with note when section not found", async () => {
      const tool = createGoopReferenceTool(ctx);
      const result = await tool.execute(
        { name: "executor-core", section: "Nonexistent Section" },
        createMockToolContext(),
      );

      expect(result).toContain('Section "Nonexistent Section" not found');
      expect(result).toContain("Executor Core Protocol");
    });

    it("section matching is case-insensitive", async () => {
      const tool = createGoopReferenceTool(ctx);
      const result = await tool.execute(
        { name: "executor-core", section: "scope" },
        createMockToolContext(),
      );

      expect(result).toContain("## Scope");
      expect(result).toContain("Use this reference for all code implementation tasks.");
    });
  });

  // -------------------------------------------------------------------------
  // Edge cases & error handling
  // -------------------------------------------------------------------------

  describe("edge cases", () => {
    it("shows help when no arguments provided", async () => {
      const tool = createGoopReferenceTool(ctx);
      const result = await tool.execute({}, createMockToolContext());

      expect(result).toContain("goop_reference");
      expect(result).toContain("Usage");
    });

    it("never throws from execute", async () => {
      // Create a context with a resolver that throws
      const brokenCtx: PluginContext = {
        ...ctx,
        resolver: {
          resolve: () => {
            throw new Error("resolver exploded");
          },
          resolveMany: () => {
            throw new Error("resolver exploded");
          },
          resolveAll: () => {
            throw new Error("resolver exploded");
          },
          listNames: () => {
            throw new Error("resolver exploded");
          },
        },
      };

      const tool = createGoopReferenceTool(brokenCtx);
      const result = await tool.execute({ name: "anything" }, createMockToolContext());

      expect(result).toContain("Error loading reference");
      expect(result).toContain("resolver exploded");
    });

    it("has a description", () => {
      const tool = createGoopReferenceTool(ctx);
      expect(tool.description).toBeTruthy();
      expect(tool.description).toContain("multi");
    });
  });
});
