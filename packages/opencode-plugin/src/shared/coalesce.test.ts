import { describe, expect, it } from "bun:test";

import {
  EMPTY_STRING_LOAD_BEARING_KEYS,
  coalesceEmptyStrings,
} from "./coalesce.js";

/** Typed wrapper so object-shape assertions aren't fought by the generic `<T>` return. */
function coalesce(
  input: Record<string, unknown>,
  protectedKeys?: ReadonlySet<string>,
): Record<string, unknown> {
  return coalesceEmptyStrings(input, protectedKeys) as Record<string, unknown>;
}

describe("coalesceEmptyStrings", () => {
  it("omits an exact empty string at the top level", () => {
    const out = coalesce({ wave_number: 3, status: "" });
    expect(out).toEqual({ wave_number: 3 });
    expect(out.status).toBeUndefined();
  });

  it("omits empty strings nested inside arrays of objects (task_updates shape)", () => {
    const out = coalesce({
      wave_number: 3,
      status: "",
      task_updates: [{ task_index: 0, status: "" }],
      verifications: [{ check_name: "test", status: "pass" }],
    });
    expect(out).toEqual({
      wave_number: 3,
      task_updates: [{ task_index: 0 }],
      verifications: [{ check_name: "test", status: "pass" }],
    });
  });

  it("preserves array length and order, recursing into every element", () => {
    const out = coalesce({
      items: [{ a: "", b: 1 }, { a: "x", b: "" }, { a: "", b: "" }],
    });
    expect(out).toEqual({
      items: [{ b: 1 }, { a: "x" }, {}],
    });
  });

  it("does not touch null, undefined, 0, false, [], or {}", () => {
    const out = coalesce({
      n: null,
      u: undefined,
      z: 0,
      f: false,
      emptyArr: [],
      emptyObj: {},
    });
    expect(out).toEqual({
      n: null,
      u: undefined,
      z: 0,
      f: false,
      emptyArr: [],
      emptyObj: {},
    });
  });

  it("preserves whitespace-only strings (may be intentional content)", () => {
    const out = coalesce({ a: " ", b: "\t\n", c: "   x   " });
    expect(out).toEqual({ a: " ", b: "\t\n", c: "   x   " });
  });

  it("preserves non-empty strings unchanged", () => {
    const out = coalesce({ branch: "feat/x", status: "done" });
    expect(out).toEqual({ branch: "feat/x", status: "done" });
  });

  it("protects new_string and old_string everywhere they appear", () => {
    const out = coalesce({
      old_string: "",
      new_string: "",
      items: [{ old_string: "", new_string: "" }],
    });
    expect(out).toEqual({
      old_string: "",
      new_string: "",
      items: [{ old_string: "", new_string: "" }],
    });
  });

  it("protects pr_url, pr_branch, and title everywhere they appear", () => {
    const out = coalesce({
      pr_url: "",
      pr_branch: "",
      title: "",
      items: [{ wave_number: 1, pr_url: "", pr_branch: "", title: "" }],
    });
    expect(out).toEqual({
      pr_url: "",
      pr_branch: "",
      title: "",
      items: [{ wave_number: 1, pr_url: "", pr_branch: "", title: "" }],
    });
  });

  it("coalesces a non-protected sibling alongside a protected field", () => {
    const out = coalesce({ status: "", pr_url: "" });
    expect(out).toEqual({ pr_url: "" });
  });

  it("handles deeply nested structures", () => {
    const out = coalesce({
      level1: { level2: [{ level3: { deep: "", kept: true } }] },
    });
    expect(out).toEqual({
      level1: { level2: [{ level3: { kept: true } }] },
    });
  });

  it("returns primitives and null unchanged", () => {
    expect(coalesceEmptyStrings("hello")).toBe("hello");
    expect(coalesceEmptyStrings(42)).toBe(42);
    expect(coalesceEmptyStrings(null)).toBe(null);
    expect(coalesceEmptyStrings(undefined)).toBe(undefined);
    // An exact empty string at the root is not a keyed field; it is preserved.
    expect(coalesceEmptyStrings("")).toBe("");
  });

  it("accepts a custom protected-keys set", () => {
    const out = coalesce({ status: "", custom: "" }, new Set(["custom"]));
    expect(out).toEqual({ custom: "" });
  });
});

describe("EMPTY_STRING_LOAD_BEARING_KEYS", () => {
  it("contains exactly the audited load-bearing fields", () => {
    expect([...EMPTY_STRING_LOAD_BEARING_KEYS].sort()).toEqual(
      ["new_string", "old_string", "pr_branch", "pr_url", "title"].sort(),
    );
  });
});
