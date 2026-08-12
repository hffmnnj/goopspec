import { afterEach, beforeEach, describe, expect, it } from "bun:test";

import { convertToolArgsToJsonSchema } from "../core/tools-v2.js";
import type { V2JsonSchema } from "../core/v2-compat.js";
import type { PluginContext, ToolContext } from "../test-utils.js";
import {
  createMockPluginContext,
  createMockToolContext,
  setupTestEnvironment,
} from "../test-utils.js";
import { createGoopAppendChronicleTool } from "./goop-append-chronicle/index.js";
import { createGoopSaveNoteTool } from "./goop-save-note/index.js";
import { createGoopWriteDbTool } from "./goop-write-db/index.js";
import { createGoopWriteSectionTool } from "./goop-write-section/index.js";
import { createTools } from "./index.js";

const EXPECTED_TOOL_KEYS = [
  "goop_status",
  "goop_state",
  "goop_spec",
  "goop_adl",
  "goop_checkpoint",
  "goop_compact",
  "goop_setup",
  "goop_get_global_config",
  "goop_reference",
  "goop_read_db",
  "goop_write_db",
  "goop_save_note",
  "goop_search_notes",
  "goop_acceptance_audit",
  "goop_append_chronicle",
  "goop_boot",
  "goop_create_pr",
  "goop_write_section",
  "goop_read_section",
  "goop_write_wave",
  "goop_read_wave",
  "goop_query_decisions",
  "goop_blocker",
  "goop_search_docs",
  "goop_timeline",
  "goop_dashboard",
  "goop_infer_intent",
  "memory_save",
  "memory_search",
  "memory_forget",
  "slashcommand",
  "ast_grep",
  "difftastic",
  "scip",
  "generate_image",
  "background_command",
  "background_status",
  "background_cancel",
] as const;

// ---------------------------------------------------------------------------
// House Tool-Description Standard — the conformance gate
//
// This block mechanizes the normative standard defined in
// `packages/opencode-plugin/references/tool-reference.md` §House
// Tool-Description Standard. Waves 2-5 of workflow `tool-definition-clarity`
// enrich tool descriptions; THIS gate decides whether they did it correctly.
//
// The gate is designed so a later wave can delete a name from
// PENDING_CONFORMANCE and immediately get a meaningful pass/fail with no
// other edits. The predicate functions are module-scoped and shared between
// the live gate and the bad-fixture proofs, so the fixtures prove the real
// logic rather than a parallel copy of it.
// ---------------------------------------------------------------------------

/**
 * High-friction allowlist.
 *
 * The single source of truth named by `tool-reference.md`. A tool's
 * registered MCP name appears here ONLY to exempt it from the 700-char
 * upper bound: allowlisted tools are held to a 1200-char ceiling, every
 * other tool to 700. A tool qualifies when it has multiple mutually
 * exclusive modes, conditional arguments, action-dependent required fields,
 * or complex cross-field contracts that cannot fit in 700 characters while
 * meeting every mandatory section. Keep this list small — it is paid for in
 * prompt tokens on every tool call.
 *
 * Empty today because no tool is conformant yet. A wave that brings a tool
 * into conformance above 700 characters MUST add its name here in the same
 * change; otherwise the length predicate fails it for exceeding the normal
 * ceiling.
 */
const HIGH_FRICTION_TOOLS: readonly string[] = [
  "goop_write_wave",
  "goop_state",
  "goop_blocker",
  // Wave 3 Task 2: multi-mode write tools whose rejection contracts cannot
  // fit under 700 without dropping a rule a caller needs to avoid an error.
  "goop_write_db",
  "goop_write_section",
  "goop_append_chronicle",
  // Wave 3 Task 3: goop_save_note is structurally identical to goop_write_db
  // — create / patch (by note_id) / batch modes with cross-field rejection
  // (create fields rejected alongside note_id; patch fields rejected without
  // it) plus a mandatory atomicity-history caveat. Parity with the existing
  // allowlist, not a loosened bar; the description lands at 766 chars.
  "goop_save_note",
  // Wave 4 Task 1: memory_forget is destructive and irreversible, with two
  // mutually exclusive modes (id vs query) gated by different rules: id
  // deletes immediately and ignores confirm; query needs confirm:true to
  // commit. The mandatory content includes the confirm-gates-query-only
  // rule, the preview-vs-commit workflow, AND the footgun that the preview
  // caps at 20 rows while confirmed deletion searches up to 100 — a caller
  // cannot use this safely first-try without all three, and together they
  // cannot fit under 700. Description lands at 1074 chars.
  "memory_forget",
  // Wave 4 Task 2: action-dispatch tools whose action-to-argument legality
  // matrix cannot fit under 700 without dropping a rule a caller needs.
  // goop_setup: 8 actions, each reading a different subset of 9 args, plus
  // a cross-action gitignoreGoopspec side effect and a scope arg that is
  // silently ignored — caller cannot first-try know which fields apply.
  // goop_infer_intent: autoApply vs autoRun are separate mechanisms with
  // different gates (hard floor 0.85, threshold default 0.9, autoRun floor
  // 0.75), and a below-threshold result is never an error — the precise
  // confidence contract is load-bearing for safe use.
  "goop_setup",
  "goop_infer_intent",
  // Wave 5 Task 1: utility tools that shell out to external binaries.
  // ast_grep: three mutually exclusive modes (search / rewrite dry-run /
  // rewrite apply) plus a conditional argument — apply:true without rewrite
  // is a documented no-op (the -U flag is only appended inside the rewrite
  // branch). The mode contract and the apply-without-rewrite rule together
  // cannot fit under 700 without dropping a rule a caller needs to avoid an
  // accidental mutation, or to achieve one on purpose.
  // scip: action-dependent required fields — symbol is required for
  // definitions/references/implementations and ignored by index, and each
  // action resolves a different binary (scip vs scip-typescript). The
  // action-to-argument and action-to-binary matrix is mandatory content.
  "ast_grep",
  "scip",
  // Wave 5 Task 1: difftastic has two modes (full diff / checkOnly) plus an
  // alias-pair cross-field contract (old/oldPath and new/newPath — all four
  // schema-optional, two runtime-required). The load-bearing content that
  // pushes it past 700 is the missing-binary distinction the workflow
  // dispatch flags as mandatory: a missing difft binary returns an
  // install-hint string that a caller MUST be able to distinguish from a real
  // "no differences" result. Dropping that sentence to fit 700 would violate
  // the dispatch; every other sentence is also load-bearing. Description
  // lands at 787 chars — no padding, each section earns its place.
  "difftastic",
  // Wave 5 Task 2: generate_image has the largest argument surface in the
  // registry (17 args) plus a non-trivial cross-field contract: transparent
  // background is png-only (rendered on green screen, keyed locally via
  // chromakey), non-.png out and jpeg/webp outputFormat with transparent are
  // rejected at validation, default output path and count-suffix behavior,
  // and two dead arguments (mask, outputCompression) that must be documented
  // as ignored. This cannot fit under 700 without dropping contract a caller
  // needs to avoid a wasted credit spend or a validation rejection.
  // Description lands at 1136 chars.
  "generate_image",
  // Wave 5 Task 2: goop_create_pr has a terminology gate that scans title,
  // body, AND branch with different masking rules (code spans masked in
  // title/body, never in branch), two severity levels with different
  // behavior (error blocks, warn proceeds), and the reword-not-retry
  // contract. The mandatory gate contract cannot fit under 700 without
  // dropping a rule a caller needs to avoid repeated rejections.
  // Description lands at 904 chars.
  "goop_create_pr",
];

