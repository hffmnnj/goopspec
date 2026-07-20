import { beforeEach, describe, expect, it } from "bun:test";

import { buildEntry } from "./normalize.js";
import { type LoopTracker, createLoopTracker } from "./tracker.js";

function makeEntry(tool: string, args: unknown, output: string) {
  return buildEntry({ tool, args, output });
}

describe("LoopTracker", () => {
  let tracker: LoopTracker;

  beforeEach(() => {
    tracker = createLoopTracker();
  });

  it("records entries and returns history", () => {
    const e1 = makeEntry("bash", { command: "echo a" }, "a");
    tracker.record("s1", e1, 5);
    expect(tracker.getHistory("s1")).toEqual([e1]);
  });

  it("bounds history to windowSize and evicts oldest first", () => {
    const entries = [
      makeEntry("bash", { command: "echo 1" }, "1"),
      makeEntry("bash", { command: "echo 2" }, "2"),
      makeEntry("bash", { command: "echo 3" }, "3"),
    ];
    for (const e of entries) {
      tracker.record("s1", e, 2);
    }
    expect(tracker.getHistory("s1")).toEqual(entries.slice(1));
  });

  it("isolates sessions", () => {
    const e1 = makeEntry("bash", { command: "echo a" }, "a");
    tracker.record("s1", e1, 5);
    expect(tracker.getHistory("s2")).toEqual([]);
    expect(tracker.getHistory("s1")).toEqual([e1]);
  });

  it("clearSignature removes only matching entries", () => {
    const keep = makeEntry("bash", { command: "echo keep" }, "keep");
    const drop = makeEntry("bash", { command: "echo drop" }, "drop");

    tracker.record("s1", keep, 5);
    tracker.record("s1", drop, 5);
    tracker.record("s1", keep, 5);

    tracker.clearSignature("s1", drop.tool, drop.normalizedArgsHash);

    expect(tracker.getHistory("s1")).toEqual([keep, keep]);
  });

  it("clearSignature deletes session when all entries match", () => {
    const drop = makeEntry("bash", { command: "echo drop" }, "drop");
    tracker.record("s1", drop, 5);

    tracker.clearSignature("s1", drop.tool, drop.normalizedArgsHash);

    expect(tracker.getHistory("s1")).toEqual([]);
  });

  it("clearSession removes all entries for that session", () => {
    const e1 = makeEntry("bash", { command: "echo a" }, "a");
    const e2 = makeEntry("bash", { command: "echo b" }, "b");
    tracker.record("s1", e1, 5);
    tracker.record("s1", e2, 5);
    tracker.record("s2", e1, 5);

    tracker.clearSession("s1");

    expect(tracker.getHistory("s1")).toEqual([]);
    expect(tracker.getHistory("s2")).toEqual([e1]);
  });

  it("no-ops when windowSize is 0", () => {
    const e1 = makeEntry("bash", { command: "echo a" }, "a");
    tracker.record("s1", e1, 0);
    expect(tracker.getHistory("s1")).toEqual([]);
  });
});
