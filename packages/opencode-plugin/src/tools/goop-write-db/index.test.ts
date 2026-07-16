import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type { PluginContext, ToolContext } from "../../test-utils.js";
import {
  createMockPluginContext,
  createMockToolContext,
  setupTestEnvironment,
} from "../../test-utils.js";
import { createGoopReadDbTool } from "../goop-read-db/index.js";
import { createGoopWriteSectionTool } from "../goop-write-section/index.js";
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

  it("clears existing sections so a later monolithic write becomes authoritative", async () => {
    const writeSection = createGoopWriteSectionTool(ctx);
    const writeDocument = createGoopWriteDbTool(ctx);
    const readDocument = createGoopReadDbTool(ctx);

    await writeSection.execute(
      { doc_type: "spec", section_key: "earlier", content: "# Earlier Section" },
      toolCtx,
    );
    await writeDocument.execute(
      { doc_type: "spec", content: "# New Monolithic Document" },
      toolCtx,
    );

    expect(ctx.db.getSections("default", "spec")).toEqual([]);
    expect(ctx.db.resolveDocumentContent("default", "spec")).toBe("# New Monolithic Document");
    expect(await readDocument.execute({ doc_type: "spec" }, toolCtx)).toBe(
      "# New Monolithic Document",
    );
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

  it("renders workflow and active SPEC sidecars through the shared renderer", async () => {
    const tool = createGoopWriteDbTool(ctx);
    await tool.execute({ doc_type: "spec", content: "# Active Spec" }, toolCtx);

    const workflowSpecPath = join(testDir, ".goopspec", "default", "SPEC.md");
    const activeSpecPath = join(testDir, ".goopspec", "ACTIVE_SPEC.md");

    expect(existsSync(workflowSpecPath)).toBe(true);
    expect(existsSync(activeSpecPath)).toBe(true);
    expect(readFileSync(workflowSpecPath, "utf-8")).toBe("# Active Spec");
    expect(readFileSync(activeSpecPath, "utf-8")).toBe("# Active Spec");
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

  // -----------------------------------------------------------------------
  // Append mode
  // -----------------------------------------------------------------------

  describe("append mode", () => {
    it("mode: append on a missing document creates it with just the provided content", async () => {
      const tool = createGoopWriteDbTool(ctx);
      await tool.execute({ doc_type: "spec", content: "# First Entry", mode: "append" }, toolCtx);

      const doc = ctx.db.getDocument("default", "spec");
      expect(doc).not.toBeNull();
      expect(doc?.content).toBe("# First Entry");
    });

    it("mode: append on an existing document appends with double newline separator", async () => {
      ctx.db.upsertDocument("default", "spec", "# Existing Content");

      const tool = createGoopWriteDbTool(ctx);
      await tool.execute(
        { doc_type: "spec", content: "# Appended Content", mode: "append" },
        toolCtx,
      );

      const doc = ctx.db.getDocument("default", "spec");
      expect(doc?.content).toBe("# Existing Content\n\n# Appended Content");
    });

    it("mode: replace (explicit) overwrites existing content", async () => {
      ctx.db.upsertDocument("default", "spec", "# Original");

      const tool = createGoopWriteDbTool(ctx);
      await tool.execute({ doc_type: "spec", content: "# Replaced", mode: "replace" }, toolCtx);

      const doc = ctx.db.getDocument("default", "spec");
      expect(doc?.content).toBe("# Replaced");
    });

    it("omitting mode defaults to replace behavior (overwrites existing content)", async () => {
      ctx.db.upsertDocument("default", "spec", "# Original");

      const tool = createGoopWriteDbTool(ctx);
      await tool.execute({ doc_type: "spec", content: "# Overwritten" }, toolCtx);

      const doc = ctx.db.getDocument("default", "spec");
      expect(doc?.content).toBe("# Overwritten");
    });

    it("appending to doc_type: chronicle inserts a row into chronicle_events", async () => {
      const tool = createGoopWriteDbTool(ctx);
      await tool.execute(
        { doc_type: "chronicle", content: "Wave 1 complete", mode: "append" },
        toolCtx,
      );

      const events = ctx.db.getChronicleEvents("default");
      expect(events.length).toBe(1);
      expect(events[0].entry).toBe("Wave 1 complete");
      expect(events[0].workflow_id).toBe("default");
    });

    it("sidecar file reflects the full appended content after append", async () => {
      ctx.db.upsertDocument("default", "blueprint", "# Part One");

      const tool = createGoopWriteDbTool(ctx);
      await tool.execute({ doc_type: "blueprint", content: "# Part Two", mode: "append" }, toolCtx);

      const sidecarPath = join(testDir, ".goopspec", "default", "BLUEPRINT.md");
      expect(existsSync(sidecarPath)).toBe(true);

      const sidecarContent = await Bun.file(sidecarPath).text();
      expect(sidecarContent).toBe("# Part One\n\n# Part Two");
    });
  });

  describe("goop_write_db batch mode (items[])", () => {
    it("returns empty result for empty items array", async () => {
      const tool = createGoopWriteDbTool(ctx);
      const result = await tool.execute({ doc_type: "spec", content: "", items: [] }, toolCtx);
      expect(result).toContain("0/0 succeeded");
    });

    it("writes single-element items array", async () => {
      const tool = createGoopWriteDbTool(ctx);
      const result = await tool.execute(
        {
          doc_type: "spec",
          content: "",
          items: [{ doc_type: "spec", content: "# Batch Spec" }],
        },
        toolCtx,
      );
      expect(result).toContain("1/1 succeeded");
      const doc = ctx.db.getDocument("default", "spec");
      expect(doc?.content).toBe("# Batch Spec");
    });

    it("writes multi-element items array", async () => {
      const tool = createGoopWriteDbTool(ctx);
      const result = await tool.execute(
        {
          doc_type: "spec",
          content: "",
          items: [
            { doc_type: "spec", content: "# Spec" },
            { doc_type: "blueprint", content: "# Blueprint" },
            { doc_type: "requirements", content: "# Reqs" },
          ],
        },
        toolCtx,
      );
      expect(result).toContain("3/3 succeeded");
      expect(ctx.db.getDocument("default", "spec")?.content).toBe("# Spec");
      expect(ctx.db.getDocument("default", "blueprint")?.content).toBe("# Blueprint");
    });

    it("clears sections for each batch item before writing monolithic content", async () => {
      ctx.db.upsertSection("default", "spec", "stale", "# Stale");
      ctx.db.upsertSection("default", "blueprint", "stale", "# Stale");
      const tool = createGoopWriteDbTool(ctx);

      await tool.execute(
        {
          doc_type: "spec",
          content: "",
          items: [
            { doc_type: "spec", content: "# Fresh Spec" },
            { doc_type: "blueprint", content: "# Fresh Blueprint" },
          ],
        },
        toolCtx,
      );

      expect(ctx.db.getSections("default", "spec")).toEqual([]);
      expect(ctx.db.getSections("default", "blueprint")).toEqual([]);
    });

    it("backward-compat: single-item path works when items absent", async () => {
      const tool = createGoopWriteDbTool(ctx);
      const result = await tool.execute({ doc_type: "adl", content: "# ADL" }, toolCtx);
      expect(result).toContain("Written adl");
      expect(ctx.db.getDocument("default", "adl")?.content).toBe("# ADL");
    });
  });
});