/**
 * Tools that do NOT yet meet the house standard and so skip the content
 * assertions below.
 *
 * SEED DERIVATION: this list was produced empirically by running every
 * predicate in this file against the current tree and recording exactly the
 * tools that failed at least one check. It is NOT a guess and is NOT padded.
 * On commit, every one of the 38 registered tools failed: none carry the
 * mandatory `WHEN TO USE:` / `WHEN NOT TO USE:` / `RETURNS:` section labels,
 * and most additionally lack argument `.describe()` metadata or fall under
 * the 120-character floor.
 *
 * Each later wave (2-5) removes its own entries as it brings tools into full
 * conformance — sections, length, recursive argument descriptions, AND
 * phrasing all at once. This list MUST be empty by Wave 6. A non-empty entry
 * is a tracked TODO, never a permanent exemption. An over-broad list silently
 * disables the gate, which is the worst outcome here, so the safety-net test
 * below rejects typos and duplicates in this list.
 *
 * Wave 5 Task 2 brought the final two tools (generate_image, goop_create_pr)
 * into conformance. This list is now EMPTY: every tool in the registry is
 * subject to every predicate.
 */
const PENDING_CONFORMANCE: readonly string[] = [];

// ---- Predicates (pure; shared with the bad-fixture proofs) ---------------

/**
 * Section labels that are unconditionally mandatory for every tool
 * description, per `tool-reference.md`.
 *
 * `MODES:` and `CAVEATS:` are intentionally NOT in this list because their
 * applicability is enforced by the explicit per-tool inventory below. The `Purpose` section has
 * no label (it is the opening sentence), so it is proxied by the
 * 120-character length floor rather than a label match. These scope
 * decisions are deliberate and documented; do not "strengthen" the gate by
 * adding conditional sections unconditionally — that would force every
 * single-mode tool to carry a spurious MODES block, violating the standard.
 */
const MANDATORY_SECTION_LABELS = ["WHEN TO USE:", "WHEN NOT TO USE:", "RETURNS:"] as const;

type ConditionalSectionRequirements = Readonly<{
  modes: boolean;
  caveats: boolean;
}>;

/**
 * Implementation-based conditional-section inventory. Every registered tool
 * must be classified here: new tools never inherit an exemption by default.
 *
 * `modes` is true for tools with action dispatch, distinct single/batch or
 * selected/all read forms, mutually exclusive payloads, or an opt-in path
 * that changes execution. `caveats` is true where the implementation has
 * side effects, defaults, precedence, atomicity, or other non-obvious rules.
 */
const CONDITIONAL_SECTION_REQUIREMENTS: Readonly<
  Record<(typeof EXPECTED_TOOL_KEYS)[number], ConditionalSectionRequirements>
> = {
  goop_status: { modes: false, caveats: true },
  goop_state: { modes: true, caveats: true },
  goop_spec: { modes: true, caveats: true },
  goop_adl: { modes: true, caveats: true },
  goop_checkpoint: { modes: true, caveats: true },
  goop_compact: { modes: false, caveats: true },
  goop_setup: { modes: true, caveats: true },
  goop_get_global_config: { modes: false, caveats: true },
  goop_reference: { modes: true, caveats: true },
  goop_read_db: { modes: true, caveats: true },
  goop_write_db: { modes: true, caveats: true },
  goop_save_note: { modes: true, caveats: true },
  goop_search_notes: { modes: true, caveats: true },
  goop_acceptance_audit: { modes: false, caveats: true },
  goop_append_chronicle: { modes: true, caveats: true },
  goop_boot: { modes: false, caveats: true },
  goop_create_pr: { modes: true, caveats: true },
  goop_write_section: { modes: true, caveats: true },
  goop_read_section: { modes: true, caveats: true },
  goop_write_wave: { modes: true, caveats: true },
  goop_read_wave: { modes: true, caveats: true },
  goop_query_decisions: { modes: false, caveats: true },
  goop_blocker: { modes: true, caveats: true },
  goop_search_docs: { modes: false, caveats: true },
  goop_timeline: { modes: false, caveats: true },
  goop_dashboard: { modes: false, caveats: true },
  goop_infer_intent: { modes: true, caveats: true },
  memory_save: { modes: true, caveats: true },
  memory_search: { modes: true, caveats: true },
  memory_forget: { modes: true, caveats: true },
  slashcommand: { modes: false, caveats: true },
  ast_grep: { modes: true, caveats: true },
  difftastic: { modes: true, caveats: true },
  scip: { modes: true, caveats: true },
  generate_image: { modes: true, caveats: true },
  background_command: { modes: false, caveats: true },
  background_status: { modes: true, caveats: true },
  background_cancel: { modes: false, caveats: true },
};

