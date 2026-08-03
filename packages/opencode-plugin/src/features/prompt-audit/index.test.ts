import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "bun:test";

import {
  auditPromptSurfaces,
  countAbsoluteLanguage,
  countBoldSpans,
  measureFile,
  measureDirectory,
  PROMPT_DIRECTORIES,
} from "./index.js";

// Package root: packages/opencode-plugin (this file is at src/features/prompt-audit/)
const __dirname = dirname(fileURLToPath(import.meta.url));
const packageRoot = join(__dirname, "../../..");

// ---------------------------------------------------------------------------
// countAbsoluteLanguage
// ---------------------------------------------------------------------------

describe("countAbsoluteLanguage", () => {
  it("counts whole-word matches case-insensitively", () => {
    expect(countAbsoluteLanguage("you must do this")).toBe(1);
    expect(countAbsoluteLanguage("MUST")).toBe(1);
    expect(countAbsoluteLanguage("Never always")).toBe(2);
    expect(countAbsoluteLanguage("this is critical and only that")).toBe(2);
  });

  it("excludes substrings via word boundaries", () => {
    expect(countAbsoluteLanguage("mustard")).toBe(0);
    expect(countAbsoluteLanguage("mustn't")).toBe(0);
    expect(countAbsoluteLanguage("alwaysly")).toBe(0);
    expect(countAbsoluteLanguage("onlyjust")).toBe(0);
  });

  it("returns 0 for empty or no-match text", () => {
    expect(countAbsoluteLanguage("")).toBe(0);
    expect(countAbsoluteLanguage("nothing here")).toBe(0);
  });

  it("counts all five terms in mixed text", () => {
    expect(countAbsoluteLanguage("must never always critical only")).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// countBoldSpans
// ---------------------------------------------------------------------------

describe("countBoldSpans", () => {
  it("counts ** occurrences", () => {
    expect(countBoldSpans("**bold**")).toBe(2);
    expect(countBoldSpans("**a** and **b**")).toBe(4);
  });

  it("returns 0 for no bold markers", () => {
    expect(countBoldSpans("no bold here")).toBe(0);
    expect(countBoldSpans("")).toBe(0);
  });

  it("counts non-overlapping ** sequences", () => {
    expect(countBoldSpans("***")).toBe(1);
    expect(countBoldSpans("****")).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// measureFile
// ---------------------------------------------------------------------------

describe("measureFile", () => {
  it("measures chars, bytes, tokens, and language census", () => {
    const content = "You **must** do this — always.";
    const m = measureFile(content, Buffer.byteLength(content, "utf-8"), "test.md");
    expect(m.path).toBe("test.md");
    expect(m.chars).toBe(content.length);
    expect(m.bytes).toBe(Buffer.byteLength(content, "utf-8"));
    expect(m.tokens).toBe(Math.ceil(content.length / 4));
    expect(m.absoluteHits).toBe(2); // must, always
    expect(m.boldSpans).toBe(2);
  });

  it("bytes exceed chars for non-ASCII content", () => {
    const content = "em-dash — and curly “quotes”";
    const m = measureFile(content, Buffer.byteLength(content, "utf-8"), "unicode.md");
    expect(m.bytes).toBeGreaterThan(m.chars);
  });
});

// ---------------------------------------------------------------------------
// measureDirectory
// ---------------------------------------------------------------------------

describe("measureDirectory", () => {
  it("returns empty rollup for a non-existent directory", () => {
    const r = measureDirectory("does-not-exist", packageRoot);
    expect(r.directory).toBe("does-not-exist");
    expect(r.files).toBe(0);
    expect(r.chars).toBe(0);
    expect(r.perFile).toEqual([]);
  });

  it("rolls up the real agents directory with 14 markdown files", () => {
    const r = measureDirectory("agents", packageRoot);
    expect(r.directory).toBe("agents");
    expect(r.files).toBe(14);
    expect(r.perFile.length).toBe(14);
    expect(r.chars).toBe(r.perFile.reduce((s, f) => s + f.chars, 0));
    expect(r.bytes).toBe(r.perFile.reduce((s, f) => s + f.bytes, 0));
    expect(r.boldSpans).toBe(r.perFile.reduce((s, f) => s + f.boldSpans, 0));
  });
});

// ---------------------------------------------------------------------------
// auditPromptSurfaces — real-tree baseline
// ---------------------------------------------------------------------------

describe("auditPromptSurfaces (real tree)", () => {
  const report = auditPromptSurfaces(packageRoot);

  it("audits exactly three directories in priority order", () => {
    expect(report.directories.map((d) => d.directory)).toEqual([...PROMPT_DIRECTORIES]);
  });

  it("agents: 14 files, 99,822 bytes, 275 bold spans", () => {
    const agents = report.directories.find((d) => d.directory === "agents")!;
    expect(agents.files).toBe(14);
    expect(agents.bytes).toBe(99_822);
    expect(agents.boldSpans).toBe(275);
  });

  it("commands: 9 files, 25,547 bytes", () => {
    const commands = report.directories.find((d) => d.directory === "commands")!;
    expect(commands.files).toBe(9);
    expect(commands.bytes).toBe(25_547);
  });

  it("references: 19 files, 161,458 bytes", () => {
    // Wave 3 Task 3.1 consolidated core-protocol.md, dispatch-patterns.md, and
    // subagent-identity.md (added one Prompt Authoring Rules section, offset
    // by removing duplicated material from the other two files). Net effect:
    // -1 byte vs the Wave 1 baseline of 161,459 — a non-increase, per MH6.
    const references = report.directories.find((d) => d.directory === "references")!;
    expect(references.files).toBe(19);
    expect(references.bytes).toBe(161_458);
  });

  it("total absolute-language hits are 396 (post Wave 3 Task 3.1)", () => {
    // SPEC assumption A5: research-phase count (394) and spec count (396)
    // differ by measurement method. The Wave 1 audit re-measures with one
    // documented method (\b(?:must|never|always|critical|only)\b, gi) and
    // that method governed all comparisons through Wave 2, yielding 394.
    // Wave 3 Task 3.1's Prompt Authoring Rules section names the literal
    // keywords MUST/NEVER/ALWAYS/CRITICAL/ONLY as the words to reserve for
    // true invariants, which the whole-word census counts even inside
    // backticks; dispatch-patterns.md's own trims offset most, but not all,
    // of that. Net: 394 -> 396, coincidentally matching the original SPEC
    // baseline figure (a coincidence of method, not a reversion of A5).
    expect(report.totalAbsoluteHits).toBe(396);
  });

  it("per-file tokens are consistent with chars via estimateTokens", () => {
    for (const dir of report.directories) {
      for (const f of dir.perFile) {
        expect(f.tokens).toBe(Math.ceil(f.chars / 4));
      }
      // Directory tokens are the sum of per-file estimates (each ceiled).
      expect(dir.tokens).toBe(dir.perFile.reduce((s, f) => s + f.tokens, 0));
    }
  });
});
