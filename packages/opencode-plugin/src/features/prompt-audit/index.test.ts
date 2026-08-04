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

  it("rolls up the real agents directory with 15 markdown files", () => {
    const r = measureDirectory("agents", packageRoot);
    expect(r.directory).toBe("agents");
    expect(r.files).toBe(15);
    expect(r.perFile.length).toBe(15);
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

  it("agents: 15 files, 82,324 bytes, 137 bold spans", () => {
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
    //
    // Wave 4 Task 4.3 converted six non-invariant judgment-call absolutes in
    // agents/goop-orchestrator.md to conditional phrasing (state-only boot
    // scope, image-generation scope, low-tier usage condition, parallel-
    // research branch condition, hard-stop count): 76,992 -> 76,962 bytes,
    // 62 -> 56 absolute hits, 127 bold spans unchanged. All gate, safety,
    // identity, branch, source-write, acceptance, and state-mutation
    // invariants preserved. The immutable Wave 1 baseline remains in
    // RESEARCH.md.
    //
    // The wave-verifier-gating workflow's Wave 1 role plumbing added
    // agents/goop-wave-verifier.md (a new, wave-scoped-only agent contract)
    // on top of this Wave 4 baseline: 14 files, 76,962 bytes, 127 bold
    // spans -> 15 files, 82,100 bytes, 137 bold spans (+5,138 bytes, +10
    // bold spans, exactly the new file's own measurements). No existing
    // agent file changed. A same-wave follow-up fix aligned the new file's
    // prompt with the shared boot-pointer and delegation-prohibition
    // invariants (added a Mandatory First Steps section and an explicit
    // "Do not" prefix): 82,100 -> 82,324 bytes (+224), bold spans and
    // absolute-language hits unchanged. The immutable Wave 1 baseline
    // (99,822 bytes, 14 files) remains in RESEARCH.md and predates both
    // this addition and the Wave 3/4 consolidation passes.
    //
    // The wave-verifier-gating workflow's Wave 3 Task 2 split the two
    // verifier roles across the delegation surface: agents/goop-orchestrator.md
    // gained goop-wave-verifier in the task()-reachable list plus a
    // stage-bound verification-dispatch paragraph (+514 bytes, +2 abs), and
    // agents/goop-verifier.md now states acceptance-only with a
    // cross-reference to goop-wave-verifier (+273 bytes, +2 abs). Net:
    // 82,324 -> 83,111 bytes, absolute hits 66 -> 70, bold spans unchanged
    // at 137.
    //
    // The wave-verifier-gating workflow's Wave 3 Task 4 (Rule 4 remediation:
    // latest-per-check_name verification gate) documented in
    // agents/goop-wave-verifier.md that re-verifying a check records a new
    // append-only row rather than replacing the old one, and that the wave
    // gate reads each check's latest row. Net: 83,111 -> 83,373 bytes
    // (+262), absolute hits unchanged at 70 (the added sentence uses
    // "persist forever" and "instead of", not a must/never/always/critical/
    // only judgment word), bold spans unchanged at 137.
    //
    // The tool-definition-clarity workflow's Wave 1 made
    // references/tool-reference.md §House Tool-Description Standard the
    // single normative home for tool-description rules. agents/goop-
    // orchestrator.md's standalone friction-reporting instruction was
    // trimmed to a pointer at tool-reference.md §Friction Reporting (the
    // "mandatory" ask itself was retained): 10,374 -> 10,413 bytes (+39),
    // absolute hits unchanged at 15, bold spans unchanged at 137. No other
    // agent file changed. The immutable Wave 1 baseline (99,822 bytes, 14
    // files) remains in RESEARCH.md.
    const agents = report.directories.find((d) => d.directory === "agents")!;
    expect(agents.files).toBe(15);
    expect(agents.bytes).toBe(83_412);
    expect(agents.boldSpans).toBe(137);
  });

  it("commands: 9 files, 25,890 bytes", () => {
    // Wave 4 Task 4.1 reconciled the nine command docs against the
    // runtime-injected phase rules: trimmed anti-pattern/prohibition lists
    // to command-specific material (removing items the injected phase
    // block or phase-gates.md already owns), replaced duplicated nudge
    // gate prose in goop-execute.md with a pointer to phase-gates.md, and
    // resolved the contract-gate/autopilot precedence ambiguity in
    // goop-plan.md. Net effect: 25,547 -> 24,702 bytes; absolute-language
    // hits 34 -> 32; bold spans 68 -> 58. The immutable Wave 1 baseline
    // remains in RESEARCH.md.
    //
    // The wave-verifier-gating workflow's Wave 3 Task 1 inserted the wave
    // verification gate into goop-execute.md (dispatch goop-wave-verifier
    // after the per-wave task loop, bounded remediation cycle, runtime
    // gate reference): 24,702 -> 25,890 bytes (+1,188); absolute hits
    // 32 -> 34 (+2: the gate's "inspect-only" role boundary and the
    // "never implements fixes" verifier invariant — both true role
    // invariants per dispatch-patterns.md).
    //
    // The wave-verifier-gating workflow's Wave 3 Task 2 corrected the agent
    // roster in goop-help.md: 13 -> 14 specialized agents (the canonical
    // 15-role roster minus the orchestrator), added goop-wave-verifier with
    // a stage boundary, and made goop-verifier acceptance-only. Net:
    // 25,890 -> 26,092 bytes (+202), absolute hits 34 -> 38 (+4: the
    // "never implements fixes" role invariant, the "acceptance-only" scope,
    // the "inspect/report-only" boundary, and the "never implements"
    // delegate statement).
    //
    // The wave-verifier-gating workflow's Wave 3 Task 4 (Rule 4 remediation:
    // latest-per-check_name verification gate) corrected goop-execute.md's
    // wave-completion gate description, which pinned the superseded
    // "zero fail rows ever" reading, to the append-only latest-per-check
    // rule the runtime now enforces. Net: 26,092 -> 26,318 bytes (+226),
    // absolute hits 38 -> 39 (+1: "never deleted or edited" — a true
    // data-integrity invariant, not a judgment call).
    const commands = report.directories.find((d) => d.directory === "commands")!;
    expect(commands.files).toBe(9);
    expect(commands.bytes).toBe(26_318);
  });

  it("references: 19 files, 164,672 bytes", () => {
    // Wave 3 Task 3.1 consolidated core-protocol.md, dispatch-patterns.md, and
    // subagent-identity.md (added one Prompt Authoring Rules section, offset
    // by removing duplicated material from the other two files). Net effect:
    // -1 byte vs the Wave 1 baseline of 161,459 — a non-increase, per MH6.
    //
    // Wave 4 Task 4.2 reconciled the five on-demand references against
    // core-protocol.md's Prompt Authoring Rules: trimmed the currentWave
    // overlap between phase-gates.md and task-decomposition.md to a pointer,
    // replaced task-decomposition's restated test command with a pointer to
    // test-authoring.md, removed response-format.md's "Why This Replaces XML"
    // rationale, dropped test-authoring.md's model-conditional citation, and
    // pointed enforcement-system.md's injection/troubleshooting sections at
    // core-protocol.md and phase-gates.md. Net effect: 161,458 -> 160,972
    // bytes (-486), absolute hits 237 -> 236, bold spans 528 -> 526. The
    // immutable Wave 1 baseline (161,459) remains in RESEARCH.md.
    //
    // Wave 4 Task 4.3 converted 34 non-invariant judgment-call absolutes to
    // conditional phrasing and trimmed two cross-layer duplicates across
    // four reference files: core-protocol.md (12 conversions: always/only/
    // must/never judgment calls in boot defaults, batching rules, prompt
    // authoring rules), phase-gates.md (10: only/never judgment calls in
    // autopilot stops, nudge rate-limit, fail-closed blast radius, blocker
    // hygiene), test-authoring.md (8: never/only/always judgment calls in
    // test heuristics, mocking discipline, test-level guidance, execution
    // ladder), dispatch-patterns.md (3: trimmed restated quick-mode self-
    // edit conditions to a pointer to commands/goop-quick.md per precedence
    // command > reference), and pr-creation.md (1: trimmed restated single-
    // branch parallelism rule to a pointer to dispatch-patterns.md). Net
    // effect: 160,972 -> 160,716 bytes (-256), absolute hits 236 -> 202,
    // bold spans 526 -> 526. All gate, safety, identity, branch, source-
    // write, acceptance, and state-mutation invariants preserved. The
    // immutable Wave 1 baseline remains in RESEARCH.md.
    //
    // Wave 4 Task 4.3 follow-up corrected a branch-base contradiction between
    // pr-creation.md and dispatch-patterns.md: the unconditional "never
    // create Wave N+1 from main; always stack it" and "Wave N must be fully
    // merged before Wave N+1 is created" rules contradicted the supported
    // stacked-PR contract and the merged-PR flow. Replaced with a conditional
    // branch-base rule in pr-creation.md §Stacked Branch Rule (stacked PR
    // when preceding wave PR unmerged; branch from updated origin/main when
    // all preceding waves merged) and pointed dispatch-patterns.md at it.
    // Net effect: 160,716 -> 161,350 bytes (+634, still below the 161,459
    // Wave 1 baseline), absolute hits 202 -> 198 (-4), bold spans 526 ->
    // 530. The non-increase bar relative to the Wave 1 baseline holds.
    //
    // The wave-verifier-gating workflow's Wave 3 Task 1 aligned boundary/
    // handoff guidance with the runtime verification gate: wiring-checklist
    // gained a verification-gate checklist item and a handoff rule ("never
    // substitutes for the recorded gate" — one absolute hit), and
    // task-decomposition's update-wave section and anti-pattern now cite the
    // runtime predicate isWaveVerified. Net effect: 161,350 -> 162,326 bytes
    // (+976), absolute hits 198 -> 199 (+1), bold spans 530 -> 532.
    //
    // The wave-verifier-gating workflow's Wave 3 Task 2 made goop-verifier
    // acceptance-only in dispatch-patterns.md: the selection table gained a
    // Wave-verification (execute) row pointing at goop-wave-verifier and
    // dropped goop-verifier as the testing fallback, the model-profile table
    // gained goop-wave-verifier, and the Verification Dispatch section
    // removed the "after high-risk changes" guidance. Net: 162,326 ->
    // 162,648 bytes (+322), absolute hits 199 -> 200 (+1: "acceptance-only"),
    // bold spans unchanged at 532.
    //
    // The wave-verifier-gating workflow's Wave 5 Task 2 documented the wave
    // verification gate as a first-class execute gate: phase-gates.md gained
    // a Wave Verification row in the gate-overview table and a Wave
    // Verification Gate section (tasks complete -> wave-scoped verifier
    // evidence -> bounded remediation -> non-failing effective evidence
    // before completion, with acceptance remaining a distinct final
    // whole-workflow audit), and wiring-checklist.md tightened its
    // verification item to the current/effective per-check row and added an
    // acceptance-visibility item. Net: 162,648 -> 164,672 bytes (+2,024),
    // absolute hits 200 -> 202 (+2: the "never implements fixes" role
    // invariant and the "inspect/report-only" boundary, both true invariants
    // shared with dispatch-patterns.md), bold spans 532 -> 542 (+10).
    //
    // The tool-definition-clarity workflow's Wave 1 established
    // references/tool-reference.md §House Tool-Description Standard as the
    // single normative home for how every tool `description` and argument
    // `.describe()` string is composed (named sections, length bounds,
    // omission language, cross-field prose rules, friction-reporting
    // ownership). tool-reference.md gained the standard itself: 17,699 ->
    // 23,329 bytes (+5,630). dispatch-patterns.md and goop-orchestrator.md
    // (the latter under agents/, above) now point at it rather than
    // restating the rules; dispatch-patterns.md's pointer added 10,523 ->
    // 10,895 bytes (+372). Net references: 164,672 -> 170,674 bytes
    // (+6,002), all attributable to those two files. No other reference
    // file changed. The standard's mandatory-wording rules lift the
    // workflow-wide absolute-language total (see the assertion below). The
    // immutable Wave 1 baseline (161,459) remains in RESEARCH.md.
    //
    // The tool-definition-clarity workflow's Wave 1 verification follow-up
    // clarified the high-friction length bound in tool-reference.md §Length
    // bounds as a ceiling rather than a floor: the allowlist row changed
    // from "701-1200" (which read as obligating a description to exceed 700)
    // to "120-1200", with an explicit statement that allowlisting raises
    // the ceiling from 700 to 1200 and never requires a description to
    // exceed 700. Wording-only; the gate logic in src/tools/index.test.ts
    // and the allowlist membership are unchanged. tool-reference.md:
    // 23,329 -> 23,825 bytes (+496); references rollup 170,674 -> 171,170.
    //
    // The tool-definition-clarity workflow's Wave 3 Task 1 added the
    // empty-string argument coalescing boundary (a behavior change, not a
    // wording change): shared/coalesce.ts treats an exact "" as absent at
    // the single createTools input boundary both V1 and V2 consume, with an
    // explicit exclusion list (new_string/old_string delete+patch activation,
    // pr_url/pr_branch/title clear). tool-reference.md gained a new
    // "Empty-string argument coalescing" subsection under the House Tool-
    // Description Standard documenting the boundary and the exclusion table.
    // 23,825 -> 26,702 bytes (+2,877); references rollup 171,170 -> 174,047.
    const references = report.directories.find((d) => d.directory === "references")!;
    expect(references.files).toBe(19);
    expect(references.bytes).toBe(174_047);
  });

  it("total absolute-language hits are 299 (Wave 1 role plumbing plus the Wave 3 execution gate)", () => {
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
    //
    // Wave 4 Task 4.2 dropped one absolute hit from test-authoring.md's
    // "Why This Exists" (removed the model-conditional citation and the
    // "must not bloat the budget" phrasing), taking references 237 -> 236
    // and the workflow-wide total 331 -> 330. The other four references
    // kept their true-invariant absolutes (gate labels, severity names,
    // config tier names, spec terms) intact.
    //
    // Wave 4 Task 4.3 converted 40 non-invariant judgment-call absolutes
    // to conditional phrasing and trimmed two cross-layer duplicates:
    // agents/goop-orchestrator.md 62 -> 56 (-6), references/core-protocol.md
    // 34 -> 22 (-12), references/phase-gates.md 32 -> 22 (-10), references/
    // test-authoring.md 26 -> 18 (-8), references/dispatch-patterns.md
    // 22 -> 19 (-3, trimmed restated quick-mode conditions to pointer),
    // references/pr-creation.md 19 -> 18 (-1, trimmed restated single-
    // branch rule to pointer). Commands unchanged at 32. Total:
    // 330 -> 290, meeting the <=300 bar. All surviving absolutes are
    // true invariants (gate, safety, identity, branch, source-write,
    // acceptance, state-mutation) or domain terminology (must-have,
    // critical-path, severity names, config keys, V1-only). The immutable
    // Wave 1 baseline (394) remains in RESEARCH.md.
    //
    // Wave 4 Task 4.3 follow-up corrected a branch-base contradiction:
    // pr-creation.md's unconditional "never create Wave N+1 from main;
    // always stack it" and dispatch-patterns.md's "Wave N must be fully
    // merged before Wave N+1 is created" contradicted the stacked-PR
    // contract. Replaced with a conditional branch-base rule (stacked PR
    // when preceding wave PR unmerged; from updated origin/main when all
    // preceding waves merged). Removed 4 more absolute hits: pr-creation.md
    // 18 -> 15 (-3: "Only", "never", "always"), dispatch-patterns.md
    // 19 -> 18 (-1: "must"). Total: 290 -> 286. The immutable Wave 1
    // baseline (394) remains in RESEARCH.md.
    //
    // The wave-verifier-gating workflow's Wave 1 role plumbing adds the
    // new `wave-verifier` role as agents/goop-wave-verifier.md on top of
    // this Wave 4 baseline. That file contributes 10 absolute-language
    // hits of its own (it states explicit MUST/NEVER contract
    // obligations), lifting the total from 286 to 296. The +10 delta is a
    // property of the added role's prompt, not a regression of the Wave 4
    // consolidation work.
    //
    // The wave-verifier-gating workflow's Wave 3 Task 1 added the execute
    // wave verification gate: +2 hits in commands/goop-execute.md
    // (inspect-only role boundary, never-implements-fixes invariant) and
    // +1 in references/wiring-checklist.md (handoff never substitutes for
    // the recorded gate) — all true invariants, lifting the total from 296
    // to 299.
    //
    // The wave-verifier-gating workflow's Wave 3 Task 2 (doc restriction
    // sweep) added the two-verifier stage boundary across the delegation
    // surfaces: +1 in references/dispatch-patterns.md (acceptance-only),
    // +2 in agents/goop-orchestrator.md (never-implements-fixes role
    // invariant, acceptance-only), +2 in agents/goop-verifier.md
    // (acceptance-gate-only scope, acceptance-only), +4 in commands/
    // goop-help.md (never-implements-fixes role invariant, acceptance-only,
    // inspect/report-only boundary, delegate-never statement) — lifting the
    // total from 299 to 308.
    //
    // The wave-verifier-gating workflow's Wave 3 Task 4 (Rule 4
    // remediation: latest-per-check_name verification gate) corrected
    // commands/goop-execute.md's wave-completion gate description to the
    // append-only latest-per-check rule: +1 ("never deleted or edited" — a
    // true data-integrity invariant). agents/goop-wave-verifier.md's
    // matching clarification added zero new hits (its wording reuses the
    // file's existing "only"/"never" vocabulary without a new match) —
    // lifting the total from 308 to 309.
    //
    // The wave-verifier-gating workflow's Wave 5 Task 2 documented the wave
    // verification gate as a first-class execute gate: +2 in references
    // (phase-gates.md's Wave Verification Gate section — the "never
    // implements fixes" role invariant and the "inspect/report-only"
    // boundary, both true invariants shared with dispatch-patterns.md) —
    // lifting the total from 309 to 311.
    //
    // The tool-definition-clarity workflow's Wave 1 added the House
    // Tool-Description Standard as the single normative home for tool-
    // description rules. The +7 delta is the standard's mandatory-wording
    // rules themselves, verified against the audit regex rather than
    // assumed: +6 in references/tool-reference.md (six rule-bearing lines
    // of the new section, each carrying one must/only — argument fields
    // must end with .describe(), .describe() must be the last chain
    // method, descriptions must give the caller enough to avoid the error
    // on the first try, omit-only-for-Y conditional status, the registry
    // is fixed at exactly 38 tools, and the friction-reporting ownership
    // rule), and +1 in references/dispatch-patterns.md (the pointer line's
    // "must be composed"). agents/goop-orchestrator.md's friction-pointer
    // swap added zero — the retained "mandatory" keyword was already
    // present and the new pointer carries no absolute keyword — so its
    // absolute-hit count stays at 15. Total: 311 -> 318.
    //
    // The tool-definition-clarity workflow's Wave 1 verification follow-up
    // clarified the high-friction length bound as a ceiling rather than a
    // floor (see the references.bytes note above). The clarification adds
    // one "never" to tool-reference.md §Length bounds ("allowlisting ...
    // never requires a description to exceed 700"), verified against the
    // audit regex (tool-reference.md 17 -> 18 hits) rather than assumed.
    // Total: 318 -> 319.
    //
    // The tool-definition-clarity workflow's Wave 3 Task 1 added the
    // "Empty-string argument coalescing" subsection to tool-reference.md.
    // The +7 delta is the boundary's own contract language, verified against
    // the audit regex (4x "never", 3x "only") rather than assumed. All are
    // true invariants of the coalescing contract: an empty status is never a
    // legitimate value, a non-empty value is never dropped, and only exact
    // "" is affected. tool-reference.md 18 -> 25 hits; total 319 -> 326.
    expect(report.totalAbsoluteHits).toBe(326);
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