/** Returns the mandatory section labels absent from a tool description. */
function missingMandatorySections(description: string): string[] {
  return MANDATORY_SECTION_LABELS.filter((label) => !description.includes(label));
}

/** Returns applicable conditional section labels absent from a description. */
function missingConditionalSections(
  description: string,
  requirements: ConditionalSectionRequirements,
): string[] {
  const missing: string[] = [];
  if (requirements.modes && !description.includes("MODES:")) missing.push("MODES:");
  if (requirements.caveats && !description.includes("CAVEATS:")) missing.push("CAVEATS:");
  return missing;
}

interface DescriptionLengthViolation {
  actual: number;
  min: number;
  max: number;
  reason: "under" | "over";
}

/**
 * Returns a length violation for a description, or `null` when within bounds.
 *
 * Every tool is held to a 120-character floor. Allowlisted tools
 * (`HIGH_FRICTION_TOOLS`) get a 1200-char ceiling; all others get 700. The
 * allowlist grants headroom above 700 — it does not require a description to
 * exceed 700, so an allowlisted tool with a concise 400-char description
 * still passes.
 */
function descriptionLengthViolation(
  description: string,
  allowlisted: boolean,
): DescriptionLengthViolation | null {
  const len = description.length;
  const min = 120;
  const max = allowlisted ? 1200 : 700;
  if (len < min) return { actual: len, min, max, reason: "under" };
  if (len > max) return { actual: len, min, max, reason: "over" };
  return null;
}

/**
 * Walks a converted JSON Schema and returns the dotted path of every field
 * — including nested object properties and array item element fields — whose
 * `description` is missing or blank.
 *
 * Operates on the same `convertToolArgsToJsonSchema()` output that V2 hosts
 * receive, so "described" means "host-visible", not just "present in Zod".
 */
function collectUndescribedArgs(schema: V2JsonSchema, path = ""): string[] {
  const missing: string[] = [];
  const properties = schema.properties as Record<string, V2JsonSchema | undefined> | undefined;
  if (properties) {
    for (const [name, sub] of Object.entries(properties)) {
      if (!sub) continue;
      const fieldPath = path ? `${path}.${name}` : name;
      const desc = sub.description;
      if (typeof desc !== "string" || desc.trim().length === 0) {
        missing.push(fieldPath);
      }
      missing.push(...collectUndescribedArgs(sub, fieldPath));
    }
  }
  const items = schema.items as V2JsonSchema | undefined;
  if (items) {
    missing.push(...collectUndescribedArgs(items, `${path}[]`));
  }
  return missing;
}

/**
 * True when a field description endorses supplying an empty string to achieve
 * skip/preserve/clear semantics — the exact misuse the standard forbids.
 *
 * Corrective phrasing (`do not pass an empty string`, `including empty
 * strings`) is recognized as an anchor and does NOT trigger a violation: it
 * is the prescribed way to acknowledge empty strings while still directing
 * the caller to omit.
 */
function endorsesEmptyString(description: string): boolean {
  if (/do not pass (an )?empty[ -]?string/i.test(description)) return false;
  if (/including empty strings/i.test(description)) return false;
  if (/\bpass (an |a )?empty[ -]?string\b/i.test(description)) return true;
  if (/empty[ -]?string to (skip|clear|reset|preserve|omit|ignore|default)/i.test(description)) {
    return true;
  }
  return false;
}

/** Returns the dotted paths of fields whose description endorses an empty string. */
function collectEmptyStringEndorsements(schema: V2JsonSchema, path = ""): string[] {
  const violations: string[] = [];
  const properties = schema.properties as Record<string, V2JsonSchema | undefined> | undefined;
  if (properties) {
    for (const [name, sub] of Object.entries(properties)) {
      if (!sub) continue;
      const fieldPath = path ? `${path}.${name}` : name;
      const desc = sub.description;
      if (typeof desc === "string" && endorsesEmptyString(desc)) {
        violations.push(fieldPath);
      }
      violations.push(...collectEmptyStringEndorsements(sub, fieldPath));
    }
  }
  const items = schema.items as V2JsonSchema | undefined;
  if (items) {
    violations.push(...collectEmptyStringEndorsements(items, `${path}[]`));
  }
  return violations;
}

describe("createTools registry", () => {
  let ctx: PluginContext;
  let cleanup: () => void;

  beforeEach(() => {
    const env = setupTestEnvironment("tool-registry");
    cleanup = env.cleanup;
    ctx = createMockPluginContext({ testDir: env.testDir });
  });

  afterEach(() => cleanup());

  it("returns exactly 38 tools", () => {
    const tools = createTools(ctx);
    expect(Object.keys(tools)).toHaveLength(38);
  });

  it("registers all canonical MCP tool keys", () => {
    const tools = createTools(ctx);
    for (const key of EXPECTED_TOOL_KEYS) {
      expect(tools).toHaveProperty(key);
    }
  });

  it("every tool has a description string", () => {
    const tools = createTools(ctx);
    for (const [key, def] of Object.entries(tools)) {
      expect(typeof def.description, `${key}.description`).toBe("string");
      expect(def.description.length, `${key}.description non-empty`).toBeGreaterThan(0);
    }
  });

  it("every tool has an execute function", () => {
    const tools = createTools(ctx);
    for (const [key, def] of Object.entries(tools)) {
      expect(typeof def.execute, `${key}.execute`).toBe("function");
    }
  });
});

