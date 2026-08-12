/**
 * Semantic-omission coalescing for tool arguments.
 *
 * Tool-call serialization in some hosts injects empty strings (`""`) into
 * argument payloads the caller never authored — most visibly into status and
 * mode-selecting fields, where an empty string is never a legitimate value but
 * nevertheless arrives as a *present* value and defeats the caller's intent
 * (mode conflicts, "invalid status" rejections, or treating `""` as a real
 * value). Documentation cannot fix this: by the time the empty string is
 * injected the caller's intent is already gone.
 *
 * This module treats injected defaults as absent (omitted) only for audited
 * tool-field pairs where the value carries no legitimate meaning, applied at the single shared
 * tool-input boundary (`createTools` in `src/tools/index.ts`) so it runs on
 * both the V1 and V2 registration paths from one source of truth.
 *
 * Contract (see `coalesce.test.ts`):
 * - Exact `""`, `false`, `[]`, and `{}` are coalesced only when their
 *   tool-field policy permits it. `null`, `undefined`, `0`, and whitespace-only
 *   strings are always preserved — a whitespace-only string may be intentional
 *   content, and guessing is how this defect starts.
 * - Recurses into arrays (preserving length and order) and nested objects, so
 *   empty strings inside `task_updates[]` entries are coalesced too.
 * - Never silently drops a non-empty value, and never drops an array element or
 *   object that becomes empty after coalescing.
 * - Fields listed for the receiving tool in
 *   {@link EMPTY_STRING_LOAD_BEARING_FIELDS_BY_TOOL} are exempt, because for
 *   those specific tool-field pairs an empty string is a documented,
 *   intentional operation (delete, clear, activate) that coalescing would turn
 *   into a silent no-op. A field name alone never grants an exemption.
 *
 * @module shared/coalesce
 */

/**
 * Tool-specific fields where an empty string (`""`) is a documented,
 * intentional operation rather than an absent value. An unlisted tool gets no
 * exemptions, even when it shares a field name with an allowlisted tool.
 *
 * Each entry exists because coalescing its empty value to absent would convert
 * an intentional operation into a silent no-op — the exact failure class the
 * coalescing exists to eliminate.
 *
 * Audit notes (fields considered but deliberately NOT protected):
 * - `content` — coalescing empty content yields a loud `none`-mode error in
 *   single-mode writes (not a silent no-op), and in batch mode empty content is
 *   a documented neutral placeholder unaffected by coalescing. Protecting it
 *   would let an injected `content:""` silently wipe a document, which is the
 *   destructive case this boundary exists to prevent.
 * - Status fields (`status`, `task_updates[].status`, etc.) — an empty status
 *   is never a valid value; coalescing to absent is the intended fix.
 * - Free-text fields (`description`, `detail`, `body`, `entry`, …) — an empty
 *   value is not a documented operation; coalescing to absent is safe.
 */
export const EMPTY_STRING_LOAD_BEARING_FIELDS_BY_TOOL: Readonly<
  Record<string, ReadonlySet<string>>
> = {
  // Patch-capable tools: an empty new_string deletes matched text; an empty
  // old_string activates patch mode on presence alone. Both behaviors are
  // documented and tested for every tool in this group.
  goop_write_db: new Set(["new_string", "old_string"]),
  goop_write_section: new Set(["new_string", "old_string"]),
  goop_save_note: new Set(["new_string", "old_string"]),
};

const NO_LOAD_BEARING_FIELDS: ReadonlySet<string> = new Set<string>();

/** Optional false values that this host injects rather than the caller authors. */
const INJECTED_FALSE_FIELDS_BY_TOOL: Readonly<Record<string, ReadonlySet<string>>> = {
  goop_save_note: new Set(["replace_all"]),
  goop_write_db: new Set(["replace_all"]),
  goop_write_section: new Set(["replace_all"]),
  goop_write_wave: new Set(["allow_status_regression"]),
};

/** Optional collection/object fields whose empty form has no operation meaning. */
const INJECTED_EMPTY_CONTAINER_FIELDS_BY_TOOL: Readonly<Record<string, ReadonlySet<string>>> = {
  // NOTE: `entries` is deliberately NOT here for goop_append_chronicle. An
  // explicitly empty entries array is the documented "empty batch" rejection
  // case the tool must distinguish from a no-args call; coalescing it to
  // absent would erase that distinction on the wrapped path and break
  // direct/wrapped parity. An injected [] never selects batch mode — the tool
  // only batches when entries is non-empty — so leaving it visible is safe
  // under host injection (an injected [] alongside a real entry falls through
  // to the single path).
  goop_append_chronicle: new Set(["alsoLogAdl", "alsoSaveMemory"]),
  // NOTE: `items` is deliberately NOT here for goop_blocker. An explicitly
  // empty items array is the documented "empty batch" rejection case the tool
  // must distinguish from a no-args call; coalescing it to absent would erase
  // that distinction on the wrapped path and break direct/wrapped parity. An
  // injected [] never selects batch mode — the tool only batches when items
  // is non-empty — so leaving it visible is safe.
  // NOTE: `tags` is deliberately NOT here for goop_save_note. An empty tags
  // array is the documented explicit "no tags" value (a note may legitimately
  // be untagged), so coalescing it to absent would convert an authored
  // untagged intent into a false "tags is required" rejection and break
  // direct/wrapped parity. The silent-untagged defect class is tags:[""] —
  // an array of empty strings — which survives here and is rejected at the
  // tool level instead.
  goop_save_note: new Set(["items"]),
  goop_write_db: new Set(["items"]),
  goop_write_section: new Set(["items"]),
  goop_write_wave: new Set([
    "items",
    "task_update",
    "task_updates",
    "traceability",
    "verifications",
  ]),
};

