import { describe, expect, it } from "bun:test";

import { patchContent } from "./content-patch.js";

describe("patchContent()", () => {
  it("replaces a single match and reports success", () => {
    const result = patchContent(
      "The quick brown fox jumps over the lazy dog.",
      "brown fox",
      "red panda",
    );

    expect(result.ok).toBe(true);
    expect(result.matchCount).toBe(1);
    expect(result.content).toBe("The quick red panda jumps over the lazy dog.");
    expect(result.error).toBeUndefined();
  });

  it("returns an error when the old string does not appear", () => {
    const result = patchContent(
      "The quick brown fox jumps over the lazy dog.",
      "missing phrase",
      "replacement",
    );

    expect(result.ok).toBe(false);
    expect(result.matchCount).toBe(0);
    expect(result.error).toContain("did not appear verbatim");
    expect(result.content).toBeUndefined();
  });

  it("returns an error on multiple matches when replaceAll is not set", () => {
    const result = patchContent("foo bar foo baz foo qux", "foo", "zoo");

    expect(result.ok).toBe(false);
    expect(result.matchCount).toBe(3);
    expect(result.error).toBe(
      "Old string matched 3 occurrences. Provide a more specific string with more surrounding context, or set replace_all=true to replace all.",
    );
    expect(result.content).toBeUndefined();
  });

  it("replaces all occurrences when replaceAll is true", () => {
    const result = patchContent("foo bar foo baz foo qux", "foo", "zoo", { replaceAll: true });

    expect(result.ok).toBe(true);
    expect(result.matchCount).toBe(3);
    expect(result.content).toBe("zoo bar zoo baz zoo qux");
    expect(result.content).not.toContain("foo");
    expect(result.error).toBeUndefined();
  });

  it("rejects a no-op replacement when old and new strings are identical", () => {
    const withMatch = patchContent(
      "The quick brown fox jumps over the lazy dog.",
      "brown fox",
      "brown fox",
    );

    expect(withMatch.ok).toBe(false);
    expect(withMatch.matchCount).toBe(0);
    expect(withMatch.error).toContain("identical to new string");
    expect(withMatch.content).toBeUndefined();

    const withoutMatch = patchContent(
      "The quick brown fox jumps over the lazy dog.",
      "red panda",
      "red panda",
    );

    expect(withoutMatch.ok).toBe(false);
    expect(withoutMatch.matchCount).toBe(0);
    expect(withoutMatch.error).toContain("identical to new string");
    expect(withoutMatch.content).toBeUndefined();
  });

  it("matches multi-line strings exactly", () => {
    const existing = [
      "function greet() {",
      "  console.log('hello');",
      "  console.log('world');",
      "}",
    ].join("\n");

    const oldString = "  console.log('hello');\n  console.log('world');";
    const newString = "  console.log('hello, world');";

    const result = patchContent(existing, oldString, newString);

    expect(result.ok).toBe(true);
    expect(result.matchCount).toBe(1);
    expect(result.content).toBe(
      ["function greet() {", "  console.log('hello, world');", "}"].join("\n"),
    );
  });
});
