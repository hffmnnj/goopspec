import { describe, expect, it } from "bun:test";

import { resolveCapabilities } from "./capability.js";
import { THINKING_LABEL_CANDIDATES, resolveThinkingValue } from "./resolve.js";

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
      warning:
        'Thinking level "xhigh" is not supported by the resolved model; preserving the provider default.',
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
      warning:
        'Thinking level "low" is not supported by the resolved model; preserving the provider default.',
      source: "preserve-default",
    });
  });

  it("never silently downgrades an unsupported label to a nearby supported level", () => {
    const capabilities = resolveCapabilities({
      variants: [
        { id: "low", headers: {}, body: { reasoning: { effort: "low" } } },
        { id: "medium", headers: {}, body: { reasoning: { effort: "medium" } } },
        { id: "high", headers: {}, body: { reasoning: { effort: "high" } } },
      ],
    });

    const resolution = resolveThinkingValue("xhigh", capabilities);
    expect(resolution.apply).toBeNull();
    expect(resolution.source).toBe("preserve-default");
    expect(resolution.warning).toBe(
      'Thinking level "xhigh" is not supported by the resolved model; preserving the provider default.',
    );
  });

  it("returns apply: null and a warning for unsupported labels on V1 provider data", () => {
    const capabilities = resolveCapabilities({
      capabilities: { reasoning: true },
      options: { reasoning: { effort: ["low", "medium", "high"] } },
    });

    const resolution = resolveThinkingValue("xhigh", capabilities);
    expect(resolution.apply).toBeNull();
    expect(resolution.source).toBe("preserve-default");
    expect(resolution.warning).toContain("xhigh");
    expect(resolution.warning).toContain("not supported");
  });

  it("treats none as a real unsupported variant rather than budget 0", () => {
    const capabilities = resolveCapabilities({
      variants: [
        { id: "low", headers: {}, body: { reasoning: { effort: "low" } } },
        { id: "high", headers: {}, body: { reasoning: { effort: "high" } } },
      ],
    });

    const resolution = resolveThinkingValue("none", capabilities);
    expect(resolution.apply).toBeNull();
    expect(resolution.source).toBe("preserve-default");
    expect(resolution.warning).toContain('Thinking level "none" is not supported');
  });

  it("does not throw when capability raw data is missing", () => {
    expect(() =>
      resolveThinkingValue("high", {
        supported: ["high"],
        raw: undefined,
      }),
    ).not.toThrow();

    const resolution = resolveThinkingValue("high", {
      supported: ["high"],
      raw: undefined,
    });
    expect(resolution.apply).toBeNull();
    expect(resolution.source).toBe("preserve-default");
  });

  it("does not throw when the supported set is empty", () => {
    expect(() => resolveThinkingValue("high", { supported: [], raw: undefined })).not.toThrow();

    const resolution = resolveThinkingValue("high", { supported: [], raw: undefined });
    expect(resolution.apply).toBeNull();
    expect(resolution.source).toBe("preserve-default");
  });
});
