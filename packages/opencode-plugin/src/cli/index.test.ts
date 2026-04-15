import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

import { GOOPSPEC_VERSION } from "../core/version.js";
import { isColorEnabled, resetColorEnabled, setColorEnabled } from "./theme.js";
import { parseArgs, showHelp, showVersion, suggestCommand } from "./index.js";

// ANSI escape code prefix
const ESC = "\x1b[";

function hasAnsi(text: string): boolean {
  return text.includes(ESC);
}

describe("CLI argument parsing", () => {
  afterEach(() => {
    resetColorEnabled();
  });

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

  it("parses register command", () => {
    const result = parseArgs(["register", "--name=my-app"]);
    expect(result.command).toBe("register");
    expect(result.flags.name).toBe("my-app");
  });

  it("parses daemon command with subcommand as arg", () => {
    const result = parseArgs(["daemon", "start"]);
    expect(result.command).toBe("daemon");
    expect(result.args).toEqual(["start"]);
  });

  it("--no-color flag sets color disabled", () => {
    // Ensure color starts enabled
    setColorEnabled(true);
    expect(isColorEnabled()).toBe(true);

    parseArgs(["--no-color", "status"]);
    expect(isColorEnabled()).toBe(false);
  });

  it("--no-color flag is stored in flags", () => {
    const result = parseArgs(["--no-color", "status"]);
    expect(result.flags["no-color"]).toBe(true);
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

  it("suggests register for regster", () => {
    expect(suggestCommand("regster")).toBe("register");
  });

  it("suggests daemon for deamon", () => {
    expect(suggestCommand("deamon")).toBe("daemon");
  });

  it("returns null for completely wrong input", () => {
    expect(suggestCommand("xyz")).toBeNull();
  });
});

describe("output helpers", () => {
  const originalLog = console.log;

  afterEach(() => {
    console.log = originalLog;
    resetColorEnabled();
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

    expect(logSpy).toHaveBeenCalledWith(`goopspec v${GOOPSPEC_VERSION}`);
  });
});

describe("showHelp content", () => {
  const originalLog = console.log;
  let captured: string[];

  beforeEach(() => {
    captured = [];
    console.log = (...args: unknown[]) => {
      captured.push(args.map(String).join(" "));
    };
    setColorEnabled(true);
  });

  afterEach(() => {
    console.log = originalLog;
    resetColorEnabled();
  });

  it("contains Usage section", () => {
    showHelp();
    const output = captured.join("\n");
    expect(output).toContain("Usage:");
    expect(output).toContain("goopspec");
  });

  it("contains Commands section", () => {
    showHelp();
    const output = captured.join("\n");
    expect(output).toContain("Commands:");
  });

  it("contains all command names", () => {
    showHelp();
    const output = captured.join("\n");
    expect(output).toContain("init");
    expect(output).toContain("register");
    expect(output).toContain("daemon");
    expect(output).toContain("status");
    expect(output).toContain("models");
    expect(output).toContain("mcp");
    expect(output).toContain("memory");
    expect(output).toContain("verify");
    expect(output).toContain("reset");
  });

  it("contains command descriptions", () => {
    showHelp();
    const output = captured.join("\n");
    expect(output).toContain("Initialize GoopSpec");
    expect(output).toContain("Register this project");
    expect(output).toContain("Manage the GoopSpec daemon");
  });

  it("contains group headers", () => {
    showHelp();
    const output = captured.join("\n");
    expect(output).toContain("Setup");
    expect(output).toContain("Project");
    expect(output).toContain("Daemon");
    expect(output).toContain("Tools");
  });

  it("contains global options including --no-color", () => {
    showHelp();
    const output = captured.join("\n");
    expect(output).toContain("Options:");
    expect(output).toContain("--help");
    expect(output).toContain("--version");
    expect(output).toContain("--no-color");
  });

  it("contains tip about command-specific help", () => {
    showHelp();
    const output = captured.join("\n");
    expect(output).toContain("command-specific help");
  });
});

describe("showHelp with NO_COLOR", () => {
  const originalLog = console.log;
  let captured: string[];

  beforeEach(() => {
    captured = [];
    console.log = (...args: unknown[]) => {
      captured.push(args.map(String).join(" "));
    };
    setColorEnabled(false);
  });

  afterEach(() => {
    console.log = originalLog;
    resetColorEnabled();
  });

  it("produces no ANSI escape codes when color is disabled", () => {
    showHelp();
    const output = captured.join("\n");
    expect(hasAnsi(output)).toBe(false);
    // Still contains the text content
    expect(output).toContain("GoopSpec");
    expect(output).toContain("Commands:");
    expect(output).toContain("init");
  });
});
