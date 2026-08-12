import { afterEach, beforeEach, describe, expect, it } from "bun:test";

import {
  type PluginContext,
  createMockPluginContext,
  createMockToolContext,
  setupTestEnvironment,
} from "../test-utils.js";
import { createTools } from "../tools/index.js";
import { tool } from "./sdk-compat.js";
import { convertToolArgsToJsonSchema, registerToolsV2 } from "./tools-v2.js";
import type {
  V2JsonSchema,
  V2RuntimeContext,
  V2ToolCapability,
  V2ToolDefinition,
  V2ToolDraft,
} from "./v2-compat.js";

function createRuntimeContext(registrations: V2ToolDefinition[]): V2RuntimeContext {
  const draft: V2ToolDraft = {
    add(definition) {
      registrations.push(definition);
    },
  };

  return {
    tool: {
      transform: async (callback: Parameters<V2ToolCapability["transform"]>[0]) => callback(draft),
      hook: async () => {},
    },
  } as unknown as V2RuntimeContext;
}

function addCompactionCapability(ctx: PluginContext): void {
  Object.defineProperty(ctx.sdk, "client", {
    configurable: true,
    value: {
      session: {
        summarize: async (): Promise<boolean> => true,
      },
    },
  });
}

describe("registerToolsV2()", () => {
  const contexts: PluginContext[] = [];

  afterEach(() => {
    for (const context of contexts.splice(0)) {
      context.db.close();
    }
  });

  it("omits goop_compact when the V2 client cannot compact sessions", async () => {
    const ctx = createMockPluginContext();
    contexts.push(ctx);
    const registrations: V2ToolDefinition[] = [];

    await registerToolsV2(createRuntimeContext(registrations), ctx);

    const names = registrations.map((definition) => definition.name);
    expect(names).not.toContain("goop_compact");
    expect(names).toContain("goop_status");
  });

  it("registers goop_compact when the client can compact sessions", async () => {
    const ctx = createMockPluginContext();
    contexts.push(ctx);
    addCompactionCapability(ctx);
    const registrations: V2ToolDefinition[] = [];

    await registerToolsV2(createRuntimeContext(registrations), ctx);

    expect(registrations.map((definition) => definition.name).sort()).toEqual(
      Object.keys(createTools(ctx)).sort(),
    );
    expect(registrations).toHaveLength(38);
  });

  it("omits goop_compact when client.session exists but summarize is not a function (NFR4)", async () => {
    const ctx = createMockPluginContext();
    contexts.push(ctx);
    // The capability gate checks typeof client.session.summarize === "function".
    // A session object without summarize must still be treated as incapable.
    Object.defineProperty(ctx.sdk, "client", {
      configurable: true,
      value: { session: {} },
    });
    const registrations: V2ToolDefinition[] = [];

    await registerToolsV2(createRuntimeContext(registrations), ctx);

    const names = registrations.map((definition) => definition.name);
    expect(names).not.toContain("goop_compact");
    expect(names).toContain("goop_status");
  });

  it("converts goop_status arguments with Zod's native JSON Schema support", () => {
    const ctx = createMockPluginContext();
    contexts.push(ctx);

    const schema = convertToolArgsToJsonSchema(createTools(ctx).goop_status.args);

    expect(schema.type).toBe("object");
    expect(schema.properties).toEqual({
      verbose: {
        type: "boolean",
        description: expect.any(String),
      },
    });
  });

  it("delegates a V2 execution to the canonical V1 tool body", async () => {
    const ctx = createMockPluginContext();
    contexts.push(ctx);
    const registrations: V2ToolDefinition[] = [];
    const input = { verbose: false };

    await registerToolsV2(createRuntimeContext(registrations), ctx);

    const v1Result = await createTools(ctx).goop_status.execute(input, createMockToolContext());
    expect(typeof v1Result).toBe("string");
    if (typeof v1Result !== "string") throw new Error("goop_status must return text");

    const v2Result = await registrations
      .find((definition) => definition.name === "goop_status")
      ?.execute(input, { sessionID: "test-session" });

    expect(v2Result).toEqual({
      content: [{ type: "text", text: v1Result }],
    });
  });

  it("reuses the coalesced V1 write definition with optional injected fields", async () => {
    const ctx = createMockPluginContext();
    contexts.push(ctx);
    const registrations: V2ToolDefinition[] = [];
    const input = {
      doc_type: "spec",
      content: "# V2 write",
      workflow_id: "",
      mode: "",
      old_string: "",
      new_string: "",
      replace_all: false,
      items: [],
    };

    await registerToolsV2(createRuntimeContext(registrations), ctx);
    const v1Result = await createTools(ctx).goop_write_db.execute(input, createMockToolContext());
    const v2Result = await registrations
      .find((definition) => definition.name === "goop_write_db")
      ?.execute(input, { sessionID: "test-session" });

    expect(v2Result).toEqual({
      content: [{ type: "text", text: v1Result as string }],
    });
    expect(ctx.db.getDocument("default", "spec")?.content).toBe("# V2 write");
  });
});

