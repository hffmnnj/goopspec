import { afterEach, beforeEach, describe, expect, it } from "bun:test";

import {
  bulletList,
  commandExample,
  keyValue,
  sectionBox,
  statusLine,
  stepProgress,
  themedTable,
} from "./components.js";
import { resetColorEnabled, setColorEnabled } from "./theme.js";

const ESC = "\x1b[";

function hasAnsi(text: string): boolean {
  return text.includes(ESC);
}

describe("components", () => {
  let origNoColor: string | undefined;
  let origForceColor: string | undefined;

  beforeEach(() => {
    origNoColor = process.env["NO_COLOR"];
    origForceColor = process.env["FORCE_COLOR"];
    delete process.env["NO_COLOR"];
    delete process.env["FORCE_COLOR"];
    resetColorEnabled();
  });

  afterEach(() => {
    if (origNoColor !== undefined) {
      process.env["NO_COLOR"] = origNoColor;
    } else {
      delete process.env["NO_COLOR"];
    }
    if (origForceColor !== undefined) {
      process.env["FORCE_COLOR"] = origForceColor;
    } else {
      delete process.env["FORCE_COLOR"];
    }
    resetColorEnabled();
  });

  // -----------------------------------------------------------------------
  // themedTable
  // -----------------------------------------------------------------------

  describe("themedTable", () => {
    it("produces tabular output with headers and rows", () => {
      const result = themedTable(
        ["Name", "Status"],
        [
          ["alpha", "ok"],
          ["beta", "fail"],
        ],
      );
      expect(result).toContain("Name");
      expect(result).toContain("Status");
      expect(result).toContain("alpha");
      expect(result).toContain("beta");
      expect(result).toContain("|");
      expect(result).toContain("+");
    });

    it("with NO_COLOR produces clean text without ANSI codes", () => {
      setColorEnabled(false);
      const result = themedTable(
        ["Name", "Value"],
        [["key", "val"]],
      );
      expect(hasAnsi(result)).toBe(false);
      expect(result).toContain("Name");
      expect(result).toContain("Value");
      expect(result).toContain("key");
      expect(result).toContain("val");
    });

    it("with color enabled applies ANSI to headers", () => {
      setColorEnabled(true);
      const result = themedTable(
        ["Name", "Value"],
        [["key", "val"]],
      );
      // The header row should contain ANSI codes (bold by default)
      const headerLine = result.split("\n")[1];
      expect(hasAnsi(headerLine!)).toBe(true);
    });

    it("handles empty rows", () => {
      const result = themedTable(["Col1", "Col2"], []);
      expect(result).toContain("Col1");
      expect(result).toContain("Col2");
      // Should have top divider, header, header divider, bottom divider
      const lines = result.split("\n");
      expect(lines.length).toBe(4);
    });

    it("accepts custom headerColor option", () => {
      setColorEnabled(true);
      const customColor = (s: string) => `<<${s}>>`;
      const result = themedTable(
        ["Name"],
        [["val"]],
        { headerColor: customColor },
      );
      expect(result).toContain("<<Name>>");
    });
  });

  // -----------------------------------------------------------------------
  // statusLine
  // -----------------------------------------------------------------------

  describe("statusLine", () => {
    it("with 'ok' shows ✓ prefix", () => {
      setColorEnabled(false);
      const result = statusLine("Build", "passed", "ok");
      expect(result).toMatch(/[✓+]/);
      expect(result).toContain("Build");
      expect(result).toContain("passed");
    });

    it("with 'error' shows ✗ prefix", () => {
      setColorEnabled(false);
      const result = statusLine("Build", "failed", "error");
      expect(result).toMatch(/[✗x]/);
      expect(result).toContain("Build");
      expect(result).toContain("failed");
    });

    it("with 'warning' shows ⚠ prefix", () => {
      setColorEnabled(false);
      const result = statusLine("Lint", "3 warnings", "warning");
      expect(result).toMatch(/[⚠!]/);
      expect(result).toContain("Lint");
      expect(result).toContain("3 warnings");
    });

    it("with 'info' shows ℹ prefix", () => {
      setColorEnabled(false);
      const result = statusLine("Version", "1.0.0", "info");
      expect(result).toMatch(/[ℹi]/);
      expect(result).toContain("Version");
      expect(result).toContain("1.0.0");
    });

    it("with 'pending' shows ○ prefix", () => {
      setColorEnabled(false);
      const result = statusLine("Deploy", "waiting", "pending");
      expect(result).toMatch(/[○o]/);
      expect(result).toContain("Deploy");
      expect(result).toContain("waiting");
    });

    it("defaults to 'info' status when not specified", () => {
      setColorEnabled(false);
      const result = statusLine("Key", "value");
      expect(result).toMatch(/[ℹi]/);
    });

    it("applies color when enabled", () => {
      setColorEnabled(true);
      const result = statusLine("Build", "passed", "ok");
      expect(hasAnsi(result)).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // sectionBox
  // -----------------------------------------------------------------------

  describe("sectionBox", () => {
    it("renders a box with title and content", () => {
      const result = sectionBox("Status", ["Line 1", "Line 2"]);
      expect(result).toContain("Status");
      expect(result).toContain("Line 1");
      expect(result).toContain("Line 2");
      // Should have top, 2 content lines, bottom = 4 lines
      const lines = result.split("\n");
      expect(lines.length).toBe(4);
    });

    it("uses box-drawing characters", () => {
      setColorEnabled(false);
      const result = sectionBox("Title", ["content"]);
      // Should contain either Unicode or ASCII box chars
      const hasBoxChars =
        result.includes("╭") || result.includes("+");
      expect(hasBoxChars).toBe(true);
    });

    it("handles empty content", () => {
      const result = sectionBox("Empty", []);
      expect(result).toContain("Empty");
      const lines = result.split("\n");
      // Top + bottom = 2 lines
      expect(lines.length).toBe(2);
    });
  });

  // -----------------------------------------------------------------------
  // keyValue
  // -----------------------------------------------------------------------

  describe("keyValue", () => {
    it("renders key and value with colon separator", () => {
      setColorEnabled(false);
      const result = keyValue("Name", "GoopSpec");
      expect(result).toContain("Name:");
      expect(result).toContain("GoopSpec");
    });

    it("uses default indent of 2 spaces", () => {
      setColorEnabled(false);
      const result = keyValue("Key", "val");
      expect(result.startsWith("  ")).toBe(true);
    });

    it("respects custom indent", () => {
      setColorEnabled(false);
      const result = keyValue("Key", "val", 4);
      expect(result.startsWith("    ")).toBe(true);
    });

    it("applies dim styling to key when color enabled", () => {
      setColorEnabled(true);
      const result = keyValue("Key", "val");
      expect(hasAnsi(result)).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // bulletList
  // -----------------------------------------------------------------------

  describe("bulletList", () => {
    it("produces listed items with bullet prefix", () => {
      setColorEnabled(false);
      const result = bulletList(["Item 1", "Item 2", "Item 3"]);
      expect(result).toContain("Item 1");
      expect(result).toContain("Item 2");
      expect(result).toContain("Item 3");
      const lines = result.split("\n");
      expect(lines.length).toBe(3);
    });

    it("uses bullet character prefix", () => {
      setColorEnabled(false);
      const result = bulletList(["Test"]);
      // Should contain either • or - (ASCII fallback)
      expect(result).toMatch(/[•\-]/);
    });

    it("accepts custom bullet character", () => {
      setColorEnabled(false);
      const result = bulletList(["Test"], "→");
      // On Unicode terminals it uses the custom bullet, on ASCII it falls back to -
      expect(result).toMatch(/[→\-]/);
    });

    it("handles empty list", () => {
      const result = bulletList([]);
      expect(result).toBe("");
    });
  });

  // -----------------------------------------------------------------------
  // commandExample
  // -----------------------------------------------------------------------

  describe("commandExample", () => {
    it("shows $ prefix before command", () => {
      setColorEnabled(false);
      const result = commandExample("goopspec register");
      expect(result).toContain("$");
      expect(result).toContain("goopspec register");
    });

    it("includes description when provided", () => {
      setColorEnabled(false);
      const result = commandExample("goopspec register", "Register project");
      expect(result).toContain("goopspec register");
      expect(result).toContain("Register project");
    });

    it("applies color when enabled", () => {
      setColorEnabled(true);
      const result = commandExample("goopspec status");
      expect(hasAnsi(result)).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // stepProgress
  // -----------------------------------------------------------------------

  describe("stepProgress", () => {
    it("shows [N/M] prefix with description", () => {
      setColorEnabled(false);
      const result = stepProgress(1, 3, "Installing dependencies");
      expect(result).toContain("[1/3]");
      expect(result).toContain("Installing dependencies");
    });

    it("handles boundary values", () => {
      setColorEnabled(false);
      const result = stepProgress(3, 3, "Done");
      expect(result).toContain("[3/3]");
      expect(result).toContain("Done");
    });

    it("applies dim styling to counter when color enabled", () => {
      setColorEnabled(true);
      const result = stepProgress(2, 5, "Building");
      expect(hasAnsi(result)).toBe(true);
      expect(result).toContain("Building");
    });
  });
});
