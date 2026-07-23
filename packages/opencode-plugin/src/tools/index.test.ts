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
  "goop_compact",
  "goop_setup",
  "goop_get_global_config",
  "goop_reference",
  "goop_read_db",
  "goop_write_db",
  "goop_save_note",
  "goop_search_notes",
  "goop_acceptance_audit",
  "goop_append_chronicle",
  "goop_boot",
  "goop_create_pr",
  "goop_write_section",
  "goop_read_section",
  "goop_write_wave",
  "goop_read_wave",
  "goop_query_decisions",
  "goop_blocker",
  "goop_search_docs",
  "goop_timeline",
  "goop_dashboard",
  "goop_infer_intent",
  "memory_save",
  "memory_search",
  "memory_forget",
  "slashcommand",
  "ast_grep",
  "difftastic",
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

  it("returns exactly 33 tools", () => {
    const tools = createTools(ctx);
    expect(Object.keys(tools)).toHaveLength(33);
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
