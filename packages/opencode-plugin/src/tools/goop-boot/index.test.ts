import { afterEach, beforeEach, describe, expect, it } from "bun:test";

import type { ResolvedResource } from "../../core/types.js";
import type { MemoryEntry, PluginContext, ToolContext } from "../../test-utils.js";
import {
  createMockPluginContext,
  createMockToolContext,
  setupTestEnvironment,
} from "../../test-utils.js";
import { createGoopBootTool } from "./index.js";

const memories: MemoryEntry[] = [
  {
    id: 1,
    type: "observation",
    title: "Boot sequence guidance",
    content: "Use the context loader for agent boot.",
    concepts: ["boot"],
    importance: 8,
    createdAt: Date.now(),
  },
];

const resources: ResolvedResource[] = [
  {
    name: "core-protocol",
    type: "reference",
    content: "# Core Protocol\n\n## Boot\n\nLoad context first.",
  },
];

describe("goop_boot tool", () => {
  let ctx: PluginContext;
  let toolCtx: ToolContext;
  let cleanup: () => void;

  beforeEach(() => {
    const env = setupTestEnvironment("goop-boot");
    cleanup = env.cleanup;
    ctx = createMockPluginContext({
      testDir: env.testDir,
      db: env.db,
      memories,
      resources,
    });
    toolCtx = createMockToolContext();
    ctx.db.upsertDocument("default", "spec", "# Test Spec");
    ctx.db.upsertDocument("default", "blueprint", "# Test Blueprint");
    ctx.db.saveNote({
      id: "fn_boot_research",
      title: "Boot research",
      body: "Combine independent context reads.",
      tags: JSON.stringify(["boot"]),
      source_agent: "goop-researcher",
      importance: 8,
      workflow_id: null,
      project_id: null,
    });
  });

  afterEach(() => cleanup());

  it("omits Documents section entirely when doc_types is not provided", async () => {
    const result = await createGoopBootTool(ctx).execute({}, toolCtx);

    expect(result).not.toContain("## Documents");
    expect(result).not.toContain("### spec");
    expect(result).not.toContain("### blueprint");
  });

  it("returns exactly the requested document types via explicit doc_types", async () => {
    ctx.db.upsertDocument("default", "chronicle", "# Test Chronicle");
    const result = await createGoopBootTool(ctx).execute({ doc_types: ["chronicle"] }, toolCtx);

    expect(result).toContain("### chronicle\n\n# Test Chronicle");
    expect(result).not.toContain("### spec");
    expect(result).not.toContain("### blueprint");
  });

  it("returns multiple requested document types when doc_types lists them", async () => {
    ctx.db.upsertDocument("default", "chronicle", "# Test Chronicle");
    const result = await createGoopBootTool(ctx).execute(
      { doc_types: ["spec", "chronicle"] },
      toolCtx,
    );

    expect(result).toContain("### spec\n\n# Test Spec");
    expect(result).toContain("### chronicle\n\n# Test Chronicle");
    expect(result).not.toContain("### blueprint");
  });

  it("loads requested Field Notes, memory, and references only", async () => {
    const result = await createGoopBootTool(ctx).execute(
      {
        note_query: "combine",
        memory_query: "context loader",
        references: ["core-protocol"],
      },
      toolCtx,
    );

    expect(result).toContain("## Field Notes");
    expect(result).toContain("Boot research");
    expect(result).toContain("## Memory");
    expect(result).toContain("Boot sequence guidance");
    expect(result).toContain("## References");
    expect(result).toContain("### core-protocol");

    const defaultResult = await createGoopBootTool(ctx).execute({}, toolCtx);
    expect(defaultResult).not.toContain("## Field Notes");
    expect(defaultResult).not.toContain("## Memory");
    expect(defaultResult).not.toContain("## References");
  });
});