// ---------------------------------------------------------------------------
// Host-visible required-array contract (W4.T4)
//
// HOST-CONVERSION BOUNDARY: this block pins the JSON Schema the PLUGIN hands
// to the host through the V2 conversion path (convertToolArgsToJsonSchema →
// z.toJSONSchema from Zod v4). Host-side V1 conversion — the host running its
// own z.toJSONSchema (or the older zod-to-json-schema@3.x) over our Zod args
// — is OUTSIDE plugin control and has independent, documented defects:
//   - opencode #20807: zod-to-json-schema@3.x is broken with Zod v4 and can
//     emit a schema with no `properties` and no `required`.
//   - opencode #13618: a missing `required` key on a schema that has
//     `properties` is rejected by the Claude API.
// We cannot test what the host does with our schema after we hand it over.
// We CAN and DO pin here that the schema the plugin emits at its boundary is
// correct: every tool declares `properties`, and `required` contains exactly
// the intended identifiers and nothing else.
//
// Runtime validation (shared/write-mode.ts and the per-tool mode checks from
// W4.T2/T3) remains the real safety guarantee: even if a host-side conversion
// defect or a confused model sends an optional field as if it were required,
// the tool rejects the ambiguous payload with a one-shot actionable error
// before any mutation occurs. See goop-write-db/index.test.ts
// "one-shot error prevents an identical retry loop" for that regression.
//
// A note on `.default()`: Zod v4 deliberately includes a `.default(...)` field
// in the JSON Schema `required` array because the *parsed output* always
// carries a value (the default). difftastic's `checkOnly` is therefore
// correctly listed below — this is distinct from the patch-field leakage
// defect, where a bare `.optional()` field (no default) must never appear.
// ---------------------------------------------------------------------------

