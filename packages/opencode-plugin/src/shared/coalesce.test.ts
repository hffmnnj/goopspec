import { describe, expect, it } from "bun:test";

import { EMPTY_STRING_LOAD_BEARING_FIELDS_BY_TOOL, coalesceEmptyStrings } from "./coalesce.js";

/** Typed wrapper so object-shape assertions aren't fought by the generic `<T>` return. */
function coalesce(input: Record<string, unknown>, toolName?: string): Record<string, unknown> {
  return coalesceEmptyStrings(input, toolName) as Record<string, unknown>;
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
      items: [
        { a: "", b: 1 },
        { a: "x", b: "" },
        { a: "", b: "" },
      ],
    });
    expect(out).toEqual({
      items: [{ b: 1 }, { a: "x" }, {}],
    });
  });

  it("preserves non-string defaults for unknown tools", () => {
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

  it("protects new_string and old_string only for patch-capable tools", () => {
    for (const toolName of ["goop_write_db", "goop_write_section", "goop_save_note"]) {
      expect(
        coalesce(
          { old_string: "", new_string: "", items: [{ old_string: "", new_string: "" }] },
          toolName,
        ),
      ).toEqual({
        old_string: "",
        new_string: "",
        items: [{ old_string: "", new_string: "" }],
      });
    }
    expect(coalesce({ old_string: "", new_string: "" }, "goop_create_pr")).toEqual({});
  });

  it("omits wave metadata empties for goop_write_wave (clears are rejected at tool level)", () => {
    const out = coalesce(
      {
        pr_url: "",
        pr_branch: "",
        title: "",
        items: [{ wave_number: 1, pr_url: "", pr_branch: "", title: "" }],
      },
      "goop_write_wave",
    );
    expect(out).toEqual({ items: [{ wave_number: 1 }] });
    expect(out.pr_url).toBeUndefined();
    expect(out.pr_branch).toBeUndefined();
    expect(out.title).toBeUndefined();
  });

  it("uses protection-off as the safe default for tools sharing a field name", () => {
    const out = coalesce({ status: "", pr_url: "" }, "memory_save");
    expect(out).toEqual({});
    expect(coalesce({ title: "" }, "memory_save")).toEqual({});
    expect(coalesce({ title: "" }, "goop_create_pr")).toEqual({});
  });

  it("coalesces a non-protected sibling alongside a protected field", () => {
    const out = coalesce({ status: "", old_string: "" }, "goop_write_db");
    expect(out).toEqual({ old_string: "" });
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

  it("uses no exemptions when no tool name is supplied", () => {
    expect(coalesce({ title: "", new_string: "" })).toEqual({});
  });
});

describe("EMPTY_STRING_LOAD_BEARING_FIELDS_BY_TOOL", () => {
  it("contains exactly the audited tool-field exclusions", () => {
    expect(
      Object.fromEntries(
        Object.entries(EMPTY_STRING_LOAD_BEARING_FIELDS_BY_TOOL).map(([toolName, fields]) => [
          toolName,
          [...fields].sort(),
        ]),
      ),
    ).toEqual({
      goop_save_note: ["new_string", "old_string"],
      goop_write_db: ["new_string", "old_string"],
      goop_write_section: ["new_string", "old_string"],
    });
    // Wave 2 contract: goop_write_wave metadata empties coalesce to omission at
    // the host boundary; the tool itself rejects intentional clears. The map
    // must not exempt them.
    expect(EMPTY_STRING_LOAD_BEARING_FIELDS_BY_TOOL.goop_write_wave).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Wave 1 Task 1.1 — injected non-string type-default boundary (tests-first)
//
// The host fills optional fields the caller never authored with type defaults
// (`""`, `false`, `[]`, `{}`). These pins capture the semantic-omission
// contract the shared boundary must implement: an injected default on a tool's
// optional surface is treated as absent — but NEVER as a global falsy rule,
// and never for a field where the empty value is a documented authored
// operation (the blank-document patch group pinned above stays protected when
// it is the call's only operation). Wave metadata empties are NOT such an
// operation: per the Wave 2 contract they coalesce to omission at this
// boundary, and intentional clears are rejected at tool level.
//
// The assertions in the first block intentionally FAIL until Task 1.2
// implements the normalization; they are the regression evidence this wave is
// built on. The authored-value pins in the second block must stay green.
// ---------------------------------------------------------------------------

describe("coalesceEmptyStrings — injected non-string type defaults (Wave 1 boundary contract)", () => {
  it("drops an injected false on an optional boolean (replace_all) for a patch-capable tool", () => {
    expect(coalesce({ replace_all: false }, "goop_write_db")).toEqual({});
  });

  it("drops an injected false on allow_status_regression for goop_write_wave", () => {
    expect(coalesce({ allow_status_regression: false }, "goop_write_wave")).toEqual({});
  });

  it("drops an injected empty array on an optional batch field", () => {
    expect(coalesce({ items: [] }, "goop_write_db")).toEqual({});
  });

  it("drops an injected empty object on an optional object field (task_update)", () => {
    expect(coalesce({ task_update: {} }, "goop_write_wave")).toEqual({});
  });

  it("drops an empty patch group when meaningful content is present (full write, not patch)", () => {
    expect(
      coalesce(
        { content: "# hello", old_string: "", new_string: "", replace_all: false },
        "goop_write_db",
      ),
    ).toEqual({ content: "# hello" });
  });

  it("drops an empty patch group when a non-empty items[] batch is present", () => {
    expect(
      coalesce(
        {
          items: [{ doc_type: "spec", content: "# x" }],
          old_string: "",
          new_string: "",
          replace_all: false,
        },
        "goop_write_db",
      ),
    ).toEqual({ items: [{ doc_type: "spec", content: "# x" }] });
  });

  it("drops wave metadata empties when items[] batch evidence selects the mode", () => {
    expect(
      coalesce(
        {
          wave_number: 1,
          items: [{ wave_number: 1, title: "Wave 1" }],
          title: "",
          pr_url: "",
          pr_branch: "",
        },
        "goop_write_wave",
      ),
    ).toEqual({ wave_number: 1, items: [{ wave_number: 1, title: "Wave 1" }] });
  });

  // ---- Authored values are never dropped (no global truthiness) ----

  it("preserves an authored truthy boolean (no global truthiness)", () => {
    expect(coalesce({ replace_all: true }, "goop_write_db")).toEqual({ replace_all: true });
  });

  it("preserves a non-empty items[] batch", () => {
    const items = [{ doc_type: "spec", content: "# x" }];
    expect(coalesce({ items }, "goop_write_db")).toEqual({ items });
  });

  it("preserves a meaningful task_update object", () => {
    const taskUpdate = { task_index: 1, status: "done" };
    expect(coalesce({ task_update: taskUpdate }, "goop_write_wave")).toEqual({
      task_update: taskUpdate,
    });
  });

  it("preserves the documented authored 0 for goop_write_section.position (0 is meaningful, not absent)", () => {
    expect(coalesce({ position: 0 }, "goop_write_section")).toEqual({ position: 0 });
  });

  it("keeps the blank-document patch group protected when it is the only operation (authored empty)", () => {
    expect(coalesce({ old_string: "", new_string: "" }, "goop_write_db")).toEqual({
      old_string: "",
      new_string: "",
    });
  });

  it("omits wave metadata empties even as the only operation (intentional clears rejected at tool level)", () => {
    // Wave 2 contract: title/pr_url/pr_branch empties coalesce to omission at
    // this boundary; the tool rejects intentional clears instead (pinned in
    // goop-write-wave/index.test.ts).
    expect(coalesce({ title: "", pr_url: "", pr_branch: "" }, "goop_write_wave")).toEqual({});
  });
});
