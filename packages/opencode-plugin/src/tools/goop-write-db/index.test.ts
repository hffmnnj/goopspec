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
    it("empty items array falls through to single-doc path", async () => {
      const tool = createGoopWriteDbTool(ctx);
      const result = await tool.execute(
        { doc_type: "spec", content: "# Fallback Spec", items: [] },
        toolCtx,
      );
      expect(result).toContain("Written spec");
      expect(ctx.db.getDocument("default", "spec")?.content).toBe("# Fallback Spec");
    });

    it("returns error when items array is empty and no document content is provided", async () => {
      const tool = createGoopWriteDbTool(ctx);
      const result = await tool.execute({ doc_type: "spec", items: [] }, toolCtx);
      expect(result).toContain("Error in goop_write_db");
      expect(result).toContain("items[] array is empty");
      expect(result).not.toContain("succeeded");
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

  // -----------------------------------------------------------------------
  // Patch mode (old_string / new_string / replace_all)
  // -----------------------------------------------------------------------

  describe("patch mode", () => {
    it("patches an existing document on a single old_string match", async () => {
      ctx.db.upsertDocument("default", "spec", "Hello world");

      const tool = createGoopWriteDbTool(ctx);
      const result = await tool.execute(
        { doc_type: "spec", old_string: "world", new_string: "GoopSpec" },
        toolCtx,
      );

      expect(result).toContain("Patched spec");
      expect(ctx.db.getDocument("default", "spec")?.content).toBe("Hello GoopSpec");
    });

    it("returns an error and leaves content unchanged when old_string does not match", async () => {
      ctx.db.upsertDocument("default", "spec", "Hello world");

      const tool = createGoopWriteDbTool(ctx);
      const result = await tool.execute(
        { doc_type: "spec", old_string: "missing", new_string: "replacement" },
        toolCtx,
      );

      expect(result).toContain("Error in goop_write_db");
      expect(result).toContain("did not appear verbatim");
      expect(ctx.db.getDocument("default", "spec")?.content).toBe("Hello world");
    });

    it("returns an error mentioning occurrence count when old_string matches multiple times", async () => {
      ctx.db.upsertDocument("default", "spec", "foo bar foo baz foo");

      const tool = createGoopWriteDbTool(ctx);
      const result = await tool.execute(
        { doc_type: "spec", old_string: "foo", new_string: "qux" },
        toolCtx,
      );

      expect(result).toContain("Error in goop_write_db");
      expect(result).toContain("3 occurrences");
      expect(ctx.db.getDocument("default", "spec")?.content).toBe("foo bar foo baz foo");
    });

    it("replaces all occurrences when replace_all is true", async () => {
      ctx.db.upsertDocument("default", "spec", "foo bar foo baz foo");

      const tool = createGoopWriteDbTool(ctx);
      const result = await tool.execute(
        { doc_type: "spec", old_string: "foo", new_string: "qux", replace_all: true },
        toolCtx,
      );

      expect(result).toContain("Patched spec");
      expect(ctx.db.getDocument("default", "spec")?.content).toBe("qux bar qux baz qux");
    });

    it("patches one item and writes another via items[] mixed batch", async () => {
      ctx.db.upsertDocument("default", "spec", "Hello world");

      const tool = createGoopWriteDbTool(ctx);
      const result = await tool.execute(
        {
          doc_type: "spec",
          content: "",
          items: [
            { doc_type: "spec", old_string: "world", new_string: "GoopSpec" },
            { doc_type: "blueprint", content: "# Blueprint" },
          ],
        },
        toolCtx,
      );

      expect(result).toContain("2/2 succeeded");
      expect(ctx.db.getDocument("default", "spec")?.content).toBe("Hello GoopSpec");
      expect(ctx.db.getDocument("default", "blueprint")?.content).toBe("# Blueprint");
    });

    it("backward-compat: content/mode write is unchanged when patch args are absent", async () => {
      ctx.db.upsertDocument("default", "spec", "# Old");

      const tool = createGoopWriteDbTool(ctx);
      const result = await tool.execute(
        { doc_type: "spec", content: "# New", mode: "replace" },
        toolCtx,
      );

      expect(result).toContain("Written spec");
      expect(result).toContain("mode: replace");
      expect(ctx.db.getDocument("default", "spec")?.content).toBe("# New");
    });
  });

  // -----------------------------------------------------------------------
  // Message accuracy — write size reporting
  // -----------------------------------------------------------------------

  describe("message accuracy (write size reporting)", () => {
    it("a zero-length write reports 'empty document' and not the bare '0 chars' form", async () => {
      const tool = createGoopWriteDbTool(ctx);
      const result = await tool.execute({ doc_type: "spec", content: "" }, toolCtx);

      expect(result).toContain("empty document");
      // The negative assertion pins the fix: the old code rendered a bare
      // "(0 chars, ...)" which reads as though the content vanished.
      expect(result).not.toContain("0 chars");
    });

    it("a non-empty write reports the persisted char count", async () => {
      const content = "# Spec body content";
      const tool = createGoopWriteDbTool(ctx);
      const result = await tool.execute({ doc_type: "spec", content }, toolCtx);

      expect(result).toContain(`${content.length} chars`);
      expect(result).not.toContain("empty document");
    });

    it("a patch reports the resulting char count on the patch path", async () => {
      ctx.db.upsertDocument("default", "spec", "Hello world");

      const tool = createGoopWriteDbTool(ctx);
      const result = await tool.execute(
        { doc_type: "spec", old_string: "world", new_string: "GoopSpec" },
        toolCtx,
      );

      const patched = ctx.db.getDocument("default", "spec")?.content ?? "";
      expect(result).toContain("mode: patch");
      expect(result).toContain(`${patched.length} chars`);
    });

    it("a patch that empties the document reports 'empty document', not '0 chars'", async () => {
      ctx.db.upsertDocument("default", "spec", "remove me");

      const tool = createGoopWriteDbTool(ctx);
      const result = await tool.execute(
        { doc_type: "spec", old_string: "remove me", new_string: "" },
        toolCtx,
      );

      expect(result).toContain("empty document");
      expect(result).not.toContain("0 chars");
    });
  });

  // -----------------------------------------------------------------------
  // Positive fixture inventory — valid call shapes (W4 Task 1)
  //
  // Locks every currently-valid goop_write_db call shape as a passing
  // fixture in one self-contained block, so Wave 4 Task 2/3 runtime
  // validation tightening cannot silently break a working caller. These
  // fixtures assert the CURRENT behaviour; they are not a spec of the
  // intended behaviour. Some shapes are individually covered by dedicated
  // tests above — repeated here as a single contract surface.
  // -----------------------------------------------------------------------

  describe("positive fixture inventory — valid call shapes (W4.T1)", () => {
    it("SHAPE: full-document write (doc_type + content)", async () => {
      const tool = createGoopWriteDbTool(ctx);
      const result = await tool.execute({ doc_type: "spec", content: "# Inventory Spec" }, toolCtx);
      expect(result).toContain("Written spec");
      expect(ctx.db.getDocument("default", "spec")?.content).toBe("# Inventory Spec");
    });

    it("SHAPE: append mode (doc_type + content + mode: 'append')", async () => {
      ctx.db.upsertDocument("default", "spec", "# Base");
      const tool = createGoopWriteDbTool(ctx);
      const result = await tool.execute(
        { doc_type: "spec", content: "# Appended", mode: "append" },
        toolCtx,
      );
      expect(result).toContain("mode: append");
      expect(ctx.db.getDocument("default", "spec")?.content).toBe("# Base\n\n# Appended");
    });

    it("SHAPE: patch mode (doc_type + old_string + new_string, single match)", async () => {
      ctx.db.upsertDocument("default", "spec", "Hello world");
      const tool = createGoopWriteDbTool(ctx);
      const result = await tool.execute(
        { doc_type: "spec", old_string: "world", new_string: "GoopSpec" },
        toolCtx,
      );
      expect(result).toContain("mode: patch");
      expect(ctx.db.getDocument("default", "spec")?.content).toBe("Hello GoopSpec");
    });

    it("SHAPE: replace-all patch (doc_type + old_string + new_string + replace_all: true)", async () => {
      ctx.db.upsertDocument("default", "spec", "foo bar foo baz foo");
      const tool = createGoopWriteDbTool(ctx);
      const result = await tool.execute(
        { doc_type: "spec", old_string: "foo", new_string: "qux", replace_all: true },
        toolCtx,
      );
      expect(result).toContain("mode: patch");
      expect(ctx.db.getDocument("default", "spec")?.content).toBe("qux bar qux baz qux");
    });

    it("SHAPE: items[] batch (mixed create + patch items)", async () => {
      ctx.db.upsertDocument("default", "spec", "Hello world");
      const tool = createGoopWriteDbTool(ctx);
      const result = await tool.execute(
        {
          doc_type: "spec",
          content: "",
          items: [
            { doc_type: "spec", old_string: "world", new_string: "GoopSpec" },
            { doc_type: "blueprint", content: "# Blueprint" },
          ],
        },
        toolCtx,
      );
      expect(result).toContain("2/2 succeeded");
      expect(ctx.db.getDocument("default", "spec")?.content).toBe("Hello GoopSpec");
      expect(ctx.db.getDocument("default", "blueprint")?.content).toBe("# Blueprint");
    });

    it("SHAPE: blank-document patch workaround (old_string: '' on an empty document)", async () => {
      // CURRENT behaviour: an absent/empty document resolves to '' and
      // patchContent('', '', newString) returns ok with matchCount -1, which
      // falls through every guard so new_string becomes the full document
      // content. This is the workaround observed during discovery. Locked
      // here so Wave 4 Task 2/3 must decide deliberately whether to keep or
      // reject it rather than silently changing the outcome.
      const tool = createGoopWriteDbTool(ctx);
      const result = await tool.execute(
        { doc_type: "spec", old_string: "", new_string: "# Written via empty-old-string patch" },
        toolCtx,
      );
      expect(result).toContain("mode: patch");
      expect(ctx.db.getDocument("default", "spec")?.content).toBe(
        "# Written via empty-old-string patch",
      );
    });
  });

  // -----------------------------------------------------------------------
  // Ambiguous/invalid write-mode combinations (W4.T2) — one-shot rejection,
  // zero mutation. Mirrors the four rules in shared/write-mode.ts.
  // -----------------------------------------------------------------------

  describe("rejects ambiguous write-mode combinations (W4.T2)", () => {
    it("rule 1: rejects meaningful content and old_string together, and does not mutate", async () => {
      ctx.db.upsertDocument("default", "spec", "Hello world");

      const tool = createGoopWriteDbTool(ctx);
      const result = await tool.execute(
        { doc_type: "spec", content: "# Full replacement", old_string: "world", new_string: "x" },
        toolCtx,
      );

      expect(result).toContain("Error in goop_write_db");
      expect(result).toContain("content and old_string cannot be supplied together");
      expect(result).toContain("Valid call shapes");
      expect(ctx.db.getDocument("default", "spec")?.content).toBe("Hello world");
    });

    it("rule 2: rejects new_string without old_string, and does not mutate", async () => {
      ctx.db.upsertDocument("default", "spec", "Hello world");

      const tool = createGoopWriteDbTool(ctx);
      const result = await tool.execute(
        { doc_type: "spec", content: "# Should not be written", new_string: "x" },
        toolCtx,
      );

      expect(result).toContain("Error in goop_write_db");
      expect(result).toContain("new_string");
      expect(result).toContain("supplied without old_string");
      expect(ctx.db.getDocument("default", "spec")?.content).toBe("Hello world");
    });

    it("rule 2: rejects replace_all without old_string, and does not mutate", async () => {
      ctx.db.upsertDocument("default", "spec", "Hello world");

      const tool = createGoopWriteDbTool(ctx);
      const result = await tool.execute(
        { doc_type: "spec", content: "# Should not be written", replace_all: true },
        toolCtx,
      );

      expect(result).toContain("Error in goop_write_db");
      expect(result).toContain("replace_all");
      expect(ctx.db.getDocument("default", "spec")?.content).toBe("Hello world");
    });

    it('rule 3: rejects mode: "append" combined with old_string, and does not mutate', async () => {
      ctx.db.upsertDocument("default", "spec", "Hello world");

      const tool = createGoopWriteDbTool(ctx);
      const result = await tool.execute(
        { doc_type: "spec", old_string: "world", new_string: "GoopSpec", mode: "append" },
        toolCtx,
      );

      expect(result).toContain("Error in goop_write_db");
      expect(result).toContain('mode: "append"');
      expect(ctx.db.getDocument("default", "spec")?.content).toBe("Hello world");
    });

    it("rule 4: rejects meaningful content alongside items[], and does not mutate any document", async () => {
      ctx.db.upsertDocument("default", "spec", "Hello world");

      const tool = createGoopWriteDbTool(ctx);
      const result = await tool.execute(
        {
          doc_type: "spec",
          content: "# Real top-level content",
          items: [{ doc_type: "blueprint", content: "# Blueprint" }],
        },
        toolCtx,
      );

      expect(result).toContain("Error in goop_write_db");
      expect(result).toContain("content");
      expect(result).toContain("items[]");
      expect(ctx.db.getDocument("default", "spec")?.content).toBe("Hello world");
      expect(ctx.db.getDocument("default", "blueprint")).toBeNull();
    });

    it("rule 4: rejects old_string alongside items[], and does not mutate any document", async () => {
      ctx.db.upsertDocument("default", "spec", "Hello world");

      const tool = createGoopWriteDbTool(ctx);
      const result = await tool.execute(
        {
          doc_type: "spec",
          old_string: "world",
          new_string: "GoopSpec",
          items: [{ doc_type: "blueprint", content: "# Blueprint" }],
        },
        toolCtx,
      );

      expect(result).toContain("Error in goop_write_db");
      expect(result).toContain("old_string");
      expect(result).toContain("items[]");
      expect(ctx.db.getDocument("default", "spec")?.content).toBe("Hello world");
      expect(ctx.db.getDocument("default", "blueprint")).toBeNull();
    });

    it("rule 4: rejects mode alongside items[], and does not mutate any document", async () => {
      const tool = createGoopWriteDbTool(ctx);
      const result = await tool.execute(
        {
          doc_type: "spec",
          mode: "append",
          items: [{ doc_type: "blueprint", content: "# Blueprint" }],
        },
        toolCtx,
      );

      expect(result).toContain("Error in goop_write_db");
      expect(result).toContain("mode");
      expect(result).toContain("items[]");
      expect(ctx.db.getDocument("default", "blueprint")).toBeNull();
    });

    it("rule 4: does NOT reject empty-string content alongside items[] (documented neutral placeholder)", async () => {
      const tool = createGoopWriteDbTool(ctx);
      const result = await tool.execute(
        {
          doc_type: "spec",
          content: "",
          items: [{ doc_type: "blueprint", content: "# Blueprint" }],
        },
        toolCtx,
      );

      expect(result).toContain("1/1 succeeded");
      expect(ctx.db.getDocument("default", "blueprint")?.content).toBe("# Blueprint");
    });

    it("per-item validation: rejects a batch item that mixes content and old_string, rolling back the whole batch", async () => {
      ctx.db.upsertDocument("default", "spec", "Original spec");

      const tool = createGoopWriteDbTool(ctx);
      const result = await tool.execute(
        {
          doc_type: "spec",
          content: "",
          items: [
            { doc_type: "blueprint", content: "# Should be rolled back" },
            { doc_type: "spec", content: "# Ambiguous", old_string: "Original", new_string: "x" },
          ],
        },
        toolCtx,
      );

      expect(result).toContain("Batch write-db");
      expect(result).toContain("0/2 succeeded");
      // The first item's write must not survive despite validating fine on
      // its own — the whole batch transaction rolls back on any item error.
      expect(ctx.db.getDocument("default", "blueprint")).toBeNull();
      expect(ctx.db.getDocument("default", "spec")?.content).toBe("Original spec");
    });

    it("per-item validation: rejects a batch item with new_string but no old_string", async () => {
      const tool = createGoopWriteDbTool(ctx);
      const result = await tool.execute(
        {
          doc_type: "spec",
          content: "",
          items: [{ doc_type: "spec", content: "# Doc", new_string: "x" }],
        },
        toolCtx,
      );

      expect(result).toContain("0/1 succeeded");
      expect(result).toContain("supplied without old_string");
      expect(ctx.db.getDocument("default", "spec")).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // Retry-loop regression (W4.T4) — the one-shot error must differ from the
  // prior silent-patch success so an agent cannot loop on the identical
  // payload. Pin the runtime guarantee from W4.T2 (shared/write-mode.ts):
  // the formerly-ambiguous call surfaces a single actionable message, performs
  // no mutation, and yields a deterministic result on retry.
  // -----------------------------------------------------------------------

  describe("one-shot error prevents an identical retry loop (W4.T4)", () => {
    it("returns an actionable error that differs from the prior silent-patch success", async () => {
      // The incident this wave exists to prevent: an agent supplies BOTH
      // content (intending a full-document write) AND old_string (because a
      // host-side schema defect, or a confused model, marked it required).
      // Before W4.T2, `isPatchActive(old_string)` silently chose patch mode,
      // ignored content, and returned a "Patched ..." success — so the agent
      // saw a success-shaped result, its full write never landed, and
      // re-issuing the identical payload produced the identical misleading
      // success forever.
      ctx.db.upsertDocument("default", "spec", "Hello world");

      const tool = createGoopWriteDbTool(ctx);
      const payload = {
        doc_type: "spec" as const,
        content: "# Full document I intended to write",
        old_string: "world",
        new_string: "GoopSpec",
      };
      const result = await tool.execute(payload, toolCtx);

      // (1) The output is an error, not a success-looking result. The
      //     contrast with the prior "Patched ... / Sidecar: ..." path is
      //     what breaks the loop — an agent can no longer mistake silence
      //     for success.
      expect(result).toContain("Error in goop_write_db");
      expect(result).not.toContain("Patched");
      expect(result).not.toContain("Written");
      expect(result).not.toContain("Sidecar");

      // (2) It names BOTH conflicting fields, so the agent knows exactly
      //     what to drop without guessing.
      expect(result).toContain("content");
      expect(result).toContain("old_string");
      expect(result).toContain("content and old_string cannot be supplied together");

      // (3) It names the valid call shapes, so the agent has a concrete
      //     correction rather than a generic "invalid input" that invites
      //     an identical retry with rearranged whitespace.
      expect(result).toContain("Valid call shapes");
      expect(result).toContain("full write/append");
      expect(result).toContain("patch");
      expect(result).toContain("batch");

      // (4) No mutation occurred — a retry with a corrected payload starts
      //     from the original document state, not a half-applied patch.
      expect(ctx.db.getDocument("default", "spec")?.content).toBe("Hello world");

      // (5) Determinism: re-issuing the identical payload yields the
      //     identical actionable error. This is the retry-loop guarantee —
      //     the agent cannot stumble into a different (success-shaped)
      //     outcome by repeating the bad call. The error is stable and
      //     terminal until the agent actually changes the payload.
      const retried = await tool.execute(payload, toolCtx);
      expect(retried).toBe(result);
      expect(ctx.db.getDocument("default", "spec")?.content).toBe("Hello world");
    });
  });
});
