import { describe, expect, it } from "bun:test";

import { buildEntry, canonicalArgsHash, normalizeShellCommand, outputHash } from "./normalize.js";

describe("normalizeShellCommand", () => {
  it("collapses whitespace", () => {
    expect(normalizeShellCommand("git   log   --oneline")).toBe("git log --oneline");
  });

  it("replaces ISO-8601 dates with placeholder", () => {
    expect(normalizeShellCommand('git log --since="2026-07-15"')).toContain("<DATE>");
    expect(normalizeShellCommand("git log --since='2026-07-15'")).toContain("<DATE>");
    expect(normalizeShellCommand("git log --since=2026-07-15")).toContain("<DATE>");
  });

  it("replaces /tmp/opencode-* paths", () => {
    expect(normalizeShellCommand("cat /tmp/opencode-abc123/file.txt")).toContain("<TMPPATH>");
  });

  it("replaces head/tail counters", () => {
    expect(normalizeShellCommand("git log | head -10")).toBe("git log | head -<N>");
    expect(normalizeShellCommand("tail -5 file.txt")).toBe("tail -<N> file.txt");
  });

  it("strips trailing 2>&1 and || true", () => {
    expect(normalizeShellCommand("echo ok 2>&1")).toBe("echo ok");
    expect(normalizeShellCommand("false || true")).toBe("false");
  });

  it("replaces long --flag values with placeholder", () => {
    const long = 'git log --message="this is a very long argument that exceeds the threshold"';
    expect(normalizeShellCommand(long)).toContain("<LONGVAL>");
  });
});

describe("canonicalArgsHash", () => {
  it("collapses date-only git log differences to same hash", () => {
    const a = canonicalArgsHash("bash", {
      command: 'git log --oneline --all --since="2026-07-15" -- path 2>&1 | head -10',
    });
    const b = canonicalArgsHash("bash", {
      command: 'git log --oneline --all --since="2026-07-18" -- path 2>&1 | head -10',
    });
    expect(a).toBe(b);
  });

  it("produces different hashes for genuinely different commands", () => {
    const a = canonicalArgsHash("bash", { command: "git log --oneline -- path" });
    const b = canonicalArgsHash("bash", { command: "git status --short" });
    expect(a).not.toBe(b);
  });

  it("uses args.command when command is missing", () => {
    const a = canonicalArgsHash("bash", { args: "echo hello" });
    const b = canonicalArgsHash("bash", { command: "echo hello" });
    expect(a).toBe(b);
  });

  it("sorts object keys for stable hashing on non-bash tools", () => {
    const a = canonicalArgsHash("goop_status", { a: 1, b: 2 });
    const b = canonicalArgsHash("goop_status", { b: 2, a: 1 });
    expect(a).toBe(b);
  });

  it("hashes identical large args identically", () => {
    const args = { prompt: `early context ${"x".repeat(200_000)}` };
    expect(canonicalArgsHash("task", args)).toBe(canonicalArgsHash("task", args));
  });

  it("distinguishes large args that differ within the bounded prefix", () => {
    const a = { prompt: `first ${"x".repeat(200_000)}` };
    const b = { prompt: `second ${"x".repeat(200_000)}` };
    expect(canonicalArgsHash("task", a)).not.toBe(canonicalArgsHash("task", b));
  });

  it("bounds large-args hashing work", () => {
    const args = { prompt: "x".repeat(200_000), files: Array.from({ length: 2_000 }, (_, i) => i) };
    const start = performance.now();
    for (let i = 0; i < 1_000; i += 1) {
      canonicalArgsHash("task", args);
    }
    expect(performance.now() - start).toBeLessThan(1_000);
  });

  it("does not throw for circular args", () => {
    const args: { self?: unknown } = {};
    args.self = args;
    expect(() => canonicalArgsHash("task", args)).not.toThrow();
  });
});

describe("normalizeOutput / outputHash", () => {
  it("identical strings produce identical hashes", () => {
    expect(outputHash("hello")).toBe(outputHash("hello"));
  });

  it("different strings produce different hashes", () => {
    expect(outputHash("hello")).not.toBe(outputHash("world"));
  });

  it("trims and truncates consistently", () => {
    const long = "a".repeat(500);
    const short = "a".repeat(200);
    expect(outputHash(long)).toBe(outputHash(short));
  });

  it("strips absolute paths", () => {
    expect(outputHash("error in /home/user/file.ts")).toBe(outputHash("error in"));
  });

  it("strips :line:col references", () => {
    expect(outputHash("error at line 10:20")).toBe(outputHash("error at line 10"));
  });

  it("normalizes whitespace differences", () => {
    expect(outputHash("hello\n\nworld")).toBe(outputHash("hello world"));
  });
});

describe("buildEntry", () => {
  it("produces stable entries", () => {
    const entry = buildEntry({ tool: "bash", args: { command: "echo hi" }, output: "hi" });
    expect(entry.tool).toBe("bash");
    expect(entry.normalizedArgsHash).toMatch(/^[a-f0-9]{64}$/);
    expect(entry.outputHash).toMatch(/^[a-f0-9]{64}$/);
    expect(entry.timestamp).toBeTypeOf("number");
  });
});
