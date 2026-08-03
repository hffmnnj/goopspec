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

  it("agents: 14 files, 76,992 bytes, 127 bold spans", () => {
    // Wave 3 Task 3.2 consolidated agents/goop-orchestrator.md (the largest
    // single prompt) around the Task 3.1 pointer targets in core-protocol.md,
    // dispatch-patterns.md, and phase-gates.md: 17,207 -> 9,807 bytes
    // (-43.0%), 60 -> 26 bold spans, all Wave 2 semantic invariants intact.
    // A verifier-found follow-up removed one remaining runtime-duplicated
    // prohibition (the "Never write code" bullet paraphrased the execute
    // phase's MUST-NOT-DO rule from phase-context.ts) in favor of a bare
    // pointer to dispatch-patterns.md's Prohibited Orchestrator Actions
    // table, landing at 9,890 bytes for this one file.
    //
    // Wave 3 Task 3.3 deduplicated the remaining 13 non-orchestrator agent
    // prompts following the Task 3.2 pattern: one-line boot pointer to
    // core-protocol.md §Agent Boot Sequence replacing repeated boot prose,
    // normalized identity anchor, duplicated tier/delegation tables replaced
    // by pointers to dispatch-patterns.md, standalone Memory-First sections
    // removed (boot pointer covers memory-first semantically), Long-Running
    // Commands trimmed, decorative examples/closers removed, bold spans and
    // absolute language trimmed toward the spec targets. All role-specific
    // responsibilities, scope, methods, deliverables, stop/block conditions,
    // tool permissions, and safety boundaries preserved. All Wave 2 semantic
    // invariants remain green.
    //
    // Net effect on this category across all three Wave 3 passes:
    // 99,822 -> 76,992 bytes, a decrease per MH6's agents-category-must-
    // decrease bar. Bold spans: 275 -> 127 (well under the 200 bar).
    // The immutable Wave 1 baseline (99,822 bytes) remains in RESEARCH.md.
    const agents = report.directories.find((d) => d.directory === "agents")!;
    expect(agents.files).toBe(14);
    expect(agents.bytes).toBe(76_992);
    expect(agents.boldSpans).toBe(127);
  });

  it("commands: 9 files, 24,702 bytes", () => {
    // Wave 4 Task 4.1 reconciled the nine command docs against the
    // runtime-injected phase rules: trimmed anti-pattern/prohibition lists
    // to command-specific material (removing items the injected phase
    // block or phase-gates.md already owns), replaced duplicated nudge
    // gate prose in goop-execute.md with a pointer to phase-gates.md, and
    // resolved the contract-gate/autopilot precedence ambiguity in
    // goop-plan.md. Net effect: 25,547 -> 24,702 bytes; absolute-language
    // hits 34 -> 32; bold spans 68 -> 58. The immutable Wave 1 baseline
    // remains in RESEARCH.md.
    const commands = report.directories.find((d) => d.directory === "commands")!;
    expect(commands.files).toBe(9);
    expect(commands.bytes).toBe(24_702);
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

  it("total absolute-language hits are 331 (post Wave 4 Task 4.1)", () => {
    // SPEC assumption A5: research-phase count (394) and spec count (396)
    // differ by measurement method. The Wave 1 audit re-measures with one
    // documented method (\b(?:must|never|always|critical|only)\b, gi) and
    // that method governed all comparisons through Wave 2, yielding 394.
    // Wave 3 Task 3.1's Prompt Authoring Rules section named the literal
    // keywords MUST/NEVER/ALWAYS/CRITICAL/ONLY, raising the total to 396.
    // Wave 3 Task 3.2 consolidated agents/goop-orchestrator.md — removing
    // duplicated MUST NOT DO / hard-stop prose in favor of pointers to
    // phase-gates.md and core-protocol.md dropped its own hits 26 -> 20,
    // taking the workflow-wide total to 390. A verifier-found follow-up
    // removed the remaining "Never write code" bullet, dropping to 389.
    //
    // Wave 3 Task 3.3 deduplicated the 13 non-orchestrator agent prompts:
    // trimming duplicated boot prose, decorative closers with ALWAYS,
    // and repeated emphasis dropped agents' absolute-language hits from
    // 118 to 62 (-56), taking the workflow-wide total to 333. The <=300
    // bar is a workflow-wide target; Wave 4 (commands/references) will
    // trim the remaining hits. Wave 4 Task 4.1 reconciled the command
    // docs: removing two abs hits (one "must-have" in goop-plan.md, one
    // "Only" header in goop-execute.md replaced by a pointer) took
    // commands 34 -> 32 and the workflow-wide total 333 -> 331. References
    // trimming is a separate task. The immutable Wave 1 baseline (394)
    // remains in RESEARCH.md.
    expect(report.totalAbsoluteHits).toBe(331);
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
