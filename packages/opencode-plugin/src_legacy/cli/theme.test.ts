import { afterEach, beforeEach, describe, expect, it } from "bun:test";

import {
  bold,
  code,
  dim,
  error,
  highlight,
  info,
  isColorEnabled,
  italic,
  label,
  primary,
  resetColorEnabled,
  setColorEnabled,
  success,
  tag,
  warning,
} from "./theme.js";

// ANSI escape code prefix
const ESC = "\x1b[";

function hasAnsi(text: string): boolean {
  return text.includes(ESC);
}

describe("theme", () => {
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
  // isColorEnabled
  // -----------------------------------------------------------------------

  describe("isColorEnabled", () => {
    it("returns false when NO_COLOR=1", () => {
      process.env["NO_COLOR"] = "1";
      expect(isColorEnabled()).toBe(false);
    });

    it("returns false when NO_COLOR is any non-empty string", () => {
      process.env["NO_COLOR"] = "true";
      expect(isColorEnabled()).toBe(false);
    });

    it("returns true when FORCE_COLOR=1", () => {
      process.env["FORCE_COLOR"] = "1";
      expect(isColorEnabled()).toBe(true);
    });

    it("FORCE_COLOR overrides NO_COLOR", () => {
      process.env["NO_COLOR"] = "1";
      process.env["FORCE_COLOR"] = "1";
      expect(isColorEnabled()).toBe(true);
    });

    it("FORCE_COLOR=0 does not force color on", () => {
      process.env["FORCE_COLOR"] = "0";
      process.env["NO_COLOR"] = "1";
      expect(isColorEnabled()).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // setColorEnabled / resetColorEnabled
  // -----------------------------------------------------------------------

  describe("setColorEnabled", () => {
    it("setColorEnabled(false) disables color", () => {
      setColorEnabled(false);
      expect(isColorEnabled()).toBe(false);
    });

    it("setColorEnabled(true) enables color", () => {
      setColorEnabled(true);
      expect(isColorEnabled()).toBe(true);
    });

    it("setColorEnabled overrides env vars", () => {
      process.env["NO_COLOR"] = "1";
      setColorEnabled(true);
      expect(isColorEnabled()).toBe(true);
    });

    it("resetColorEnabled re-reads env vars", () => {
      setColorEnabled(true);
      process.env["NO_COLOR"] = "1";
      // Still true because override is active
      expect(isColorEnabled()).toBe(true);
      // After reset, env var takes effect
      resetColorEnabled();
      expect(isColorEnabled()).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // Color disabled — all functions return plain text
  // -----------------------------------------------------------------------

  describe("with color disabled", () => {
    beforeEach(() => {
      setColorEnabled(false);
    });

    it("primary returns plain text", () => {
      const result = primary("hello");
      expect(result).toBe("hello");
      expect(hasAnsi(result)).toBe(false);
    });

    it("info returns plain text", () => {
      const result = info("hello");
      expect(result).toBe("hello");
      expect(hasAnsi(result)).toBe(false);
    });

    it("success returns plain text", () => {
      const result = success("hello");
      expect(result).toBe("hello");
      expect(hasAnsi(result)).toBe(false);
    });

    it("error returns plain text", () => {
      const result = error("hello");
      expect(result).toBe("hello");
      expect(hasAnsi(result)).toBe(false);
    });

    it("warning returns plain text", () => {
      const result = warning("hello");
      expect(result).toBe("hello");
      expect(hasAnsi(result)).toBe(false);
    });

    it("dim returns plain text", () => {
      const result = dim("hello");
      expect(result).toBe("hello");
      expect(hasAnsi(result)).toBe(false);
    });

    it("bold returns plain text", () => {
      const result = bold("hello");
      expect(result).toBe("hello");
      expect(hasAnsi(result)).toBe(false);
    });

    it("italic returns plain text", () => {
      const result = italic("hello");
      expect(result).toBe("hello");
      expect(hasAnsi(result)).toBe(false);
    });

    it("code returns plain text", () => {
      const result = code("hello");
      expect(result).toBe("hello");
      expect(hasAnsi(result)).toBe(false);
    });

    it("highlight returns plain text", () => {
      const result = highlight("hello");
      expect(result).toBe("hello");
      expect(hasAnsi(result)).toBe(false);
    });

    it("label returns plain brackets", () => {
      const result = label("info");
      expect(result).toBe("[info]");
      expect(hasAnsi(result)).toBe(false);
    });

    it("tag returns plain text", () => {
      const result = tag("OK");
      expect(result).toBe("OK");
      expect(hasAnsi(result)).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // Color enabled — functions return ANSI-colored strings
  // -----------------------------------------------------------------------

  describe("with color enabled", () => {
    beforeEach(() => {
      setColorEnabled(true);
    });

    it("primary returns ANSI-colored string", () => {
      const result = primary("hello");
      expect(hasAnsi(result)).toBe(true);
      expect(result).toContain("hello");
    });

    it("info returns ANSI-colored string", () => {
      const result = info("hello");
      expect(hasAnsi(result)).toBe(true);
      expect(result).toContain("hello");
    });

    it("success returns ANSI-colored string", () => {
      const result = success("hello");
      expect(hasAnsi(result)).toBe(true);
      expect(result).toContain("hello");
    });

    it("error returns ANSI-colored string", () => {
      const result = error("hello");
      expect(hasAnsi(result)).toBe(true);
      expect(result).toContain("hello");
    });

    it("warning returns ANSI-colored string", () => {
      const result = warning("hello");
      expect(hasAnsi(result)).toBe(true);
      expect(result).toContain("hello");
    });

    it("dim returns ANSI-colored string", () => {
      const result = dim("hello");
      expect(hasAnsi(result)).toBe(true);
      expect(result).toContain("hello");
    });

    it("bold returns ANSI-colored string", () => {
      const result = bold("hello");
      expect(hasAnsi(result)).toBe(true);
      expect(result).toContain("hello");
    });

    it("italic returns ANSI-colored string", () => {
      const result = italic("hello");
      expect(hasAnsi(result)).toBe(true);
      expect(result).toContain("hello");
    });

    it("code returns ANSI-colored string", () => {
      const result = code("hello");
      expect(hasAnsi(result)).toBe(true);
      expect(result).toContain("hello");
    });

    it("highlight returns ANSI-colored string", () => {
      const result = highlight("hello");
      expect(hasAnsi(result)).toBe(true);
      expect(result).toContain("hello");
    });

    it("label returns ANSI-colored brackets", () => {
      const result = label("info");
      expect(hasAnsi(result)).toBe(true);
      expect(result).toContain("info");
    });

    it("tag returns ANSI-colored string", () => {
      const result = tag("OK");
      expect(hasAnsi(result)).toBe(true);
      expect(result).toContain("OK");
    });
  });

  // -----------------------------------------------------------------------
  // Semantic role → correct ANSI color family
  // -----------------------------------------------------------------------

  describe("semantic color mapping", () => {
    beforeEach(() => {
      setColorEnabled(true);
    });

    // ANSI color codes:
    // magenta = 35, cyan = 36, green = 32, red = 31, yellow = 33
    // dim = 2, bold = 1, italic = 3

    it("primary uses magenta (ANSI 35)", () => {
      expect(primary("x")).toContain(`${ESC}35m`);
    });

    it("info uses cyan (ANSI 36)", () => {
      expect(info("x")).toContain(`${ESC}36m`);
    });

    it("success uses green (ANSI 32)", () => {
      expect(success("x")).toContain(`${ESC}32m`);
    });

    it("error uses red (ANSI 31)", () => {
      expect(error("x")).toContain(`${ESC}31m`);
    });

    it("warning uses yellow (ANSI 33)", () => {
      expect(warning("x")).toContain(`${ESC}33m`);
    });

    it("dim uses dim (ANSI 2)", () => {
      expect(dim("x")).toContain(`${ESC}2m`);
    });

    it("bold uses bold (ANSI 1)", () => {
      expect(bold("x")).toContain(`${ESC}1m`);
    });

    it("italic uses italic (ANSI 3)", () => {
      expect(italic("x")).toContain(`${ESC}3m`);
    });

    it("code uses cyan + dim", () => {
      const result = code("x");
      expect(result).toContain(`${ESC}36m`); // cyan
      expect(result).toContain(`${ESC}2m`); // dim
    });

    it("highlight uses magenta + bold", () => {
      const result = highlight("x");
      expect(result).toContain(`${ESC}35m`); // magenta
      expect(result).toContain(`${ESC}1m`); // bold
    });

    it("tag uses magenta + bold", () => {
      const result = tag("x");
      expect(result).toContain(`${ESC}35m`); // magenta
      expect(result).toContain(`${ESC}1m`); // bold
    });
  });

  // -----------------------------------------------------------------------
  // NO_COLOR env var integration
  // -----------------------------------------------------------------------

  describe("NO_COLOR env var", () => {
    it("NO_COLOR=1 makes all functions return plain text", () => {
      process.env["NO_COLOR"] = "1";
      resetColorEnabled();

      expect(hasAnsi(primary("x"))).toBe(false);
      expect(hasAnsi(info("x"))).toBe(false);
      expect(hasAnsi(success("x"))).toBe(false);
      expect(hasAnsi(error("x"))).toBe(false);
      expect(hasAnsi(warning("x"))).toBe(false);
      expect(hasAnsi(dim("x"))).toBe(false);
      expect(hasAnsi(bold("x"))).toBe(false);
      expect(hasAnsi(italic("x"))).toBe(false);
      expect(hasAnsi(code("x"))).toBe(false);
      expect(hasAnsi(highlight("x"))).toBe(false);
      expect(hasAnsi(label("x"))).toBe(false);
      expect(hasAnsi(tag("x"))).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // Dynamic toggling
  // -----------------------------------------------------------------------

  describe("dynamic toggling", () => {
    it("toggling color on/off changes output immediately", () => {
      setColorEnabled(true);
      expect(hasAnsi(primary("x"))).toBe(true);

      setColorEnabled(false);
      expect(hasAnsi(primary("x"))).toBe(false);

      setColorEnabled(true);
      expect(hasAnsi(primary("x"))).toBe(true);
    });
  });
});
