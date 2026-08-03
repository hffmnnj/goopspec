import { describe, expect, it } from "bun:test";

import { resolveWriteMode } from "./write-mode.js";

describe("resolveWriteMode()", () => {
  // -----------------------------------------------------------------------
  // Valid shapes
  // -----------------------------------------------------------------------

  describe("valid shapes", () => {
    it("resolves a full-document write from content alone", () => {
      const result = resolveWriteMode({ content: "# Spec" });
      expect(result).toEqual({ kind: "full-write", content: "# Spec", mode: "replace" });
    });

    it("resolves an explicit append write", () => {
      const result = resolveWriteMode({ content: "# Spec", mode: "append" });
      expect(result).toEqual({ kind: "full-write", content: "# Spec", mode: "append" });
    });

    it("resolves an empty-string content as a legitimate empty-document write", () => {
      const result = resolveWriteMode({ content: "" });
      expect(result).toEqual({ kind: "full-write", content: "", mode: "replace" });
    });

    it("resolves a patch from old_string + new_string", () => {
      const result = resolveWriteMode({ old_string: "world", new_string: "GoopSpec" });
      expect(result).toEqual({
        kind: "patch",
        old_string: "world",
        new_string: "GoopSpec",
        replace_all: false,
      });
    });

    it("resolves a replace_all patch", () => {
      const result = resolveWriteMode({
        old_string: "foo",
        new_string: "qux",
        replace_all: true,
      });
      expect(result).toEqual({
        kind: "patch",
        old_string: "foo",
        new_string: "qux",
        replace_all: true,
      });
    });

    it("resolves an empty old_string as a patch (blank-document workaround)", () => {
      const result = resolveWriteMode({ old_string: "", new_string: "# Doc" });
      expect(result).toEqual({
        kind: "patch",
        old_string: "",
        new_string: "# Doc",
        replace_all: false,
      });
    });

    it("defaults new_string to '' when old_string is present alone", () => {
      const result = resolveWriteMode({ old_string: "remove me" });
      expect(result).toEqual({
        kind: "patch",
        old_string: "remove me",
        new_string: "",
        replace_all: false,
      });
    });

    it("resolves mode: 'replace' + old_string as a patch (replace is the harmless default)", () => {
      const result = resolveWriteMode({ old_string: "world", new_string: "x", mode: "replace" });
      expect(result.kind).toBe("patch");
    });

    it("resolves a bare items[] call as batch", () => {
      const result = resolveWriteMode({ hasItems: true });
      expect(result).toEqual({ kind: "batch" });
    });

    it("resolves items[] alongside empty-string content as batch (neutral placeholder)", () => {
      const result = resolveWriteMode({ hasItems: true, content: "" });
      expect(result).toEqual({ kind: "batch" });
    });

    it("resolves no fields at all as 'none'", () => {
      const result = resolveWriteMode({});
      expect(result).toEqual({ kind: "none" });
    });
  });

  // -----------------------------------------------------------------------
  // Rule 1: meaningful content and old_string together
  // -----------------------------------------------------------------------

  describe("rule 1: meaningful content + old_string", () => {
    it("rejects non-empty content combined with old_string", () => {
      const result = resolveWriteMode({ content: "# New", old_string: "old" });
      expect(result.kind).toBe("error");
      expect((result as { message: string }).message).toContain(
        "content and old_string cannot be supplied together",
      );
    });

    it("names both valid shapes in the rejection message", () => {
      const result = resolveWriteMode({ content: "# New", old_string: "old" });
      const message = (result as { message: string }).message;
      expect(message).toContain("full write/append");
      expect(message).toContain("patch");
      expect(message).toContain("batch");
    });

    it("does not reject empty-string content combined with old_string (content is not meaningful)", () => {
      const result = resolveWriteMode({ content: "", old_string: "old", new_string: "new" });
      expect(result.kind).toBe("patch");
    });
  });

  // -----------------------------------------------------------------------
  // Rule 2: new_string/replace_all without old_string
  // -----------------------------------------------------------------------

  describe("rule 2: new_string/replace_all without old_string", () => {
    it("rejects new_string without old_string", () => {
      const result = resolveWriteMode({ content: "# Doc", new_string: "x" });
      expect(result.kind).toBe("error");
      expect((result as { message: string }).message).toContain("new_string");
      expect((result as { message: string }).message).toContain("supplied without old_string");
    });

    it("rejects replace_all without old_string", () => {
      const result = resolveWriteMode({ content: "# Doc", replace_all: true });
      expect(result.kind).toBe("error");
      expect((result as { message: string }).message).toContain("replace_all");
    });

    it("rejects replace_all: false without old_string (presence, not truthiness, triggers the rule)", () => {
      const result = resolveWriteMode({ content: "# Doc", replace_all: false });
      expect(result.kind).toBe("error");
    });

    it("names both offending fields when new_string and replace_all are both present", () => {
      const result = resolveWriteMode({ new_string: "x", replace_all: true });
      const message = (result as { message: string }).message;
      expect(message).toContain("new_string");
      expect(message).toContain("replace_all");
    });

    it("rejects new_string alone with no content and no old_string", () => {
      const result = resolveWriteMode({ new_string: "x" });
      expect(result.kind).toBe("error");
    });
  });

  // -----------------------------------------------------------------------
  // Rule 3: mode: "append" combined with patch fields
  // -----------------------------------------------------------------------

  describe('rule 3: mode: "append" combined with patch fields', () => {
    it("rejects mode: append + old_string", () => {
      const result = resolveWriteMode({ old_string: "x", new_string: "y", mode: "append" });
      expect(result.kind).toBe("error");
      expect((result as { message: string }).message).toContain('mode: "append"');
    });

    it("rejects mode: append + old_string even when new_string is absent", () => {
      const result = resolveWriteMode({ old_string: "x", mode: "append" });
      expect(result.kind).toBe("error");
    });

    it("rejects mode: append + old_string='' (blank-document workaround does not bypass the rule)", () => {
      const result = resolveWriteMode({ old_string: "", new_string: "y", mode: "append" });
      expect(result.kind).toBe("error");
    });
  });

  // -----------------------------------------------------------------------
  // Rule 4: items[] combined with top-level operation fields
  // -----------------------------------------------------------------------

  describe("rule 4: items[] combined with top-level operation fields", () => {
    it("rejects non-empty content alongside items[]", () => {
      const result = resolveWriteMode({ hasItems: true, content: "# Real content" });
      expect(result.kind).toBe("error");
      expect((result as { message: string }).message).toContain("content");
      expect((result as { message: string }).message).toContain("items[]");
    });

    it("rejects old_string alongside items[]", () => {
      const result = resolveWriteMode({ hasItems: true, old_string: "x" });
      expect(result.kind).toBe("error");
      expect((result as { message: string }).message).toContain("old_string");
    });

    it("rejects new_string alongside items[]", () => {
      const result = resolveWriteMode({ hasItems: true, new_string: "x" });
      expect(result.kind).toBe("error");
      expect((result as { message: string }).message).toContain("new_string");
    });

    it("rejects replace_all alongside items[]", () => {
      const result = resolveWriteMode({ hasItems: true, replace_all: true });
      expect(result.kind).toBe("error");
      expect((result as { message: string }).message).toContain("replace_all");
    });

    it("rejects mode alongside items[]", () => {
      const result = resolveWriteMode({ hasItems: true, mode: "append" });
      expect(result.kind).toBe("error");
      expect((result as { message: string }).message).toContain("mode");
    });

    it("names every offending field at once when several are present", () => {
      const result = resolveWriteMode({
        hasItems: true,
        content: "# Real",
        old_string: "x",
        mode: "append",
      });
      const message = (result as { message: string }).message;
      expect(message).toContain("content");
      expect(message).toContain("old_string");
      expect(message).toContain("mode");
    });

    it("does not reject empty-string content alongside items[] (neutral placeholder)", () => {
      const result = resolveWriteMode({ hasItems: true, content: "" });
      expect(result.kind).toBe("batch");
    });
  });

  // -----------------------------------------------------------------------
  // Rule precedence — rule 4 wins first when multiple rules are violated
  // -----------------------------------------------------------------------

  describe("rule precedence", () => {
    it("rule 4 fires ahead of rule 1 when both items[] and a content/old_string conflict are present", () => {
      const result = resolveWriteMode({ hasItems: true, content: "# Real", old_string: "x" });
      expect(result.kind).toBe("error");
      expect((result as { message: string }).message).toContain("items[]");
    });
  });
});
