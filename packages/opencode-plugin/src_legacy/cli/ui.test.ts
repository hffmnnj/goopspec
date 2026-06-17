import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

import { GOOPSPEC_VERSION } from "../core/version.js";
import { resetColorEnabled, setColorEnabled } from "./theme.js";
import {
  BOX,
  TAGLINES,
  box,
  divider,
  formatTable,
  header,
  randomTagline,
  renderBanner,
  showBanner,
  showError,
  showInfo,
  showSuccess,
  showWarning,
  supportsUnicode,
} from "./ui.js";

const ESC = "\x1b[";

function hasAnsi(text: string): boolean {
  return text.includes(ESC);
}

describe("ui", () => {
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
  // supportsUnicode
  // -----------------------------------------------------------------------

  describe("supportsUnicode", () => {
    it("returns a boolean", () => {
      expect(typeof supportsUnicode()).toBe("boolean");
    });

    it("returns true on non-win32 platforms", () => {
      // On Linux/macOS CI this will be true
      if (process.platform !== "win32") {
        expect(supportsUnicode()).toBe(true);
      }
    });
  });

  // -----------------------------------------------------------------------
  // BOX characters
  // -----------------------------------------------------------------------

  describe("BOX", () => {
    it("provides box-drawing characters", () => {
      expect(typeof BOX.topLeft).toBe("string");
      expect(typeof BOX.topRight).toBe("string");
      expect(typeof BOX.bottomLeft).toBe("string");
      expect(typeof BOX.bottomRight).toBe("string");
      expect(typeof BOX.horizontal).toBe("string");
      expect(typeof BOX.vertical).toBe("string");
      expect(typeof BOX.dividerChar).toBe("string");
      expect(typeof BOX.corner).toBe("string");
      expect(typeof BOX.star).toBe("string");
    });

    it("returns Unicode chars on supporting terminals", () => {
      if (supportsUnicode()) {
        expect(BOX.topLeft).toBe("╔");
        expect(BOX.horizontal).toBe("═");
        expect(BOX.star).toBe("✦");
      }
    });
  });

  // -----------------------------------------------------------------------
  // divider
  // -----------------------------------------------------------------------

  describe("divider", () => {
    it("returns a string of default length", () => {
      const result = divider();
      expect(typeof result).toBe("string");
      expect(result.length).toBe(40);
    });

    it("returns a string of specified length", () => {
      const result = divider(20);
      expect(result.length).toBe(20);
    });

    it("uses custom character", () => {
      const result = divider(10, "=");
      expect(result).toBe("==========");
    });

    it("uses box divider char by default", () => {
      const result = divider(5);
      const expected = supportsUnicode() ? "─────" : "-----";
      expect(result).toBe(expected);
    });
  });

  // -----------------------------------------------------------------------
  // header
  // -----------------------------------------------------------------------

  describe("header", () => {
    it("returns a string containing the title", () => {
      setColorEnabled(false);
      const result = header("My Section");
      expect(result).toContain("My Section");
    });

    it("includes emoji when provided", () => {
      setColorEnabled(false);
      const result = header("Settings", "⚙️");
      expect(result).toContain("⚙️");
      expect(result).toContain("Settings");
    });
  });

  // -----------------------------------------------------------------------
  // box
  // -----------------------------------------------------------------------

  describe("box", () => {
    it("creates a boxed output with title and content", () => {
      const result = box("Title", ["line one", "line two"]);
      expect(result).toContain("Title");
      expect(result).toContain("line one");
      expect(result).toContain("line two");
    });

    it("uses Unicode box chars on supporting terminals", () => {
      if (supportsUnicode()) {
        const result = box("Test", ["hello"]);
        expect(result).toContain("╔");
        expect(result).toContain("╗");
        expect(result).toContain("╚");
        expect(result).toContain("╝");
        expect(result).toContain("║");
      }
    });

    it("produces multi-line output", () => {
      const result = box("Info", ["a", "b", "c"]);
      const lines = result.split("\n");
      // top border + 3 content lines + bottom border = 5
      expect(lines.length).toBe(5);
    });

    it("respects explicit width", () => {
      const result = box("W", ["x"], 30);
      const lines = result.split("\n");
      // All lines should be 30 chars wide (approximately, accounting for box chars)
      for (const line of lines) {
        expect(line.length).toBeGreaterThanOrEqual(28);
      }
    });

    it("handles empty content", () => {
      const result = box("Empty", []);
      expect(result).toContain("Empty");
      const lines = result.split("\n");
      // top border + bottom border = 2
      expect(lines.length).toBe(2);
    });
  });

  // -----------------------------------------------------------------------
  // Banner
  // -----------------------------------------------------------------------

  describe("showBanner", () => {
    it("produces output containing GoopSpec", () => {
      setColorEnabled(false);
      const banner = renderBanner();
      expect(banner).toContain("GoopSpec");
    });

    it("includes version", () => {
      setColorEnabled(false);
      const banner = renderBanner();
      expect(banner).toContain(`v${GOOPSPEC_VERSION}`);
    });

    it("includes spec-driven development subtitle", () => {
      setColorEnabled(false);
      const banner = renderBanner();
      expect(banner).toContain("spec-driven development");
    });

    it("is compact (10 lines or fewer)", () => {
      setColorEnabled(false);
      const banner = renderBanner();
      const lines = banner.split("\n");
      expect(lines.length).toBeLessThanOrEqual(10);
    });

    it("with NO_COLOR=1 produces no ANSI codes", () => {
      process.env["NO_COLOR"] = "1";
      resetColorEnabled();
      const banner = renderBanner();
      expect(hasAnsi(banner)).toBe(false);
    });

    it("with color enabled produces ANSI codes", () => {
      setColorEnabled(true);
      const banner = renderBanner();
      expect(hasAnsi(banner)).toBe(true);
    });

    it("calls console.log when using showBanner()", () => {
      const logSpy = mock(() => undefined);
      const originalLog = console.log;
      console.log = logSpy;

      try {
        showBanner();
        expect(logSpy).toHaveBeenCalled();
      } finally {
        console.log = originalLog;
      }
    });
  });

  // -----------------------------------------------------------------------
  // Taglines
  // -----------------------------------------------------------------------

  describe("taglines", () => {
    it("TAGLINES array has entries", () => {
      expect(TAGLINES.length).toBeGreaterThan(0);
    });

    it("randomTagline returns a string from TAGLINES", () => {
      const tagline = randomTagline();
      expect(TAGLINES).toContain(tagline);
    });
  });

  // -----------------------------------------------------------------------
  // Status output helpers
  // -----------------------------------------------------------------------

  describe("showError", () => {
    it("outputs error message", () => {
      const calls: unknown[][] = [];
      const logSpy = (...args: unknown[]) => { calls.push(args); };
      const originalLog = console.log;
      console.log = logSpy;

      try {
        setColorEnabled(false);
        showError("something broke");
        const output = String(calls[0]?.[0] ?? "");
        expect(output).toContain("Error");
        expect(output).toContain("something broke");
      } finally {
        console.log = originalLog;
      }
    });

    it("outputs suggestion when provided", () => {
      const calls: unknown[][] = [];
      const logSpy = (...args: unknown[]) => { calls.push(args); };
      const originalLog = console.log;
      console.log = logSpy;

      try {
        setColorEnabled(false);
        showError("failed", "try again");
        expect(calls.length).toBe(2);
        const suggestion = String(calls[1]?.[0] ?? "");
        expect(suggestion).toContain("try again");
      } finally {
        console.log = originalLog;
      }
    });
  });

  describe("showSuccess", () => {
    it("outputs success message", () => {
      const calls: unknown[][] = [];
      const logSpy = (...args: unknown[]) => { calls.push(args); };
      const originalLog = console.log;
      console.log = logSpy;

      try {
        setColorEnabled(false);
        showSuccess("it worked");
        const output = String(calls[0]?.[0] ?? "");
        expect(output).toContain("it worked");
      } finally {
        console.log = originalLog;
      }
    });
  });

  describe("showWarning", () => {
    it("outputs warning message", () => {
      const calls: unknown[][] = [];
      const logSpy = (...args: unknown[]) => { calls.push(args); };
      const originalLog = console.log;
      console.log = logSpy;

      try {
        setColorEnabled(false);
        showWarning("be careful");
        const output = String(calls[0]?.[0] ?? "");
        expect(output).toContain("be careful");
      } finally {
        console.log = originalLog;
      }
    });
  });

  describe("showInfo", () => {
    it("outputs info message", () => {
      const calls: unknown[][] = [];
      const logSpy = (...args: unknown[]) => { calls.push(args); };
      const originalLog = console.log;
      console.log = logSpy;

      try {
        setColorEnabled(false);
        showInfo("fyi");
        const output = String(calls[0]?.[0] ?? "");
        expect(output).toContain("fyi");
      } finally {
        console.log = originalLog;
      }
    });
  });

  // -----------------------------------------------------------------------
  // formatTable (existing)
  // -----------------------------------------------------------------------

  describe("formatTable", () => {
    it("formats a table with headers and rows", () => {
      const result = formatTable(["Name", "Value"], [["foo", "bar"]]);
      expect(result).toContain("Name");
      expect(result).toContain("Value");
      expect(result).toContain("foo");
      expect(result).toContain("bar");
    });

    it("pads columns to equal width", () => {
      const result = formatTable(["A", "B"], [["long value", "x"]]);
      const lines = result.split("\n");
      // All data rows should have the same length
      expect(lines[1]?.length).toBe(lines[2]?.length);
    });
  });
});
