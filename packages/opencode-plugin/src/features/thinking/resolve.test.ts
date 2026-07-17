import { describe, expect, it } from "bun:test";

import { resolveCapabilities } from "./capability.js";
import { resolveThinkingValue, THINKING_LABEL_CANDIDATES } from "./resolve.js";

describe("resolveThinkingValue", () => {
  it("returns the exact V2 variant with its request body and headers", () => {
    const capabilities = resolveCapabilities({
      variants: [
        {
          id: "high",
          headers: { "x-provider-feature": "reasoning" },
          body: { reasoning: { effort: "high" } },
        },
      ],
    });

    expect(resolveThinkingValue("high", capabilities)).toEqual({
      apply: {
        id: "high",
        headers: { "x-provider-feature": "reasoning" },
        body: { reasoning: { effort: "high" } },
      },
      source: "v2",
    });
  });

  it("treats none as a supported V2 variant", () => {
    const capabilities = resolveCapabilities({
      variants: [{ id: "none", headers: {}, body: { reasoning: { effort: "none" } } }],
    });

    expect(resolveThinkingValue("none", capabilities)).toEqual({
      apply: { id: "none", headers: {}, body: { reasoning: { effort: "none" } } },
      source: "v2",
    });
  });

  it("returns the exact V1 provider option without creating a numeric budget", () => {
    const capabilities = resolveCapabilities({
      capabilities: { reasoning: true },
      options: { reasoning: { effort: ["low", "medium", "high"] } },
    });

    expect(resolveThinkingValue("medium", capabilities)).toEqual({ apply: "medium", source: "v1" });
  });

  it("preserves the provider default with a warning when the requested level is unsupported", () => {
    const capabilities = resolveCapabilities({
      variants: [{ id: "high", headers: {}, body: { reasoning: { effort: "high" } } }],
    });

    expect(resolveThinkingValue("xhigh", capabilities)).toEqual({
      apply: null,
      warning: 'Thinking level "xhigh" is not supported by the resolved model; preserving the provider default.',
      source: "preserve-default",
    });
  });

  it("never maps xhigh to high", () => {
    expect(THINKING_LABEL_CANDIDATES.xhigh).not.toContain("high");

    const capabilities = resolveCapabilities({
      capabilities: { reasoning: true },
      options: { reasoning: { effort: ["high"] } },
    });

    expect(resolveThinkingValue("xhigh", capabilities).apply).toBeNull();
  });

  it("preserves the provider default for empty or malformed capability data", () => {
    expect(resolveThinkingValue("low", resolveCapabilities(undefined))).toEqual({
      apply: null,
      warning: 'Thinking level "low" is not supported by the resolved model; preserving the provider default.',
      source: "preserve-default",
    });
  });
});
