import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";

import type { PluginContext, ToolContext } from "../../test-utils.js";
import {
  createMockPluginContext,
  createMockToolContext,
  setupTestEnvironment,
} from "../../test-utils.js";
import { createGoopWriteDbTool } from "./index.js";

describe("goop_write_db tool", () => {
  let ctx: PluginContext;
  let toolCtx: ToolContext;
  let cleanup: () => void;
  let testDir: string;

  beforeEach(() => {
    const env = setupTestEnvironment("goop-write-db");
    cleanup = env.cleanup;
    testDir = env.testDir;
    ctx = createMockPluginContext({ testDir: env.testDir, db: env.db });
    toolCtx = createMockToolContext();
  });

  afterEach(() => cleanup());

  // -----------------------------------------------------------------------
  // Basic write
  // -----------------------------------------------------------------------

  it("writes a new document to DB", async () => {
    const tool = createGoopWriteDbTool(ctx);
    await tool.execute({ doc_type: "spec", content: "# New Spec" }, toolCtx);

    const doc = ctx.db.getDocument("default", "spec");
    expect(doc).not.toBeNull();
    expect(doc?.content).toBe("# New Spec");
  });

  it("updates an existing document", async () => {
    ctx.db.upsertDocument("default", "spec", "# Version 1");

    const tool = createGoopWriteDbTool(ctx);
    await tool.execute({ doc_type: "spec", content: "# Version 2" }, toolCtx);

    const doc = ctx.db.getDocument("default", "spec");
    expect(doc?.content).toBe("# Version 2");
  });

  // -----------------------------------------------------------------------
  // Sidecar rendering
  // -----------------------------------------------------------------------

  it("renders a markdown sidecar file in the correct directory", async () => {
    const tool = createGoopWriteDbTool(ctx);
    await tool.execute({ doc_type: "blueprint", content: "# Blueprint Body" }, toolCtx);

    const sidecarPath = join(testDir, ".goopspec", "default", "BLUEPRINT.md");
    expect(existsSync(sidecarPath)).toBe(true);

    const content = await Bun.file(sidecarPath).text();
    expect(content).toBe("# Blueprint Body");
  });

  // -----------------------------------------------------------------------
  // Event logging
  // -----------------------------------------------------------------------

  it("appends a doc_write event to the events table", async () => {
    const tool = createGoopWriteDbTool(ctx);
    await tool.execute({ doc_type: "chronicle", content: "# Chronicle" }, toolCtx);

    const events = ctx.db.getEvents("default", "doc_write");
    expect(events.length).toBe(1);
    expect(events[0].event_type).toBe("doc_write");

    const payload = JSON.parse(events[0].payload);
    expect(payload.doc_type).toBe("chronicle");
    expect(payload.timestamp).toBeGreaterThan(0);
  });

  // -----------------------------------------------------------------------
  // Confirmation output
  // -----------------------------------------------------------------------

  it("returns confirmation string with doc_type and workflow_id", async () => {
    const tool = createGoopWriteDbTool(ctx);
    const result = await tool.execute({ doc_type: "spec", content: "# Spec" }, toolCtx);

    expect(result).toContain("Written spec");
    expect(result).toContain("default");
    expect(result).toContain("SPEC.md");
  });

  // -----------------------------------------------------------------------
  // Workflow ID handling
  // -----------------------------------------------------------------------

  it("uses active workflow_id when none provided", async () => {
    const tool = createGoopWriteDbTool(ctx);
    await tool.execute({ doc_type: "adl", content: "# ADL" }, toolCtx);

    // Active workflow is "default"
    const doc = ctx.db.getDocument("default", "adl");
    expect(doc).not.toBeNull();
    expect(doc?.content).toBe("# ADL");
  });

  it("uses provided workflow_id override", async () => {
    const tool = createGoopWriteDbTool(ctx);
    const result = await tool.execute(
      { doc_type: "spec", content: "# Custom Spec", workflow_id: "custom-wf" },
      toolCtx,
    );

    expect(result).toContain("custom-wf");

    const doc = ctx.db.getDocument("custom-wf", "spec");
    expect(doc).not.toBeNull();
    expect(doc?.content).toBe("# Custom Spec");
  });
});