describe("convertToolArgsToJsonSchema() — host-visible required-array contract", () => {
  const contractContexts: PluginContext[] = [];

  afterEach(() => {
    for (const context of contractContexts.splice(0)) {
      context.db.close();
    }
  });

  // Expected top-level `required` array for EVERY tool returned by
  // createTools(). Update an entry ONLY when intentionally changing a tool's
  // argument contract. Two failure modes are deliberate:
  //   - A new tool added to createTools() without an entry here fails the
  //     "every tool has a contract entry" test.
  //   - A schema change that drifts requiredness fails the per-tool
  //     properties+required test.
  // Both force an explicit, reviewed contract update.
  const EXPECTED_REQUIRED: Record<string, string[]> = {
    ast_grep: ["pattern", "language"],
    background_cancel: ["job_id"],
    background_command: ["command"],
    background_status: [],
    // checkOnly is `.optional().default(false)` — see the .default() note above.
    difftastic: ["checkOnly"],
    generate_image: ["prompt"],
    goop_acceptance_audit: [],
    goop_adl: ["action"],
    goop_append_chronicle: [],
    goop_blocker: [],
    goop_boot: [],
    goop_checkpoint: ["action"],
    goop_compact: ["next_step"],
    goop_create_pr: ["title", "body", "branch"],
    goop_dashboard: [],
    goop_get_global_config: [],
    goop_infer_intent: ["transcript"],
    goop_query_decisions: [],
    goop_read_db: [],
    goop_read_section: ["doc_type"],
    goop_read_wave: [],
    goop_reference: [],
    // All create + patch fields are optional; runtime enforces per-mode rules.
    goop_save_note: [],
    goop_search_docs: ["query"],
    goop_search_notes: [],
    goop_setup: ["action"],
    goop_spec: ["action"],
    goop_state: ["action"],
    goop_status: [],
    goop_timeline: [],
    goop_write_db: ["doc_type"],
    goop_write_section: ["doc_type"],
    goop_write_wave: [],
    memory_forget: [],
    memory_save: ["title", "content"],
    memory_search: ["query"],
    scip: ["action"],
    slashcommand: ["command"],
  };

  function requiredOf(schema: V2JsonSchema): string[] {
    return (schema.required as string[] | undefined) ?? [];
  }

  function itemElementRequired(schema: V2JsonSchema, arrayProp: string): string[] {
    const properties = schema.properties as Record<string, V2JsonSchema | undefined> | undefined;
    const arraySchema = properties?.[arrayProp];
    const elementSchema = arraySchema?.items as V2JsonSchema | undefined;
    return requiredOf(elementSchema ?? {});
  }

  it("every createTools() entry has an explicit expected-required contract entry", () => {
    const ctx = createMockPluginContext();
    contractContexts.push(ctx);
    const toolNames = Object.keys(createTools(ctx)).sort();
    const expectedNames = Object.keys(EXPECTED_REQUIRED).sort();

    // Catches a new tool added to createTools() without a contract entry, and
    // a stale entry left behind after a tool is removed.
    expect(toolNames).toEqual(expectedNames);
  });

  it("every tool's converted schema declares properties and matches its pinned required array", () => {
    const ctx = createMockPluginContext();
    contractContexts.push(ctx);
    const tools = createTools(ctx);

    for (const [name, definition] of Object.entries(tools)) {
      const schema = convertToolArgsToJsonSchema(definition.args);

      // opencode #20807: a host conversion defect can strip `properties`
      // entirely. Pin that the plugin-side conversion always emits the key as
      // an object. A zero-argument tool (goop_get_global_config) legitimately
      // emits `properties: {}`, so we require the key be an object, not that
      // it be non-empty.
      const properties = schema.properties as Record<string, unknown> | undefined;
      expect(properties, `${name} must declare a properties object`).toBeDefined();
      expect(typeof properties, `${name} properties must be an object`).toBe("object");
      expect(properties, `${name} properties must not be null`).not.toBeNull();

      // Zod v4's z.toJSONSchema OMITS the `required` key entirely when an
      // object has no required fields (it does not emit `required: []`).
      // That absent-key shape is the same one opencode #13618 documents as
      // rejected by some providers — but forcing a present `required: []`
      // would require a production change to the converter output, which is
      // out of scope for this test-focused task. `requiredOf()` normalizes
      // absence to `[]`, so the contract comparison is honest about what the
      // plugin emits today; a future task that force-emits the key must
      // update `requiredOf` or this assertion intentionally.
      const expected = EXPECTED_REQUIRED[name].slice().sort();
      const actual = requiredOf(schema).slice().sort();
      expect(actual, `${name} required-array contract`).toEqual(expected);
    }
  });

  it("no patch field (old_string/new_string/replace_all) appears in any tool's top-level required", () => {
    // The defect this wave exists to prevent: an optional patch field leaking
    // into `required` would force every caller to supply old_string/new_string,
    // turning every full-document write into a silent patch call. Pin that no
    // write tool's top-level schema ever requires a patch modifier.
    const ctx = createMockPluginContext();
    contractContexts.push(ctx);
    const tools = createTools(ctx);
    const patchFields = ["old_string", "new_string", "replace_all"];

    for (const [name, definition] of Object.entries(tools)) {
      const schema = convertToolArgsToJsonSchema(definition.args);
      const required = requiredOf(schema);
      for (const field of patchFields) {
        expect(required, `${name} must not require patch field '${field}'`).not.toContain(field);
      }
    }
  });

  it("goop_write_db items[] element requires only doc_type and omits patch fields from required", () => {
    const ctx = createMockPluginContext();
    contractContexts.push(ctx);
    const schema = convertToolArgsToJsonSchema(createTools(ctx).goop_write_db.args);

    expect(itemElementRequired(schema, "items").sort()).toEqual(["doc_type"]);
  });

  it("goop_write_section items[] element requires doc_type and section_key", () => {
    const ctx = createMockPluginContext();
    contractContexts.push(ctx);
    const schema = convertToolArgsToJsonSchema(createTools(ctx).goop_write_section.args);

    expect(itemElementRequired(schema, "items").sort()).toEqual(["doc_type", "section_key"]);
  });

  it("goop_save_note items[] element requires nothing (every field is optional)", () => {
    const ctx = createMockPluginContext();
    contractContexts.push(ctx);
    const schema = convertToolArgsToJsonSchema(createTools(ctx).goop_save_note.args);

    // No doc_type on note items; create fields and patch fields are all
    // optional at the schema level and disambiguated at runtime. Pin that
    // nothing leaked into required.
    expect(itemElementRequired(schema, "items")).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // Six-tool batch inventory — schema side. Each write tool's batch array
  // element carries exactly the required identifiers runtime actually needs
  // per item (plus any sub-array element pins for goop_write_wave). A drifted
  // schema that drops or adds an element-required field fails here.
  // -------------------------------------------------------------------------

  it("goop_write_wave items[] element requires wave_number", () => {
    const ctx = createMockPluginContext();
    contractContexts.push(ctx);
    const schema = convertToolArgsToJsonSchema(createTools(ctx).goop_write_wave.args);

    expect(itemElementRequired(schema, "items").sort()).toEqual(["wave_number"]);
  });

  it("goop_write_wave task_updates[] element requires task_index and status", () => {
    const ctx = createMockPluginContext();
    contractContexts.push(ctx);
    const schema = convertToolArgsToJsonSchema(createTools(ctx).goop_write_wave.args);

    expect(itemElementRequired(schema, "task_updates").sort()).toEqual(["status", "task_index"]);
  });

  it("goop_write_wave verifications[] element requires check_name and status", () => {
    const ctx = createMockPluginContext();
    contractContexts.push(ctx);
    const schema = convertToolArgsToJsonSchema(createTools(ctx).goop_write_wave.args);

    expect(itemElementRequired(schema, "verifications").sort()).toEqual(["check_name", "status"]);
  });

  it("goop_write_wave traceability[] element requires requirement_key", () => {
    const ctx = createMockPluginContext();
    contractContexts.push(ctx);
    const schema = convertToolArgsToJsonSchema(createTools(ctx).goop_write_wave.args);

    expect(itemElementRequired(schema, "traceability").sort()).toEqual(["requirement_key"]);
  });

  it("goop_blocker items[] element requires action", () => {
    const ctx = createMockPluginContext();
    contractContexts.push(ctx);
    const schema = convertToolArgsToJsonSchema(createTools(ctx).goop_blocker.args);

    expect(itemElementRequired(schema, "items").sort()).toEqual(["action"]);
  });

  it("goop_append_chronicle entries[] element is a plain string (no required fields)", () => {
    const ctx = createMockPluginContext();
    contractContexts.push(ctx);
    const schema = convertToolArgsToJsonSchema(createTools(ctx).goop_append_chronicle.args);

    expect(itemElementRequired(schema, "entries")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Argument description survival (W1.T2a)
//
// V2 hosts read argument documentation ONLY from the `description` field on
// each JSON Schema node the plugin hands them. The original conversion used
// the workspace `zod` instance (`z.toJSONSchema(z.object(args))`) over schemas
// built with `tool.schema.*` (the Zod bundled inside @opencode-ai/plugin).
// That cross-instance conversion silently drops every `.describe()` string.
//
// These tests pin that descriptions survive the conversion at every nesting
// depth, using REAL createTools() output. A hand-written fixture is exactly
// what let the original defect hide. If a pinned description string drifts
// because a tool's args were reworded, update the expected string here — the
// coupling is intentional and documents the host-visible contract.
// ---------------------------------------------------------------------------

describe("convertToolArgsToJsonSchema() — argument descriptions survive V2 conversion", () => {
  const descContexts: PluginContext[] = [];

  afterEach(() => {
    for (const context of descContexts.splice(0)) {
      context.db.close();
    }
  });

  function prop(schema: V2JsonSchema, name: string): V2JsonSchema {
    const properties = schema.properties as Record<string, V2JsonSchema | undefined> | undefined;
    return properties?.[name] ?? {};
  }

  function itemsOf(arraySchema: V2JsonSchema): V2JsonSchema {
    return (arraySchema.items as V2JsonSchema | undefined) ?? {};
  }

  it("preserves a top-level argument description (goop_write_wave.title)", () => {
    const ctx = createMockPluginContext();
    descContexts.push(ctx);
    const schema = convertToolArgsToJsonSchema(createTools(ctx).goop_write_wave.args);

    expect(prop(schema, "title").description).toBe(
      "Omit to preserve the stored title; cannot be an empty string — intentional metadata clearing is not supported, so supply a non-empty value to overwrite.",
    );
  });

  it("preserves a nested object property description (goop_write_wave.items[].title)", () => {
    const ctx = createMockPluginContext();
    descContexts.push(ctx);
    const schema = convertToolArgsToJsonSchema(createTools(ctx).goop_write_wave.args);

    const itemElement = itemsOf(prop(schema, "items"));
    expect(prop(itemElement, "title").description).toBe(
      "Omit to preserve the stored title; cannot be an empty string — intentional metadata clearing is not supported, so supply a non-empty value to overwrite.",
    );
  });

  it("preserves an array item field description at nested depth (goop_write_wave.items[].verifications[].wave_id)", () => {
    const ctx = createMockPluginContext();
    descContexts.push(ctx);
    const schema = convertToolArgsToJsonSchema(createTools(ctx).goop_write_wave.args);

    const itemElement = itemsOf(prop(schema, "items"));
    const verificationElement = itemsOf(prop(itemElement, "verifications"));
    expect(prop(verificationElement, "wave_id").description).toBe(
      "Internal wave row id (not wave_number); omit to inherit the enclosing item's resolved wave row, supply to override.",
    );
  });

  // Regression guard for the exact mechanism that caused the original defect:
  // converting a `tool.schema`-built schema with the workspace `zod` instance
  // drops descriptions. This controlled schema isolates the conversion path
  // from any specific tool's content, so it fails immediately if the converter
  // reverts to a cross-instance call (e.g. `z.toJSONSchema(z.object(args))`).
  it("regression: conversion uses the same Zod instance that built the schema", () => {
    const args = {
      labelled: tool.schema.string().describe("REGRESSION_MARKER_TOP"),
      nested: tool.schema.object({
        inner: tool.schema.string().describe("REGRESSION_MARKER_NESTED"),
      }),
    };
    const schema = convertToolArgsToJsonSchema(args);

    expect(prop(schema, "labelled").description).toBe("REGRESSION_MARKER_TOP");
    expect(prop(prop(schema, "nested"), "inner").description).toBe("REGRESSION_MARKER_NESTED");
  });
});

// ---------------------------------------------------------------------------
// Wave 1 Task 1.1 — V2 reuse of the write-tool boundary (tests-first)
//
// MH-5 pins: V2 registers the SAME createTools() definitions the V1 path uses
// (so the injected-default boundary and its pending fix apply on both hosts),
// the write tools' injected-default surface stays optional in the emitted
// schema, and a V2 execution of a write tool produces byte-identical results
// to V1 for the same host-augmented payload.
// ---------------------------------------------------------------------------

describe("V2 reuse of the write-tool boundary (Wave 1 Task 1.1)", () => {
  let ctx: PluginContext;
  let cleanup: () => void;

  beforeEach(() => {
    const env = setupTestEnvironment("v2-write-boundary");
    cleanup = env.cleanup;
    ctx = createMockPluginContext({ testDir: env.testDir, db: env.db });
  });

  afterEach(() => cleanup());

  // Fields the host fills with type defaults when the caller omits them. Each
  // one must remain optional in the schema V2 hands the host — an injected
  // default can never be forced onto callers as required. The list covers the
  // full optional surface of the six write tools: mode-selecting, container,
  // patch-modifier, and scalar fields alike. wave_number is optional in the
  // schema ONLY because traceability-only calls omit it; runtime enforces the
  // requirement for every other mode (see the tool description).
  const INJECTED_DEFAULT_FIELDS: Record<string, string[]> = {
    goop_write_db: ["items", "mode", "replace_all", "old_string", "new_string"],
    goop_write_section: ["items", "action", "position", "replace_all", "old_string", "new_string"],
    goop_save_note: [
      "items",
      "note_id",
      "replace_all",
      "old_string",
      "new_string",
      "tags",
      "importance",
    ],
    goop_append_chronicle: ["entries", "alsoLogAdl", "alsoSaveMemory", "entry", "workflow_id"],
    goop_blocker: [
      "items",
      "action",
      "description",
      "severity",
      "status",
      "resolution",
      "id",
      "wave_id",
      "workflow_id",
    ],
    goop_write_wave: [
      "items",
      "task_updates",
      "task_update",
      "verifications",
      "traceability",
      "title",
      "pr_branch",
      "pr_url",
      "status",
      "tasks",
      "wave_number",
      "allow_status_regression",
    ],
  };

  function requiredOf(schema: V2JsonSchema): string[] {
    return (schema.required as string[] | undefined) ?? [];
  }

  it("keeps every injected-default field optional in the emitted V2 schema", () => {
    const tools = createTools(ctx);
    for (const [name, fields] of Object.entries(INJECTED_DEFAULT_FIELDS)) {
      const schema = convertToolArgsToJsonSchema(tools[name].args);
      const required = requiredOf(schema);
      for (const field of fields) {
        expect(
          required,
          `${name} must keep '${field}' optional (optional fields stay optional)`,
        ).not.toContain(field);
      }
    }
  });

  it("V2 execution of goop_write_db full write succeeds through the shared definition", async () => {
    const registrations: V2ToolDefinition[] = [];
    await registerToolsV2(createRuntimeContext(registrations), ctx);

    const v2Definition = registrations.find((definition) => definition.name === "goop_write_db");
    expect(v2Definition).toBeDefined();
    if (!v2Definition) throw new Error("goop_write_db must be registered on V2");

    const result = await v2Definition.execute(
      { doc_type: "spec", content: "# v2 hello" },
      { sessionID: "test-session" },
    );
    const text = result.content[0].text as string;
    expect(text).toContain("Written spec");
  });

  it("V2 execution applies the same injected-default boundary as V1 for goop_write_db", async () => {
    const registrations: V2ToolDefinition[] = [];
    await registerToolsV2(createRuntimeContext(registrations), ctx);

    const v2Definition = registrations.find((definition) => definition.name === "goop_write_db");
    expect(v2Definition).toBeDefined();
    if (!v2Definition) throw new Error("goop_write_db must be registered on V2");

    // Host-augmented full write: caller authored only doc_type + content.
    const payload = {
      doc_type: "spec",
      content: "# hello",
      workflow_id: "",
      mode: "",
      old_string: "",
      new_string: "",
      replace_all: false,
      items: [],
    };

    const v1Result = await createTools(ctx).goop_write_db.execute(payload, createMockToolContext());
    expect(typeof v1Result).toBe("string");
    if (typeof v1Result !== "string") throw new Error("goop_write_db must return text");

    const v2Result = await v2Definition.execute(payload, { sessionID: "test-session" });
    // V2 wraps the SAME V1 execution result — identical boundary, no duplicated
    // normalization logic in the adapter.
    expect(v2Result).toEqual({ content: [{ type: "text", text: v1Result }] });
  });
});
