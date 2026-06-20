import { afterEach, beforeEach, describe, expect, it } from "bun:test";

import type { PluginContext, ToolContext } from "../../test-utils.js";
import {
  createMockPluginContext,
  createMockToolContext,
  setupTestEnvironment,
} from "../../test-utils.js";
import { createGoopSearchDocsTool } from "./index.js";

// ---------------------------------------------------------------------------
// Seed data helper
// ---------------------------------------------------------------------------

function seedDocuments(ctx: PluginContext): void {
  ctx.db.upsertDocument(
    "wf-alpha",
    "spec",
    "Alpha specification uses sharedneedle for cross-workflow document discovery.",
  );
  ctx.db.upsertSection(
    "wf-alpha",
    "blueprint",
    "architecture",
    "Alpha architecture section includes sharedneedle for section-level discovery.",
    1,
  );

  ctx.db.upsertDocument(
    "wf-beta",
    "research",
    "Beta research notes include sharedneedle to prove multi-workflow search.",
  );
  ctx.db.upsertSection(
    "wf-beta",
    "chronicle",
    "execution-log",
    "Beta execution log records sharedneedle in a different workflow section.",
    1,
  );

  ctx.db.upsertDocument("wf-beta", "spec", "Unrelated beta specification content.");
}

describe("goop_search_docs tool", () => {
  let ctx: PluginContext;
  let toolCtx: ToolContext;
  let cleanup: () => void;

  beforeEach(() => {
    const env = setupTestEnvironment("goop-search-docs");
    cleanup = env.cleanup;
    ctx = createMockPluginContext({ testDir: env.testDir, db: env.db });
    toolCtx = createMockToolContext();
    seedDocuments(ctx);
  });

  afterEach(() => cleanup());

  // -----------------------------------------------------------------------
  // Basic search
  // -----------------------------------------------------------------------

  it("returns document and section hits from multiple workflows", async () => {
    const tool = createGoopSearchDocsTool(ctx);
    const result = await tool.execute({ query: "sharedneedle" }, toolCtx);

    expect(result).toContain("Document Search Results");
    expect(result).toContain("**workflow_id:** wf-alpha");
    expect(result).toContain("**workflow_id:** wf-beta");
    expect(result).toContain("**source:** document");
    expect(result).toContain("**source:** section");
    expect(result).toContain("**section_key:** architecture");
  });

  it("returns a clear not-found message when nothing matches", async () => {
    const tool = createGoopSearchDocsTool(ctx);
    const result = await tool.execute({ query: "xyznonexistent" }, toolCtx);

    expect(result).toContain("No documents or sections found");
    expect(result).toContain("xyznonexistent");
  });

  // -----------------------------------------------------------------------
  // Filters
  // -----------------------------------------------------------------------

  it("filters by doc_type", async () => {
    const tool = createGoopSearchDocsTool(ctx);
    const result = await tool.execute({ query: "sharedneedle", doc_type: "research" }, toolCtx);

    expect(result).toContain("**workflow_id:** wf-beta");
    expect(result).toContain("**doc_type:** research");
    expect(result).not.toContain("**workflow_id:** wf-alpha");
    expect(result).not.toContain("**doc_type:** blueprint");
  });

  it("filters by workflow_id", async () => {
    const tool = createGoopSearchDocsTool(ctx);
    const result = await tool.execute({ query: "sharedneedle", workflow_id: "wf-alpha" }, toolCtx);

    expect(result).toContain("**workflow_id:** wf-alpha");
    expect(result).not.toContain("**workflow_id:** wf-beta");
  });

  // -----------------------------------------------------------------------
  // Limit
  // -----------------------------------------------------------------------

  it("respects limit parameter", async () => {
    const tool = createGoopSearchDocsTool(ctx);
    const result = await tool.execute({ query: "sharedneedle", limit: 1 }, toolCtx);

    expect(result).toContain("1 result");
  });
});
