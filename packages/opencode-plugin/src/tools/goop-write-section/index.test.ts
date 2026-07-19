import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";

import type { PluginContext, ToolContext } from "../../test-utils.js";
import {
  createMockPluginContext,
  createMockToolContext,
  setupTestEnvironment,
} from "../../test-utils.js";
import { createGoopReadDbTool } from "../goop-read-db/index.js";
import { createGoopWriteDbTool } from "../goop-write-db/index.js";
import { createGoopWriteSectionTool } from "./index.js";

describe("goop_write_section tool", () => {
  let ctx: PluginContext;
  let toolCtx: ToolContext;
  let cleanup: () => void;
  let testDir: string;

  beforeEach(() => {
    const env = setupTestEnvironment("goop-write-section");
    cleanup = env.cleanup;
    testDir = env.testDir;
    ctx = createMockPluginContext({ testDir: env.testDir, db: env.db });
    toolCtx = createMockToolContext();
  });

  afterEach(() => cleanup());

  // -----------------------------------------------------------------------
  // Basic write
  // -----------------------------------------------------------------------

  it("writes a new section to DB", async () => {
    const tool = createGoopWriteSectionTool(ctx);
    await tool.execute(
      { doc_type: "spec", section_key: "overview", content: "# Overview" },
      toolCtx,
    );

    const section = ctx.db.getSection("default", "spec", "overview");
    expect(section).not.toBeNull();
    expect(section?.content).toBe("# Overview");
  });

  it("updates an existing section", async () => {
    ctx.db.upsertSection("default", "spec", "overview", "# Version 1");

    const tool = createGoopWriteSectionTool(ctx);
    await tool.execute(
      { doc_type: "spec", section_key: "overview", content: "# Version 2" },
      toolCtx,
    );

    const section = ctx.db.getSection("default", "spec", "overview");
    expect(section?.content).toBe("# Version 2");
  });

  it("stores the provided position for section ordering", async () => {
    const tool = createGoopWriteSectionTool(ctx);
    await tool.execute(
      { doc_type: "blueprint", section_key: "second", content: "Second", position: 20 },
      toolCtx,
    );

    const section = ctx.db.getSection("default", "blueprint", "second");
    expect(section?.position).toBe(20);
  });

  it("migrates monolithic content before the first section write", async () => {
    const writeDocument = createGoopWriteDbTool(ctx);
    const writeSection = createGoopWriteSectionTool(ctx);
    const readDocument = createGoopReadDbTool(ctx);

    await writeDocument.execute({ doc_type: "spec", content: "# Existing Document" }, toolCtx);
    await writeSection.execute(
      { doc_type: "spec", section_key: "new-section", content: "# New Section" },
      toolCtx,
    );

    expect(ctx.db.getSections("default", "spec").map((section) => section.section_key)).toEqual([
      "_migrated-legacy-content",
      "new-section",
    ]);
    expect(ctx.db.assembleDocument("default", "spec")).toBe("# Existing Document\n\n# New Section");
    expect(await readDocument.execute({ doc_type: "spec" }, toolCtx)).toBe(
      "# Existing Document\n\n# New Section",
    );
  });

  it("does not duplicate migrated content on later section writes", async () => {
    ctx.db.upsertDocument("default", "spec", "# Existing Document");
    const tool = createGoopWriteSectionTool(ctx);

    await tool.execute({ doc_type: "spec", section_key: "first", content: "# First" }, toolCtx);
    await tool.execute({ doc_type: "spec", section_key: "second", content: "# Second" }, toolCtx);

    const sections = ctx.db.getSections("default", "spec");
    expect(
      sections.filter((section) => section.section_key === "_migrated-legacy-content"),
    ).toHaveLength(1);
    expect(sections.map((section) => section.section_key)).toEqual([
      "_migrated-legacy-content",
      "first",
      "second",
    ]);
  });

  it("deletes only the requested section", async () => {
    ctx.db.upsertSection("default", "spec", "keep", "# Keep", 0);
    ctx.db.upsertSection("default", "spec", "remove", "# Remove", 1);
    const tool = createGoopWriteSectionTool(ctx);

    const result = await tool.execute(
      { action: "delete", doc_type: "spec", section_key: "remove" },
      toolCtx,
    );

    expect(result).toContain("Deleted section 'remove'");
    expect(ctx.db.getSection("default", "spec", "remove")).toBeNull();
    expect(ctx.db.getSections("default", "spec").map((section) => section.section_key)).toEqual([
      "keep",
    ]);
    expect(ctx.db.assembleDocument("default", "spec")).toBe("# Keep");
  });

  it("deletes the last remaining section without crashing sidecar rendering", async () => {
    ctx.db.upsertSection("default", "spec", "only", "# Only", 0);
    const tool = createGoopWriteSectionTool(ctx);
    const readDocument = createGoopReadDbTool(ctx);

    const result = await tool.execute(
      { action: "delete", doc_type: "spec", section_key: "only" },
      toolCtx,
    );

    expect(result).toBe("Deleted section 'only' for spec in workflow 'default'.");
    expect(ctx.db.getSections("default", "spec")).toEqual([]);
    expect(ctx.db.resolveDocumentContent("default", "spec")).toBeNull();
    expect(ctx.db.searchSections("Only")).toEqual([]);
    expect(await readDocument.execute({ doc_type: "spec" }, toolCtx)).toContain(
      "No spec document found",
    );
  });

  // -----------------------------------------------------------------------
  // Sidecar rendering
  // -----------------------------------------------------------------------

  it("renders assembled sections to the markdown sidecar", async () => {
    ctx.db.upsertSection("default", "blueprint", "intro", "# Intro", 10);

    const tool = createGoopWriteSectionTool(ctx);
    await tool.execute(
      { doc_type: "blueprint", section_key: "plan", content: "# Plan", position: 20 },
      toolCtx,
    );

    const sidecarPath = join(testDir, ".goopspec", "default", "BLUEPRINT.md");
    expect(existsSync(sidecarPath)).toBe(true);

    const content = await Bun.file(sidecarPath).text();
    expect(content).toBe("# Intro\n\n# Plan");
  });

  // -----------------------------------------------------------------------
  // Event logging
  // -----------------------------------------------------------------------

  it("appends a doc_section_write event to the events table", async () => {
    const tool = createGoopWriteSectionTool(ctx);
    await tool.execute(
      { doc_type: "chronicle", section_key: "wave-2", content: "Wave 2 started" },
      toolCtx,
    );

    const events = ctx.db.getEvents("default", "doc_section_write");
    expect(events.length).toBe(1);
    expect(events[0].event_type).toBe("doc_section_write");

    const payload = JSON.parse(events[0].payload);
    expect(payload.doc_type).toBe("chronicle");
    expect(payload.section_key).toBe("wave-2");
    expect(payload.timestamp).toBeGreaterThan(0);
  });

  // -----------------------------------------------------------------------
  // Workflow ID handling
  // -----------------------------------------------------------------------

  it("uses active workflow_id when none provided", async () => {
    const tool = createGoopWriteSectionTool(ctx);
    await tool.execute({ doc_type: "adl", section_key: "entry", content: "# ADL Entry" }, toolCtx);

    const section = ctx.db.getSection("default", "adl", "entry");
    expect(section).not.toBeNull();
    expect(section?.content).toBe("# ADL Entry");
  });

  it("uses provided workflow_id override", async () => {
    const tool = createGoopWriteSectionTool(ctx);
    const result = await tool.execute(
      {
        doc_type: "spec",
        section_key: "custom",
        content: "# Custom Spec",
        workflow_id: "custom-wf",
      },
      toolCtx,
    );

    expect(result).toContain("custom-wf");

    const section = ctx.db.getSection("custom-wf", "spec", "custom");
    expect(section).not.toBeNull();
    expect(section?.content).toBe("# Custom Spec");
  });

  // -----------------------------------------------------------------------
  // Confirmation output
  // -----------------------------------------------------------------------

  it("returns confirmation string with doc_type, section_key, and workflow_id", async () => {
    const tool = createGoopWriteSectionTool(ctx);
    const result = await tool.execute(
      { doc_type: "spec", section_key: "overview", content: "# Spec" },
      toolCtx,
    );

    expect(result).toContain("Written section 'overview'");
    expect(result).toContain("spec");
    expect(result).toContain("default");
    expect(result).toContain("SPEC.md");
  });

  describe("goop_write_section batch mode (items[])", () => {
    it("returns empty result for empty items array", async () => {
      const tool = createGoopWriteSectionTool(ctx);
      const result = await tool.execute(
        {
          doc_type: "spec",
          section_key: "",
          content: "",
          items: [],
        },
        toolCtx,
      );
      expect(result).toContain("0/0 succeeded");
    });

    it("writes single-element items array", async () => {
      const tool = createGoopWriteSectionTool(ctx);
      const result = await tool.execute(
        {
          doc_type: "spec",
          section_key: "",
          content: "",
          items: [{ doc_type: "spec", section_key: "intro", content: "# Intro" }],
        },
        toolCtx,
      );
      expect(result).toContain("1/1 succeeded");
    });

    it("writes multi-element items array", async () => {
      const tool = createGoopWriteSectionTool(ctx);
      const result = await tool.execute(
        {
          doc_type: "spec",
          section_key: "",
          content: "",
          items: [
            { doc_type: "spec", section_key: "intro", content: "# Intro" },
            { doc_type: "spec", section_key: "scope", content: "# Scope" },
            { doc_type: "blueprint", section_key: "wave1", content: "# Wave 1" },
          ],
        },
        toolCtx,
      );
      expect(result).toContain("3/3 succeeded");
    });

    it("migrates legacy content once per document type in a batch", async () => {
      ctx.db.upsertDocument("default", "spec", "# Existing Document");
      const tool = createGoopWriteSectionTool(ctx);

      const result = await tool.execute(
        {
          doc_type: "spec",
          items: [
            { doc_type: "spec", section_key: "first", content: "# First" },
            { doc_type: "spec", section_key: "second", content: "# Second" },
          ],
        },
        toolCtx,
      );

      expect(result).toContain("2/2 succeeded");
      expect(
        ctx.db
          .getSections("default", "spec")
          .filter((section) => section.section_key === "_migrated-legacy-content"),
      ).toHaveLength(1);
    });

    it("backward-compat: single-section path works when items absent", async () => {
      const tool = createGoopWriteSectionTool(ctx);
      const result = await tool.execute(
        {
          doc_type: "spec",
          section_key: "overview",
          content: "# Overview",
        },
        toolCtx,
      );
      expect(result).toContain("overview");
      expect(result).toContain("spec");
    });
  });

  // -----------------------------------------------------------------------
  // Patch mode (old_string / new_string / replace_all)
  // -----------------------------------------------------------------------

  describe("patch mode", () => {
    it("patches a section on a single old_string match", async () => {
      ctx.db.upsertSection("default", "spec", "overview", "Hello world");

      const tool = createGoopWriteSectionTool(ctx);
      const result = await tool.execute(
        { doc_type: "spec", section_key: "overview", old_string: "world", new_string: "GoopSpec" },
        toolCtx,
      );

      expect(result).toContain("Patched section 'overview'");
      expect(ctx.db.getSection("default", "spec", "overview")?.content).toBe("Hello GoopSpec");
    });

    it("returns an error and leaves section unchanged when old_string does not match", async () => {
      ctx.db.upsertSection("default", "spec", "overview", "Hello world");

      const tool = createGoopWriteSectionTool(ctx);
      const result = await tool.execute(
        {
          doc_type: "spec",
          section_key: "overview",
          old_string: "missing",
          new_string: "replacement",
        },
        toolCtx,
      );

      expect(result).toContain("Error in goop_write_section");
      expect(result).toContain("did not appear verbatim");
      expect(ctx.db.getSection("default", "spec", "overview")?.content).toBe("Hello world");
    });

    it("returns an error mentioning occurrence count when old_string matches multiple times", async () => {
      ctx.db.upsertSection("default", "spec", "overview", "foo bar foo baz foo");

      const tool = createGoopWriteSectionTool(ctx);
      const result = await tool.execute(
        { doc_type: "spec", section_key: "overview", old_string: "foo", new_string: "qux" },
        toolCtx,
      );

      expect(result).toContain("Error in goop_write_section");
      expect(result).toContain("3 occurrences");
      expect(ctx.db.getSection("default", "spec", "overview")?.content).toBe(
        "foo bar foo baz foo",
      );
    });

    it("replaces all occurrences in a section when replace_all is true", async () => {
      ctx.db.upsertSection("default", "spec", "overview", "foo bar foo baz foo");

      const tool = createGoopWriteSectionTool(ctx);
      const result = await tool.execute(
        {
          doc_type: "spec",
          section_key: "overview",
          old_string: "foo",
          new_string: "qux",
          replace_all: true,
        },
        toolCtx,
      );

      expect(result).toContain("Patched section 'overview'");
      expect(ctx.db.getSection("default", "spec", "overview")?.content).toBe(
        "qux bar qux baz qux",
      );
    });

    it("patches one item and writes another via items[] mixed batch", async () => {
      ctx.db.upsertSection("default", "spec", "overview", "Hello world");

      const tool = createGoopWriteSectionTool(ctx);
      const result = await tool.execute(
        {
          doc_type: "spec",
          section_key: "",
          content: "",
          items: [
            { doc_type: "spec", section_key: "overview", old_string: "world", new_string: "GoopSpec" },
            { doc_type: "spec", section_key: "plan", content: "# Plan" },
          ],
        },
        toolCtx,
      );

      expect(result).toContain("2/2 succeeded");
      expect(ctx.db.getSection("default", "spec", "overview")?.content).toBe("Hello GoopSpec");
      expect(ctx.db.getSection("default", "spec", "plan")?.content).toBe("# Plan");
    });

    it("backward-compat: content-only section write is unchanged when patch args are absent", async () => {
      ctx.db.upsertSection("default", "spec", "overview", "# Old");

      const tool = createGoopWriteSectionTool(ctx);
      const result = await tool.execute(
        { doc_type: "spec", section_key: "overview", content: "# New" },
        toolCtx,
      );

      expect(result).toContain("Written section 'overview'");
      expect(ctx.db.getSection("default", "spec", "overview")?.content).toBe("# New");
    });
  });
});
