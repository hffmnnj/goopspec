import { afterEach, beforeEach, describe, expect, it } from "bun:test";

import type { PluginContext, ToolContext } from "../../test-utils.js";
import {
  createMockPluginContext,
  createMockToolContext,
  setupTestEnvironment,
} from "../../test-utils.js";
import { createGoopReadSectionTool } from "./index.js";

describe("goop_read_section tool", () => {
  let ctx: PluginContext;
  let toolCtx: ToolContext;
  let cleanup: () => void;

  beforeEach(() => {
    const env = setupTestEnvironment("goop-read-section");
    cleanup = env.cleanup;
    ctx = createMockPluginContext({ testDir: env.testDir, db: env.db });
    toolCtx = createMockToolContext();
  });

  afterEach(() => cleanup());

  // -----------------------------------------------------------------------
  // Single section mode
  // -----------------------------------------------------------------------

  it("returns section content when section_key is provided", async () => {
    ctx.db.upsertSection("default", "spec", "overview", "# Overview");

    const tool = createGoopReadSectionTool(ctx);
    const result = await tool.execute({ doc_type: "spec", section_key: "overview" }, toolCtx);

    expect(result).toBe("# Overview");
  });

  it("returns not found message for a missing section_key", async () => {
    const tool = createGoopReadSectionTool(ctx);
    const result = await tool.execute({ doc_type: "spec", section_key: "missing" }, toolCtx);

    expect(result).toContain("No section 'missing' found");
    expect(result).toContain("goop_write_section");
  });

  // -----------------------------------------------------------------------
  // All sections mode
  // -----------------------------------------------------------------------

  it("returns all sections under headings separated by ---", async () => {
    ctx.db.upsertSection("default", "blueprint", "intro", "Intro body", 10);
    ctx.db.upsertSection("default", "blueprint", "plan", "Plan body", 20);

    const tool = createGoopReadSectionTool(ctx);
    const result = await tool.execute({ doc_type: "blueprint" }, toolCtx);

    expect(result).toBe("## intro\n\nIntro body\n\n---\n\n## plan\n\nPlan body");
  });

  it("returns clear not found message when no sections exist", async () => {
    const tool = createGoopReadSectionTool(ctx);
    const result = await tool.execute({ doc_type: "chronicle" }, toolCtx);

    expect(result).toContain("No sections found for chronicle");
    expect(result).toContain("goop_write_section");
  });

  // -----------------------------------------------------------------------
  // Workflow ID handling
  // -----------------------------------------------------------------------

  it("uses active workflow_id when none provided", async () => {
    ctx.db.upsertSection("default", "adl", "active", "# Active ADL");
    ctx.db.upsertSection("other-wf", "adl", "active", "# Other ADL");

    const tool = createGoopReadSectionTool(ctx);
    const result = await tool.execute({ doc_type: "adl", section_key: "active" }, toolCtx);

    expect(result).toBe("# Active ADL");
  });

  it("uses provided workflow_id override", async () => {
    ctx.db.upsertSection("default", "research", "notes", "# Default Notes");
    ctx.db.upsertSection("custom-wf", "research", "notes", "# Custom Notes");

    const tool = createGoopReadSectionTool(ctx);
    const result = await tool.execute(
      { doc_type: "research", section_key: "notes", workflow_id: "custom-wf" },
      toolCtx,
    );

    expect(result).toBe("# Custom Notes");
  });

  // -----------------------------------------------------------------------
  // Batch mode
  // -----------------------------------------------------------------------

  it("returns multiple sections under headings when section_keys is provided", async () => {
    ctx.db.upsertSection("default", "spec", "overview", "# Overview", 10);
    ctx.db.upsertSection("default", "spec", "detail", "# Detail", 20);
    ctx.db.upsertSection("default", "spec", "appendix", "# Appendix", 30);

    const tool = createGoopReadSectionTool(ctx);
    const result = await tool.execute(
      { doc_type: "spec", section_keys: ["overview", "appendix"] },
      toolCtx,
    );

    expect(result).toBe("## overview\n\n# Overview\n\n---\n\n## appendix\n\n# Appendix");
  });

  it("falls back to listing all sections when section_keys is empty", async () => {
    ctx.db.upsertSection("default", "blueprint", "intro", "Intro body", 10);
    ctx.db.upsertSection("default", "blueprint", "plan", "Plan body", 20);

    const tool = createGoopReadSectionTool(ctx);
    const result = await tool.execute({ doc_type: "blueprint", section_keys: [] }, toolCtx);

    expect(result).toBe("## intro\n\nIntro body\n\n---\n\n## plan\n\nPlan body");
  });
});
