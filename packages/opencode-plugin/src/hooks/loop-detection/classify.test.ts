import { beforeEach, describe, expect, it } from "bun:test";

import { classify, resetSignature } from "./classify.js";
import { type LoopTracker, createLoopTracker } from "./tracker.js";
import type { Entry, LoopDetectionConfig } from "./types.js";

function makeEntry(
  tool: string,
  argsHash: string,
  outputHash: string,
  timestamp = Date.now(),
): Entry {
  return { tool, normalizedArgsHash: argsHash, outputHash, timestamp };
}

function defaults(): Required<LoopDetectionConfig> {
  return {
    enabled: true,
    tier1Threshold: 3,
    windowSize: 5,
    tier2Threshold: 4,
  };
}

describe("classify", () => {
  it("classifies 3 consecutive identical calls as tier1", () => {
    const history: Entry[] = [
      makeEntry("bash", "hash-a", "hash-out"),
      makeEntry("bash", "hash-a", "hash-out"),
      makeEntry("bash", "hash-a", "hash-out"),
    ];

    const result = classify(history, defaults());

    expect(result).toEqual({
      tier: "tier1",
      tool: "bash",
      argsSignature: "hash-a",
      repeatCount: 3,
    });
  });

  it("does not classify tier1 when output differs across repeats", () => {
    const history: Entry[] = [
      makeEntry("bash", "hash-a", "out-1"),
      makeEntry("bash", "hash-a", "out-2"),
      makeEntry("bash", "hash-a", "out-3"),
    ];

    const result = classify(history, defaults());

    expect(result.tier).not.toBe("tier1");
  });

  it("classifies changing-output repeats as tier2 when input-only overlap threshold is met", () => {
    const history: Entry[] = [
      makeEntry("bash", "hash-a", "out-1"),
      makeEntry("bash", "hash-a", "out-2"),
      makeEntry("bash", "hash-a", "out-3"),
      makeEntry("bash", "hash-a", "out-4"),
    ];

    const result = classify(history, defaults());

    expect(result).toEqual({
      tier: "tier2",
      tool: "bash",
      argsSignature: "hash-a",
      repeatCount: 4,
    });
  });

  it("does not classify oscillation with distinct args as tier1", () => {
    const history: Entry[] = [
      makeEntry("bash", "hash-a", "out-a"),
      makeEntry("bash", "hash-b", "out-b"),
      makeEntry("bash", "hash-a", "out-a"),
      makeEntry("bash", "hash-b", "out-b"),
      makeEntry("bash", "hash-a", "out-a"),
    ];

    const result = classify(history, defaults());

    expect(result.tier).not.toBe("tier1");
  });

  it("does not classify tier1 when a distinct call breaks consecutiveness", () => {
    const history: Entry[] = [
      makeEntry("bash", "hash-a", "hash-out"),
      makeEntry("bash", "hash-a", "hash-out"),
      makeEntry("bash", "hash-b", "hash-out-b"),
      makeEntry("bash", "hash-a", "hash-out"),
    ];

    const result = classify(history, defaults());

    expect(result.tier).not.toBe("tier1");
  });

  it("respects a configurable tier1Threshold override", () => {
    const history: Entry[] = [
      makeEntry("bash", "hash-a", "hash-out"),
      makeEntry("bash", "hash-a", "hash-out"),
    ];

    const result = classify(history, { ...defaults(), tier1Threshold: 2 });

    expect(result).toEqual({
      tier: "tier1",
      tool: "bash",
      argsSignature: "hash-a",
      repeatCount: 2,
    });
  });

  it("returns none for empty history", () => {
    const result = classify([], defaults());
    expect(result).toEqual({ tier: "none" });
  });

  it("returns none for history shorter than tier1Threshold", () => {
    const history: Entry[] = [
      makeEntry("bash", "hash-a", "hash-out"),
      makeEntry("bash", "hash-a", "hash-out"),
    ];

    const result = classify(history, defaults());

    expect(result).toEqual({ tier: "none" });
  });

  it("does not mutate the input history", () => {
    const history: Entry[] = [
      makeEntry("bash", "hash-a", "hash-out"),
      makeEntry("bash", "hash-a", "hash-out"),
      makeEntry("bash", "hash-a", "hash-out"),
    ];
    const before = history.slice();

    classify(history, defaults());

    expect(history).toEqual(before);
  });

  it("tier1 takes precedence over tier2", () => {
    const history: Entry[] = [
      makeEntry("bash", "hash-a", "hash-out"),
      makeEntry("bash", "hash-a", "hash-out"),
      makeEntry("bash", "hash-a", "hash-out"),
      makeEntry("bash", "hash-a", "hash-out"),
      makeEntry("bash", "hash-a", "hash-out"),
    ];

    const result = classify(history, defaults());

    expect(result.tier).toBe("tier1");
  });
});

describe("resetSignature", () => {
  let tracker: LoopTracker;

  beforeEach(() => {
    tracker = createLoopTracker();
  });

  it("removes only matching entries from the tracker", () => {
    const keep = makeEntry("bash", "hash-keep", "hash-keep-out");
    const drop = makeEntry("bash", "hash-drop", "hash-drop-out");

    tracker.record("s1", keep, 5);
    tracker.record("s1", drop, 5);
    tracker.record("s1", keep, 5);

    resetSignature(tracker, "s1", {
      tier: "tier1",
      tool: drop.tool,
      argsSignature: drop.normalizedArgsHash,
      repeatCount: 1,
    });

    expect(tracker.getHistory("s1")).toEqual([keep, keep]);
  });

  it("no-ops for non-tier1 results", () => {
    const entry = makeEntry("bash", "hash-a", "out");
    tracker.record("s1", entry, 5);

    resetSignature(tracker, "s1", { tier: "none" });
    resetSignature(tracker, "s1", {
      tier: "tier2",
      tool: entry.tool,
      argsSignature: entry.normalizedArgsHash,
      repeatCount: 1,
    });

    expect(tracker.getHistory("s1")).toEqual([entry]);
  });
});
