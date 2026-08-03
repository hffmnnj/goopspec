import { describe, expect, it } from "bun:test";

import { resolveCapabilities } from "./capability.js";

describe("resolveCapabilities", () => {
  it("normalizes V2 variants and retains their request details", () => {
    const result = resolveCapabilities({
      variants: [
        {
          id: "high",
          headers: { "x-provider-feature": "reasoning" },
          body: { reasoning: { effort: "high" } },
        },
        {
          id: "none",
          headers: {},
          body: { reasoning: { effort: "none" } },
        },
      ],
    });

    expect(result.supported).toEqual(["high", "none"]);
    expect(result.raw).toEqual({
      source: "v2",
      variants: [
        {
          id: "high",
          headers: { "x-provider-feature": "reasoning" },
          body: { reasoning: { effort: "high" } },
        },
        {
          id: "none",
          headers: {},
          body: { reasoning: { effort: "none" } },
        },
      ],
    });
  });

  it("normalizes reasoning-enabled V1 provider options", () => {
    const result = resolveCapabilities({
      capabilities: { reasoning: true },
      options: { reasoning: { effort: ["low", "medium", "high"] } },
    });

    expect(result.supported).toEqual(["low", "medium", "high"]);
    expect(result.raw).toEqual({
      source: "v1",
      options: { reasoning: { effort: ["low", "medium", "high"] } },
    });
  });

  it("collects supported ids from reasoning_options effort values", () => {
    const result = resolveCapabilities({
      reasoning: true,
      reasoning_options: [
        { type: "effort", values: ["none", "low", "medium", "high", "xhigh", "max"] },
      ],
    });

    expect(result.supported).toEqual(["none", "low", "medium", "high", "xhigh", "max"]);
    expect(result.raw).toEqual({ source: "v2", variants: [] });
  });

  it("prefers effort values and ignores numeric reasoning_options fields", () => {
    const result = resolveCapabilities({
      reasoning: true,
      reasoning_options: [
        { type: "effort", values: ["low", "medium", "high"] },
        { type: "budget_tokens", values: [1024, 32768] },
      ],
    });

    expect(result.supported).toEqual(["low", "medium", "high"]);
    expect(result.raw).toEqual({ source: "v2", variants: [] });
  });

  it("falls back to string values across reasoning_options entries when no effort entry exists", () => {
    const result = resolveCapabilities({
      reasoning: true,
      reasoning_options: [{ type: "unknown", values: ["low", "high"] }],
    });

    expect(result.supported).toEqual(["low", "high"]);
    expect(result.raw).toEqual({ source: "v2", variants: [] });
  });

  it("collects supported ids from object-map variant keys, including headerless entries", () => {
    const result = resolveCapabilities({
      variants: {
        high: {
          headers: { "x-provider-feature": "reasoning" },
          body: { reasoning: { effort: "high" } },
        },
        none: { body: { reasoning: { effort: "none" } } },
      },
    });

    expect(result.supported).toEqual(["high", "none"]);
    expect(result.raw).toEqual({ source: "v2", variants: [] });
  });

  it.each([
    undefined,
    null,
    {},
    { variants: [] },
    { variants: [{ id: "high", headers: {}, body: null }] },
    { capabilities: { reasoning: false }, options: { reasoning: ["high"] } },
    { capabilities: { reasoning: true }, options: {} },
    { reasoning: true },
    { reasoning: true, reasoning_options: [] },
    { reasoning: true, reasoning_options: [{ type: "effort", values: [] }] },
    { reasoning: true, reasoning_options: [{ type: "budget_tokens", values: [1024] }] },
  ])("returns an empty result for absent, empty, or malformed capability data", (source) => {
    expect(resolveCapabilities(source)).toEqual({ supported: [], raw: undefined });
  });

  it("never throws when property access fails", () => {
    const source = new Proxy(
      {},
      {
        get() {
          throw new Error("host catalog unavailable");
        },
      },
    );

    expect(resolveCapabilities(source)).toEqual({ supported: [], raw: undefined });
  });
});
