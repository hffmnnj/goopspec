import { afterEach, describe, expect, it } from "bun:test";
import { detectTerminalType, isInsideTmux } from "./terminal.js";

const originalTerm = process.env.GOOPSPEC_TERM;
const originalTmux = process.env.TMUX;

function clearEnv(): void {
  delete process.env.GOOPSPEC_TERM;
  delete process.env.TMUX;
}

describe("worktree terminal detection", () => {
  afterEach(() => {
    if (originalTerm === undefined) {
      delete process.env.GOOPSPEC_TERM;
    } else {
      process.env.GOOPSPEC_TERM = originalTerm;
    }

    if (originalTmux === undefined) {
      delete process.env.TMUX;
    } else {
      process.env.TMUX = originalTmux;
    }
  });

  it("honors GOOPSPEC_TERM=tmux override", () => {
    clearEnv();
    process.env.GOOPSPEC_TERM = "tmux";
    expect(detectTerminalType()).toBe("tmux");
  });

  it("honors GOOPSPEC_TERM=macos override", () => {
    clearEnv();
    process.env.GOOPSPEC_TERM = "macos";
    expect(detectTerminalType()).toBe("macos");
  });

  it("returns platform-based terminal type without overrides", () => {
    clearEnv();
    const detected = detectTerminalType();

    switch (process.platform) {
      case "darwin":
        expect(detected).toBe("macos");
        break;
      case "win32":
        expect(detected).toBe("windows");
        break;
      default:
        expect(["linux-desktop", "windows"]).toContain(detected);
        break;
    }
  });

  it("returns tmux when TMUX env is set", () => {
    clearEnv();
    process.env.TMUX = "/tmp/tmux-1000/default,12345,0";
    expect(detectTerminalType()).toBe("tmux");
  });
});

describe("isInsideTmux", () => {
  afterEach(() => {
    if (originalTmux === undefined) {
      delete process.env.TMUX;
    } else {
      process.env.TMUX = originalTmux;
    }
  });

  it("returns true when TMUX is set", () => {
    process.env.TMUX = "/tmp/tmux-1000/default,12345,0";
    expect(isInsideTmux()).toBe(true);
  });

  it("returns false when TMUX is not set", () => {
    delete process.env.TMUX;
    expect(isInsideTmux()).toBe(false);
  });
});
