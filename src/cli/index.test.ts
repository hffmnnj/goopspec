import { afterEach, describe, expect, it, mock } from "bun:test";

import { parseArgs, showHelp, showVersion, suggestCommand } from "./index.js";

describe("CLI argument parsing", () => {
  it("parses command without flags", () => {
    const result = parseArgs(["status"]);
    expect(result.command).toBe("status");
    expect(result.flags).toEqual({});
    expect(result.args).toEqual([]);
  });

  it("parses command with boolean flag", () => {
    const result = parseArgs(["init", "--quick"]);
    expect(result.command).toBe("init");
    expect(result.flags.quick).toBe(true);
  });

  it("parses command with value flag", () => {
    const result = parseArgs(["init", "--name=test"]);
    expect(result.command).toBe("init");
    expect(result.flags.name).toBe("test");
  });

  it("returns null for unknown command", () => {
    const result = parseArgs(["unknown"]);
    expect(result.command).toBeNull();
  });

  it("handles help flag without command", () => {
    const result = parseArgs(["--help"]);
    expect(result.command).toBeNull();
    expect(result.flags.help).toBe(true);
  });

  it("handles version flag", () => {
    const result = parseArgs(["--version"]);
    expect(result.command).toBeNull();
    expect(result.flags.version).toBe(true);
  });
});

describe("command suggestion", () => {
  it("suggests status for stat", () => {
    expect(suggestCommand("stat")).toBe("status");
  });

  it("suggests init for int", () => {
    expect(suggestCommand("int")).toBe("init");
  });

  it("suggests verify for veify", () => {
    expect(suggestCommand("veify")).toBe("verify");
  });

  it("returns null for completely wrong input", () => {
    expect(suggestCommand("xyz")).toBeNull();
  });
});

describe("output helpers", () => {
  const originalLog = console.log;

  afterEach(() => {
    console.log = originalLog;
    mock.restore();
  });

  it("prints help text", () => {
    const logSpy = mock(() => undefined);
    console.log = logSpy;

    showHelp();

    expect(logSpy).toHaveBeenCalled();
  });

  it("prints version text", () => {
    const logSpy = mock(() => undefined);
    console.log = logSpy;

    showVersion();

    expect(logSpy).toHaveBeenCalledWith("goopspec v0.2.1");
  });
});