// ---------------------------------------------------------------------------
// The gate itself
// ---------------------------------------------------------------------------

describe("tool-description standard conformance gate", () => {
  let ctx: PluginContext;
  let cleanup: () => void;

  beforeEach(() => {
    const env = setupTestEnvironment("tool-desc-standard");
    cleanup = env.cleanup;
    ctx = createMockPluginContext({ testDir: env.testDir });
  });

  afterEach(() => cleanup());

  // Safety nets — defend against the worst outcome: a typo or stale entry
  // silently exempting a tool that should be checked, or vice-versa.

  it("PENDING_CONFORMANCE contains only registered tool names and has no duplicates", () => {
    const tools = createTools(ctx);
    const registered = new Set(Object.keys(tools));
    const seen = new Set<string>();
    for (const name of PENDING_CONFORMANCE) {
      expect(
        registered.has(name),
        `PENDING_CONFORMANCE entry '${name}' is not a registered tool`,
      ).toBe(true);
      expect(seen.has(name), `PENDING_CONFORMANCE entry '${name}' appears more than once`).toBe(
        false,
      );
      seen.add(name);
    }
  });

  it("HIGH_FRICTION_TOOLS contains only registered tool names and has no duplicates", () => {
    const tools = createTools(ctx);
    const registered = new Set(Object.keys(tools));
    const seen = new Set<string>();
    for (const name of HIGH_FRICTION_TOOLS) {
      expect(
        registered.has(name),
        `HIGH_FRICTION_TOOLS entry '${name}' is not a registered tool`,
      ).toBe(true);
      expect(seen.has(name), `HIGH_FRICTION_TOOLS entry '${name}' appears more than once`).toBe(
        false,
      );
      seen.add(name);
    }
  });

  it("classifies every registered tool for conditional sections", () => {
    const tools = createTools(ctx);
    expect(Object.keys(CONDITIONAL_SECTION_REQUIREMENTS).sort()).toEqual(Object.keys(tools).sort());
  });

  // The live gate. Non-pending tools must satisfy every predicate; pending
  // tools must still exist in the registry. All violations are collected and
  // reported in one shot so a wave fixing a tool sees every problem at once.
  it("every non-pending tool meets the description standard; every pending tool still exists", () => {
    const tools = createTools(ctx);
    const violations: string[] = [];

    for (const [name, def] of Object.entries(tools)) {
      if (PENDING_CONFORMANCE.includes(name)) {
        // Pending tools skip content assertions but must remain registered.
        expect(tools, `pending tool '${name}' must still be registered`).toHaveProperty(name);
        continue;
      }

      const desc = def.description;

      const missing = missingMandatorySections(desc);
      if (missing.length > 0) {
        violations.push(`${name}: missing mandatory sections — ${missing.join(", ")}`);
      }

      if (!(name in CONDITIONAL_SECTION_REQUIREMENTS)) {
        violations.push(`${name}: missing conditional-section classification`);
        continue;
      }
      const conditionalMissing = missingConditionalSections(
        desc,
        CONDITIONAL_SECTION_REQUIREMENTS[name as keyof typeof CONDITIONAL_SECTION_REQUIREMENTS],
      );
      if (conditionalMissing.length > 0) {
        violations.push(
          `${name}: missing applicable conditional sections — ${conditionalMissing.join(", ")}`,
        );
      }

      const allowlisted = HIGH_FRICTION_TOOLS.includes(name);
      const lengthViolation = descriptionLengthViolation(desc, allowlisted);
      if (lengthViolation) {
        violations.push(
          `${name}: description length ${lengthViolation.actual} is ${lengthViolation.reason} the [${lengthViolation.min}, ${lengthViolation.max}] bound${allowlisted ? "" : " (not on the high-friction allowlist)"}`,
        );
      }

      const schema = convertToolArgsToJsonSchema(def.args);
      const undescribed = collectUndescribedArgs(schema);
      if (undescribed.length > 0) {
        violations.push(
          `${name}: ${undescribed.length} argument(s) lack a .describe() — ${undescribed.join(", ")}`,
        );
      }

      const endorsements = collectEmptyStringEndorsements(schema);
      if (endorsements.length > 0) {
        violations.push(`${name}: empty-string-endorsing phrasing on — ${endorsements.join(", ")}`);
      }
    }

    expect(violations, violations.join("\n\n") || "no violations").toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Bad-fixture proofs — the gate must be able to demonstrate failure
//
// A gate that cannot fail is not a gate. Each fixture below is deliberately
// non-conformant and MUST be rejected by the SAME predicate functions the
// live gate uses. A conformant fixture is included to prove the predicates
// accept good input, not just reject bad.
// ---------------------------------------------------------------------------

describe("conformance predicates reject non-conformant fixtures", () => {
  // A model conformant description (~580 chars): carries every mandatory
  // label, sits well inside the normal length band, and contains no
  // empty-string endorsement. Every predicate must pass on this.
  const CONFORMANT_DESCRIPTION =
    "Show current GoopSpec workflow state, phase, progress, and next steps. " +
    "WHEN TO USE: Call at the start of any turn to orient on the active workflow, current phase, and the next conductor action. " +
    "WHEN NOT TO USE: Use goop_read_wave for wave or task detail, goop_dashboard for cross-workflow views, or goop_read_db to load SPEC or BLUEPRINT prose. " +
    "RETURNS: A markdown status block with project, workflow id, phase, mode, flags, a wave progress bar, phase guidance, and the next slash command. " +
    "CAVEATS: Read-only and side-effect free; safe to call any time.";

  // A clean schema: every field at every depth carries a description and no
  // field endorses an empty string. Both walkers must return empty lists.
  const CLEAN_SCHEMA: V2JsonSchema = {
    type: "object",
    properties: {
      verbose: { type: "boolean", description: "Include extended detail in the output." },
      mode: {
        type: "object",
        description: "Optional mode selector; omit when unused.",
        properties: {
          label: { type: "string", description: "Human-readable mode label." },
        },
      },
      batch: {
        type: "array",
        description: "Optional batch of entries; omit for single mode.",
        items: {
          type: "object",
          properties: {
            key: { type: "string", description: "Entry key." },
            value: { type: "number", description: "Entry value." },
          },
        },
      },
    },
  };

  it("a conformant description and schema pass every predicate", () => {
    expect(missingMandatorySections(CONFORMANT_DESCRIPTION)).toEqual([]);
    expect(descriptionLengthViolation(CONFORMANT_DESCRIPTION, false)).toBeNull();
    expect(descriptionLengthViolation(CONFORMANT_DESCRIPTION, true)).toBeNull();
    expect(collectUndescribedArgs(CLEAN_SCHEMA)).toEqual([]);
    expect(collectEmptyStringEndorsements(CLEAN_SCHEMA)).toEqual([]);
  });

  it("a classified tool missing an applicable conditional section is flagged", () => {
    expect(
      missingConditionalSections(CONFORMANT_DESCRIPTION, { modes: true, caveats: true }),
    ).toEqual(["MODES:"]);
    expect(
      missingConditionalSections(CONFORMANT_DESCRIPTION.replace("CAVEATS:", "DETAILS:"), {
        modes: false,
        caveats: true,
      }),
    ).toEqual(["CAVEATS:"]);
  });

  it("a description missing a mandatory section is flagged", () => {
    const missingWhenNotToUse = CONFORMANT_DESCRIPTION.replace("WHEN NOT TO USE:", "DETAIL:");
    expect(missingMandatorySections(missingWhenNotToUse)).toEqual(["WHEN NOT TO USE:"]);

    const noLabelsAtAll = "Does a thing. Returns a string. That is all.";
    expect(missingMandatorySections(noLabelsAtAll)).toEqual([
      "WHEN TO USE:",
      "WHEN NOT TO USE:",
      "RETURNS:",
    ]);
  });

  it("a description under 120 characters is flagged as under-length", () => {
    const tooShort = "Read state. RETURNS: a string."; // well under the floor
    const violation = descriptionLengthViolation(tooShort, false);
    expect(violation).not.toBeNull();
    expect(violation?.reason).toBe("under");
    expect(violation?.min).toBe(120);
    // Allowlisting does not rescue an under-length description.
    expect(descriptionLengthViolation(tooShort, true)?.reason).toBe("under");
  });

  it("a description over 700 characters fails only when NOT allowlisted", () => {
    // Build a string of ~900 visible characters that still carries the labels,
    // so the ONLY failing predicate is length.
    const padding = "x".repeat(900 - CONFORMANT_DESCRIPTION.length);
    const over700 = `${CONFORMANT_DESCRIPTION} ${padding}`;
    expect(over700.length).toBeGreaterThan(700);
    expect(over700.length).toBeLessThanOrEqual(1200);

    // Non-allowlisted: the normal 700 ceiling rejects it.
    const blocked = descriptionLengthViolation(over700, false);
    expect(blocked).not.toBeNull();
    expect(blocked?.reason).toBe("over");
    expect(blocked?.max).toBe(700);

    // Allowlisted: the 1200 ceiling admits the same string — the allowlist
    // is exactly the mechanism that grants this headroom.
    expect(descriptionLengthViolation(over700, true)).toBeNull();
  });

  it("a description over 1200 characters fails even when allowlisted", () => {
    const over1200 = CONFORMANT_DESCRIPTION + " ".repeat(1300 - CONFORMANT_DESCRIPTION.length);
    expect(over1200.length).toBeGreaterThan(1200);
    expect(descriptionLengthViolation(over1200, true)?.reason).toBe("over");
    expect(descriptionLengthViolation(over1200, true)?.max).toBe(1200);
  });

  it("a nested argument field without a description is flagged at its full path", () => {
    const schemaWithGaps: V2JsonSchema = {
      type: "object",
      properties: {
        outer: {
          type: "object",
          description: "An object argument.",
          properties: {
            inner_described: { type: "string", description: "Described inner field." },
            inner_blank: { type: "string" }, // no description
          },
        },
        rows: {
          type: "array",
          description: "An array argument.",
          items: {
            type: "object",
            properties: {
              row_described: { type: "number", description: "Described item field." },
              row_blank: { type: "number" }, // no description, nested under array item
            },
          },
        },
        top_described: { type: "boolean", description: "Described top-level field." },
      },
    };

    expect(collectUndescribedArgs(schemaWithGaps).sort()).toEqual([
      "outer.inner_blank",
      "rows[].row_blank",
    ]);
  });

  it("an empty-string-endorsing argument description is flagged, corrective phrasing is not", () => {
    const schema: V2JsonSchema = {
      type: "object",
      properties: {
        // Bad: endorses passing an empty string to skip.
        bad_pass_empty: { type: "string", description: "Pass an empty string to skip this field." },
        // Bad: endorses empty string as a clear mechanism.
        bad_empty_to_clear: {
          type: "string",
          description: "Use an empty string to clear the value.",
        },
        // Good: the prescribed "omit" form, acknowledging empty strings as values.
        good_omit: {
          type: "string",
          description:
            "Omit to preserve it; supplied values, including empty strings, overwrite it.",
        },
        // Good: explicit prohibition.
        good_do_not: {
          type: "string",
          description: "Do not pass an empty string; omit the field entirely when unused.",
        },
        // Good: makes no claim about empty strings at all.
        good_silent: { type: "string", description: "The display label." },
      },
    };

    expect(collectEmptyStringEndorsements(schema).sort()).toEqual([
      "bad_empty_to_clear",
      "bad_pass_empty",
    ]);
  });
});

// ---------------------------------------------------------------------------
// Wave 1 Task 1.1 — write-tool boundary matrix under host type-default
// injection (tests-first regression evidence)
//
// The host fills every optional schema field the caller never authored with
// its type default: strings `""`, booleans `false`, arrays `[]`, objects `{}`.
// Each "REG:" test below simulates a real host-augmented payload for one of
// the six mutation tools and asserts the caller's semantic intent survives —
// these intentionally FAIL until Task 1.2 normalizes the shared boundary.
// Each "KEEP:" test pins an intentional authored empty operation (or a tool
// that is already callable under injection) and must stay green.
// ---------------------------------------------------------------------------

describe("write-tool boundary matrix — injected type defaults (Wave 1 Task 1.1)", () => {
  let ctx: PluginContext;
  let toolCtx: ToolContext;
  let cleanup: () => void;

  beforeEach(() => {
    const env = setupTestEnvironment("write-boundary-matrix");
    cleanup = env.cleanup;
    ctx = createMockPluginContext({ testDir: env.testDir, db: env.db });
    toolCtx = createMockToolContext();
  });

  afterEach(() => cleanup());

  // --- goop_write_db ---

  it("REG: full write is callable under injected type defaults", async () => {
    const tools = createTools(ctx);
    // Caller authored only doc_type + content. The host fills every other
    // optional field with a type default, including the exempt patch pair
    // (old_string:""/new_string:""), replace_all:false, and items:[].
    const result = (await tools.goop_write_db.execute(
      {
        doc_type: "spec",
        content: "# hello",
        workflow_id: "",
        mode: "",
        old_string: "",
        new_string: "",
        replace_all: false,
        items: [],
      },
      toolCtx,
    )) as string;
    expect(result).toContain("Written spec");
    expect(result).toContain("mode: replace");
  });

  it("REG: append write is callable under injected type defaults", async () => {
    const tools = createTools(ctx);
    const result = (await tools.goop_write_db.execute(
      {
        doc_type: "spec",
        content: "# hello",
        mode: "append",
        workflow_id: "",
        old_string: "",
        new_string: "",
        replace_all: false,
        items: [],
      },
      toolCtx,
    )) as string;
    expect(result).toContain("Written spec");
    expect(result).toContain("mode: append");
  });

  it("REG: batch write is callable under injected patch defaults", async () => {
    const tools = createTools(ctx);
    const result = (await tools.goop_write_db.execute(
      {
        doc_type: "spec",
        items: [{ doc_type: "spec", content: "# x" }],
        old_string: "",
        new_string: "",
        replace_all: false,
      },
      toolCtx,
    )) as string;
    expect(result).toContain("Batch write-db: 1/1 succeeded");
  });

  // --- goop_write_section ---

  it("REG: full section write is callable under injected type defaults", async () => {
    const tools = createTools(ctx);
    const result = (await tools.goop_write_section.execute(
      {
        doc_type: "spec",
        section_key: "intro",
        content: "# Intro",
        workflow_id: "",
        action: "",
        old_string: "",
        new_string: "",
        replace_all: false,
        items: [],
      },
      toolCtx,
    )) as string;
    expect(result).toContain("Written section 'intro' for spec");
  });

  it("KEEP: delete action is callable under injected type defaults", async () => {
    const tools = createTools(ctx);
    await tools.goop_write_section.execute(
      { doc_type: "spec", section_key: "intro", content: "# Intro" },
      toolCtx,
    );
    const result = (await tools.goop_write_section.execute(
      {
        action: "delete",
        doc_type: "spec",
        section_key: "intro",
        old_string: "",
        new_string: "",
        replace_all: false,
        items: [],
      },
      toolCtx,
    )) as string;
    expect(result).toContain("Deleted section 'intro'");
    expect(ctx.db.getSection("default", "spec", "intro")).toBeNull();
  });

  it("KEEP: authored position: 0 is preserved and sorts first (confirmed relevant 0)", async () => {
    // 0 is a meaningful authored value on goop_write_section, not an absent
    // signal. This pins the documented "position 0 remains valid" contract at
    // the direct-factory level (the wrapped full-write path is currently
    // blocked by the injected patch defaults — see the REG: tests above).
    const sectionTool = createGoopWriteSectionTool(ctx);
    await sectionTool.execute(
      { doc_type: "spec", section_key: "alpha", content: "# Alpha", position: 1 },
      toolCtx,
    );
    const result = await sectionTool.execute(
      { doc_type: "spec", section_key: "beta", content: "# Beta", position: 0 },
      toolCtx,
    );
    expect(result).toContain("Written section 'beta'");
    const sections = ctx.db.getSections("default", "spec");
    expect(sections.map((section) => section.section_key)).toEqual(["beta", "alpha"]);
  });

  // --- goop_save_note ---

  it("REG: note create is callable under injected type defaults", async () => {
    const tools = createTools(ctx);
    const result = (await tools.goop_save_note.execute(
      {
        title: "Note title",
        body: "Note body",
        tags: ["tag"],
        source_agent: "test-agent",
        note_id: "",
        old_string: "",
        new_string: "",
        replace_all: false,
        items: [],
        workflow_id: "",
        project_id: "",
      },
      toolCtx,
    )) as string;
    expect(result).toContain("Field Note saved:");
  });

  it("REG: untagged note create (tags: []) is callable under injected type defaults", async () => {
    // Wave 3 Task 1: an explicit empty tags array is the documented "no tags"
    // value and must NOT be coalesced to absent on the wrapped path — that
    // would convert an authored untagged intent into a false "tags is
    // required" rejection and break direct/wrapped parity.
    const tools = createTools(ctx);
    const result = (await tools.goop_save_note.execute(
      {
        title: "Untagged create",
        body: "wrapped-untagged-create-body-xyz",
        tags: [],
        source_agent: "test-agent",
        note_id: "",
        old_string: "",
        new_string: "",
        replace_all: false,
        items: [],
        workflow_id: "",
        project_id: "",
      },
      toolCtx,
    )) as string;
    expect(result).toContain("Field Note saved:");
    const note = ctx.db.searchNotes("wrapped-untagged-create-body-xyz")[0];
    expect(JSON.parse(note?.tags ?? "[]")).toEqual([]);
  });

  it('REG: tags: [""] is rejected on the wrapped path with guidance (no silent untagged note)', async () => {
    const tools = createTools(ctx);
    const result = (await tools.goop_save_note.execute(
      {
        title: "Bad tags",
        body: "wrapped-tags-empty-string-body-xyz",
        tags: [""],
        source_agent: "test-agent",
      },
      toolCtx,
    )) as string;
    expect(result).toContain("Error in goop_save_note");
    expect(result).toContain("provide at least one non-empty tag");
    expect(ctx.db.searchNotes("wrapped-tags-empty-string-body-xyz")).toEqual([]);
  });

  it("REG: authored importance: 0 is rejected on the wrapped path (0 is preserved, never defaulted to 5)", async () => {
    // 0 is never coalesced (the boundary preserves authored 0), so both paths
    // must reject it with the same explicit range message.
    const tools = createTools(ctx);
    const result = (await tools.goop_save_note.execute(
      {
        title: "Zero",
        body: "wrapped-importance-zero-body-xyz",
        tags: ["z"],
        source_agent: "test-agent",
        importance: 0,
      },
      toolCtx,
    )) as string;
    expect(result).toContain("Importance must be between 1 and 10");
    expect(ctx.db.searchNotes("wrapped-importance-zero-body-xyz")).toEqual([]);
  });

  it("REG: empty-string workflow_id/project_id store null on the wrapped path", async () => {
    const tools = createTools(ctx);
    const result = (await tools.goop_save_note.execute(
      {
        title: "Scope",
        body: "wrapped-scope-empty-body-xyz",
        tags: ["s"],
        source_agent: "test-agent",
        workflow_id: "",
        project_id: "",
      },
      toolCtx,
    )) as string;
    expect(result).toContain("Field Note saved:");
    const note = ctx.db.searchNotes("wrapped-scope-empty-body-xyz")[0];
    expect(note?.workflow_id).toBeNull();
    expect(note?.project_id).toBeNull();
  });

  it('KEEP: blank-document patch survives the registry boundary (old_string: "" is load-bearing)', async () => {
    // Proves the EMPTY_STRING_LOAD_BEARING_FIELDS_BY_TOOL entry for
    // goop_save_note through the actual registry: an authored empty
    // old_string is a documented operation (patch an empty body), so it must
    // reach the tool untouched even on the wrapped path.
    const direct = createGoopSaveNoteTool(ctx);
    const created = (await direct.execute(
      { title: "Blank", body: "", tags: ["empty"], source_agent: "test-agent" },
      toolCtx,
    )) as string;
    const noteId = created.match(/fn_[A-Za-z0-9_]+/)?.[0];
    expect(noteId).toBeDefined();
    if (!noteId) throw new Error("expected a saved note id");
    expect(ctx.db.getNoteById(noteId)?.body).toBe("");

    const tools = createTools(ctx);
    const result = (await tools.goop_save_note.execute(
      { note_id: noteId, old_string: "", new_string: "Filled via registry", replace_all: false, items: [] },
      toolCtx,
    )) as string;
    expect(result).toContain("Field Note patched:");
    expect(ctx.db.getNoteById(noteId)?.body).toBe("Filled via registry");
  });

  it("KEEP: note patch is callable under injected type defaults (authored patch preserved)", async () => {
    const direct = createGoopSaveNoteTool(ctx);
    const created = (await direct.execute(
      { title: "T", body: "old body", tags: ["x"], source_agent: "test-agent" },
      toolCtx,
    )) as string;
    const noteId = created.match(/fn_[A-Za-z0-9_]+/)?.[0];
    expect(noteId).toBeDefined();
    if (!noteId) throw new Error("expected a saved note id");

    const tools = createTools(ctx);
    const result = (await tools.goop_save_note.execute(
      { note_id: noteId, old_string: "old", new_string: "new", replace_all: false, items: [] },
      toolCtx,
    )) as string;
    expect(result).toContain("Field Note patched:");
  });

  // --- goop_append_chronicle ---

  it("KEEP: chronicle append is callable under injected type defaults", async () => {
    const tools = createTools(ctx);
    const result = (await tools.goop_append_chronicle.execute(
      {
        entry: "hello chronicle",
        entries: [],
        alsoLogAdl: {},
        alsoSaveMemory: {},
        workflow_id: "",
      },
      toolCtx,
    )) as string;
    expect(result).toContain("[OK] Chronicle entry appended");
  });

  // --- goop_blocker ---

  it("KEEP: blocker list is callable under injected type defaults", async () => {
    const tools = createTools(ctx);
    const result = (await tools.goop_blocker.execute(
      {
        action: "list",
        description: "",
        severity: "",
        status: "",
        resolution: "",
        workflow_id: "",
        items: [],
      },
      toolCtx,
    )) as string;
    expect(result).toContain("No blockers found for workflow 'default'");
  });

  // --- goop_write_wave ---

  it("REG: items[] batch is callable under injected type defaults", async () => {
    const tools = createTools(ctx);
    const result = (await tools.goop_write_wave.execute(
      {
        wave_number: 1,
        items: [{ wave_number: 1, title: "Wave 1" }],
        title: "",
        pr_url: "",
        pr_branch: "",
        task_update: {},
        task_updates: [],
        verifications: [],
        traceability: [],
      },
      toolCtx,
    )) as string;
    expect(result).toContain("Batch write-wave: 1/1 succeeded");
  });

  it("REG: traceability-only mode is callable under injected type defaults", async () => {
    const tools = createTools(ctx);
    const result = (await tools.goop_write_wave.execute(
      {
        traceability: [{ requirement_key: "MH-1", wave_number: 1 }],
        title: "",
        pr_url: "",
        pr_branch: "",
        task_update: {},
        task_updates: [],
        verifications: [],
        items: [],
        status: "",
      },
      toolCtx,
    )) as string;
    expect(result).toContain("Wrote traceability for MH-1 on wave 1");
  });

  // --- Direct-factory parity and deliberate host-boundary distinctions ---

  it("keeps direct and wrapped document patch validation messages identical", async () => {
    const direct = createGoopWriteDbTool(ctx);
    const tools = createTools(ctx);
    const payload = { doc_type: "spec" as const, content: "# New", old_string: "# Old" };

    const directResult = await direct.execute(payload, toolCtx);
    const wrappedResult = await tools.goop_write_db.execute(payload, toolCtx);

    expect(directResult).toBe(wrappedResult);
    expect(directResult).toContain("content and old_string cannot be supplied together");
    expect(directResult).toContain("Valid call shapes");
  });

  it("keeps direct and wrapped section writes lossless for position: 0", async () => {
    const direct = createGoopWriteSectionTool(ctx);
    const tools = createTools(ctx);

    const directResult = await direct.execute(
      { doc_type: "spec", section_key: "direct", content: "# Direct", position: 0 },
      toolCtx,
    );
    const wrappedResult = await tools.goop_write_section.execute(
      { doc_type: "spec", section_key: "wrapped", content: "# Wrapped", position: 0 },
      toolCtx,
    );

    expect(directResult).toContain("Written section 'direct'");
    expect(wrappedResult).toContain("Written section 'wrapped'");
    expect(ctx.db.getSection("default", "spec", "direct")?.position).toBe(0);
    expect(ctx.db.getSection("default", "spec", "wrapped")?.position).toBe(0);
  });

  it('keeps direct and wrapped note_id:"" handling identical (empty id is absent on both; create wins)', async () => {
    // Wave 1 pinned a deliberate direct/wrapped divergence here (direct =
    // authored presence → rejection, wrapped = host residue → create). Wave 3
    // Task 1 supersedes that pin: an empty note_id can never address a note,
    // so treating it as absent on BOTH paths is the parity contract, and the
    // direct factory must agree with the coalesced effective payload.
    const direct = createGoopSaveNoteTool(ctx);
    const directResult = (await direct.execute(
      { title: "T", body: "B", tags: ["tag"], source_agent: "s", note_id: "" },
      toolCtx,
    )) as string;
    expect(directResult).toContain("Field Note saved:");
    expect(directResult).not.toContain("cannot be supplied alongside note_id");

    const tools = createTools(ctx);
    const wrappedResult = (await tools.goop_save_note.execute(
      { title: "T", body: "B", tags: ["tag"], source_agent: "s", note_id: "" },
      toolCtx,
    )) as string;
    expect(wrappedResult).toContain("Field Note saved:");
  });

  it("rejects empty section_key on both direct and wrapped paths with identical guidance", async () => {
    // Wave 1 pinned the direct factory's historical authored-empty behavior
    // for section_key:"" as an exploratory distinction. The locked Task 2.2
    // contract ("empty section keys cannot be created") supersedes that pin:
    // an empty section key can never name a section on EITHER path. Both
    // direct and wrapped calls must reject with the same actionable message
    // and create nothing.
    const direct = createGoopWriteSectionTool(ctx);
    const directResult = (await direct.execute(
      { doc_type: "spec", section_key: "", content: "# x" },
      toolCtx,
    )) as string;
    expect(directResult).toContain("Error in goop_write_section");
    expect(directResult).toContain("section_key is required for action 'write'");
    expect(ctx.db.getSection("default", "spec", "")).toBeNull();

    const tools = createTools(ctx);
    const wrappedResult = (await tools.goop_write_section.execute(
      { doc_type: "spec", section_key: "", content: "# x" },
      toolCtx,
    )) as string;
    expect(wrappedResult).toBe(directResult);
    expect(ctx.db.getSection("default", "spec", "")).toBeNull();
  });

  it('documents that direct entry:"" is authored while wrapped input is rejected', async () => {
    const direct = createGoopAppendChronicleTool(ctx);
    const directResult = await direct.execute({ entry: "" }, toolCtx);
    expect(directResult).toBe("[OK] Chronicle entry appended (0 chars)");

    const wrappedResult = await createTools(ctx).goop_append_chronicle.execute(
      { entry: "" },
      toolCtx,
    );
    expect(wrappedResult).toContain("no entry was provided");
    expect(ctx.db.getChronicleEvents("default")).toHaveLength(1);
  });
});
