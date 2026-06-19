import { afterEach, beforeEach, describe, expect, it } from "bun:test";

import type { PluginContext } from "../test-utils.js";
import { createMockPluginContext, setupTestEnvironment } from "../test-utils.js";
import { createTools } from "./index.js";

const EXPECTED_TOOL_KEYS = [
  "goop_status",
  "goop_state",
  "goop_spec",
  "goop_adl",
  "goop_checkpoint",
  "goop_setup",
  "goop_reference",
  "goop_read_db",
  "goop_write_db",
  "goop_save_note",
  "goop_search_notes",
  "goop_append_chronicle",
  "memory_save",
  "memory_search",
  "memory_forget",
  "slashcommand",
] as const;

describe("createTools registry", () => {
  let ctx: PluginContext;
  let cleanup: () => void;

  beforeEach(() => {
    const env = setupTestEnvironment("tool-registry");
    cleanup = env.cleanup;
    ctx = createMockPluginContext({ testDir: env.testDir });
  });

  afterEach(() => cleanup());

  it("returns exactly 16 tools", () => {
    const tools = createTools(ctx);
    expect(Object.keys(tools)).toHaveLength(16);
  });

  it("registers all canonical MCP tool keys", () => {
    const tools = createTools(ctx);
    for (const key of EXPECTED_TOOL_KEYS) {
      expect(tools).toHaveProperty(key);
    }
  });

  it("every tool has a description string", () => {
    const tools = createTools(ctx);
    for (const [key, def] of Object.entries(tools)) {
      expect(typeof def.description, `${key}.description`).toBe("string");
      expect(def.description.length, `${key}.description non-empty`).toBeGreaterThan(0);
    }
  });

  it("every tool has an execute function", () => {
    const tools = createTools(ctx);
    for (const [key, def] of Object.entries(tools)) {
      expect(typeof def.execute, `${key}.execute`).toBe("function");
    }
  });
});