/**
 * Recursively treat exact empty strings as absent (omitted) for tool arguments
 * where an empty string carries no legitimate meaning.
 *
 * @param value - The raw argument payload (object, array, or primitive).
 * @param toolName - Canonical MCP tool name. Only its explicitly listed
 *   protected fields are exempt; unknown and omitted tool names get no
 *   exemptions by default.
 * @returns A structurally equivalent value with exact empty strings omitted
 *   from non-protected keys, recursively.
 */
export function coalesceEmptyStrings<T>(value: T, toolName?: string): T {
  const protectedKeys =
    toolName === undefined
      ? NO_LOAD_BEARING_FIELDS
      : (EMPTY_STRING_LOAD_BEARING_FIELDS_BY_TOOL[toolName] ?? NO_LOAD_BEARING_FIELDS);
  const coalesced = walk(value, protectedKeys);
  return coalesceInjectedDefaults(coalesced, toolName) as T;
}

function walk(value: unknown, skip: ReadonlySet<string>): unknown {
  if (Array.isArray(value)) {
    // Recurse into every element but preserve length and order. An element
    // that becomes an empty object after coalescing is NOT dropped — dropping
    // would be a silent data change the contract forbids.
    return value.map((item) => walk(item, skip));
  }

  if (value !== null && typeof value === "object") {
    const source = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(source)) {
      // Exact empty string on a non-protected key → omit (treat as absent).
      // Every other value (including whitespace-only strings) is preserved
      // and recursed into.
      if (val === "" && !skip.has(key)) {
        continue;
      }
      out[key] = walk(val, skip);
    }
    return out;
  }

  return value;
}

function coalesceInjectedDefaults(value: unknown, toolName?: string): unknown {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    toolName === undefined
  ) {
    return value;
  }

  const falseFields = INJECTED_FALSE_FIELDS_BY_TOOL[toolName] ?? NO_LOAD_BEARING_FIELDS;
  const containerFields =
    INJECTED_EMPTY_CONTAINER_FIELDS_BY_TOOL[toolName] ?? NO_LOAD_BEARING_FIELDS;
  const source = value as Record<string, unknown>;
  const omittedKeys = new Set<string>([
    ...[...falseFields].filter((key) => source[key] === false),
    ...[...containerFields].filter((key) => {
      const field = source[key];
      return (Array.isArray(field) && field.length === 0) || isEmptyObject(field);
    }),
    ...emptyPatchGroupKeys(source, toolName),
  ]);

  return Object.fromEntries(Object.entries(source).filter(([key]) => !omittedKeys.has(key)));
}

function isEmptyObject(value: unknown): value is Record<string, never> {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).length === 0
  );
}

function emptyPatchGroupKeys(value: Record<string, unknown>, toolName: string): string[] {
  if (
    !["goop_save_note", "goop_write_db", "goop_write_section"].includes(toolName) ||
    value.old_string !== "" ||
    value.new_string !== "" ||
    !hasIndependentWriteEvidence(value, toolName)
  ) {
    return [];
  }

  return ["old_string", "new_string"];
}

function hasIndependentWriteEvidence(value: Record<string, unknown>, toolName: string): boolean {
  if (typeof value.content === "string" && value.content.length > 0) return true;
  if (toolName === "goop_save_note") {
    // `tags` counts on presence alone (not length): an explicitly empty tags
    // array is a legitimate authored create signal — the documented way to
    // save an untagged note — so it must stand as independent write evidence
    // against an injected empty patch pair.
    return (
      typeof value.title === "string" &&
      value.title.length > 0 &&
      typeof value.body === "string" &&
      value.body.length > 0 &&
      Array.isArray(value.tags) &&
      typeof value.source_agent === "string" &&
      value.source_agent.length > 0
    );
  }
  return (
    Array.isArray(value.items) &&
    value.items.some(
      (item) =>
        item !== null &&
        typeof item === "object" &&
        typeof (item as Record<string, unknown>).doc_type === "string",
    )
  );
}
