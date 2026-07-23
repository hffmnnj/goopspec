import { afterEach, describe, expect, it } from "bun:test";

import {
  type PluginContext,
  createMockPluginContext,
  createMockToolContext,
} from "../test-utils.js";
import { createTools } from "../tools/index.js";
import { convertToolArgsToJsonSchema, registerToolsV2 } from "./tools-v2.js";
import type {
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
    expect(registrations).toHaveLength(32);
  });

  it("converts goop_status arguments with Zod's native JSON Schema support", () => {
    const ctx = createMockPluginContext();
    contexts.push(ctx);

    const schema = convertToolArgsToJsonSchema(createTools(ctx).goop_status.args);

    expect(schema.type).toBe("object");
    expect(schema.properties).toEqual({
      verbose: { type: "boolean" },
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
});
