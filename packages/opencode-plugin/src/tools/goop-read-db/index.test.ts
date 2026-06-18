import { afterEach, beforeEach, describe, expect, it } from "bun:test";

import type { PluginContext, ToolContext } from "../../test-utils.js";
import {
  createMockPluginContext,
  createMockToolContext,
  setupTestEnvironment,
} from "../../test-utils.js";
import { createGoopReadDbTool } from "./index.js";

describe("goop_read_db tool", () => {
  let ctx: PluginContext;
  let toolCtx: ToolContext;
  let cleanup: () => void;

  beforeEach(() => {
    const env = setupTestEnvironment("goop-read-db");
    cleanup = env.cleanup;
    ctx = createMockPluginContext({ testDir: env.testDir, db: env.db });
    toolCtx = createMockToolContext();
  });

  afterEach(() => cleanup());

  // -----------------------------------------------------------------------
  // Single doc_type mode
  // -----------------------------------------------------------------------

  it("returns 'not found' message for missing doc (singular doc_type)", async () => {
    const tool = createGoopReadDbTool(ctx);
    const result = await tool.execute({ doc_type: "spec" }, toolCtx);

    expect(result).toContain("No spec document found");
    expect(result).toContain("goop_write_db");
  });

  it("returns document content for existing doc (singular doc_type)", async () => {
    ctx.db.upsertDocument("default", "spec", "# My Spec\n\nThis is the spec.");

    const tool = createGoopReadDbTool(ctx);
    const result = await tool.execute({ doc_type: "spec" }, toolCtx);

    expect(result).toBe("# My Spec\n\nThis is the spec.");
  });

  it("uses active workflow_id when none provided", async () => {
    // Active workflow is "default" by default
    ctx.db.upsertDocument("default", "blueprint", "# Default Blueprint");
    ctx.db.upsertDocument("other-wf", "blueprint", "# Other Blueprint");

    const tool = createGoopReadDbTool(ctx);
    const result = await tool.execute({ doc_type: "blueprint" }, toolCtx);

    expect(result).toBe("# Default Blueprint");
  });

  it("uses provided workflow_id override", async () => {
    ctx.db.upsertDocument("default", "blueprint", "# Default Blueprint");
    ctx.db.upsertDocument("custom-wf", "blueprint", "# Custom Blueprint");

    const tool = createGoopReadDbTool(ctx);
    const result = await tool.execute(
      { doc_type: "blueprint", workflow_id: "custom-wf" },
      toolCtx,
    );

    expect(result).toBe("# Custom Blueprint");
  });

  it("returns error for unknown doc_type", async () => {
    const tool = createGoopReadDbTool(ctx);
    const result = await tool.execute({ doc_type: "invalid_type" }, toolCtx);

    expect(result).toContain("Unknown doc_type");
    expect(result).toContain("Valid types:");
  });

  // -----------------------------------------------------------------------
  // Batch mode (doc_types array)
  // -----------------------------------------------------------------------

  it("batch mode: returns multiple docs separated by ---", async () => {
    ctx.db.upsertDocument("default", "spec", "# Spec Content");
    ctx.db.upsertDocument("default", "blueprint", "# Blueprint Content");

    const tool = createGoopReadDbTool(ctx);
    const result = await tool.execute(
      { doc_types: ["spec", "blueprint"] },
      toolCtx,
    );

    expect(result).toContain("## spec");
    expect(result).toContain("# Spec Content");
    expect(result).toContain("---");
    expect(result).toContain("## blueprint");
    expect(result).toContain("# Blueprint Content");
  });

  it("batch mode: inline 'not found' for missing docs within batch", async () => {
    ctx.db.upsertDocument("default", "spec", "# Spec Content");
    // chronicle is NOT created

    const tool = createGoopReadDbTool(ctx);
    const result = await tool.execute(
      { doc_types: ["spec", "chronicle"] },
      toolCtx,
    );

    expect(result).toContain("## spec");
    expect(result).toContain("# Spec Content");
    expect(result).toContain("## chronicle");
    expect(result).toContain("No chronicle document found");
  });

  it("batch mode: validates doc_type values", async () => {
    const tool = createGoopReadDbTool(ctx);
    const result = await tool.execute(
      { doc_types: ["spec", "bogus_type"] },
      toolCtx,
    );

    expect(result).toContain("Unknown doc_type(s)");
    expect(result).toContain("bogus_type");
  });

  // -----------------------------------------------------------------------
  // Missing args
  // -----------------------------------------------------------------------

  it("returns error string when both doc_type and doc_types are missing", async () => {
    const tool = createGoopReadDbTool(ctx);
    const result = await tool.execute({}, toolCtx);

    expect(result).toContain("Provide doc_type or doc_types");
    expect(result).toContain("Valid types:");
  });
});
