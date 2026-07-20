import { describe, expect, it } from "bun:test";

import { buildTier1Message, buildTier2Message } from "./message.js";

const tier1Result = {
  tier: "tier1" as const,
  tool: "bash",
  argsSignature: "abc123",
  repeatCount: 3,
};

describe("loop-detection messages", () => {
  it("builds a concise Tier 1 stop directive", () => {
    const message = buildTier1Message(tier1Result, "unchanged output");

    expect(message).toContain("LOOP DETECTED");
    expect(message).toContain('Tool "bash" repeated 3 times');
    expect(message).toContain("identical arguments and output");
    expect(message).toContain("Do not retry");
    expect(message).toContain("Four-Rule Deviation System (Rule 4)");
    expect(message).not.toContain("unchanged output");
  });

  it("notes when a Tier 1 call returned no output", () => {
    expect(buildTier1Message(tier1Result, "  ")).toContain("The tool returned no output.");
  });

  it("builds a short Tier 2 warning", () => {
    const message = buildTier2Message({
      tier: "tier2",
      tool: "bash",
      argsSignature: "abc123",
      repeatCount: 4,
    });

    expect(message).toContain("Loop warning");
    expect(message).toContain("bash");
    expect(message).toContain("4 times");
  });
});
