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

  it.each([
    undefined,
    null,
    {},
    { variants: [] },
    { variants: [{ id: "high", headers: {}, body: null }] },
    { capabilities: { reasoning: false }, options: { reasoning: ["high"] } },
    { capabilities: { reasoning: true }, options: {} },
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
