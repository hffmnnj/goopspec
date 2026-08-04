/**
 * Empty-string coalescing for tool arguments.
 *
 * Tool-call serialization in some hosts injects empty strings (`""`) into
 * argument payloads the caller never authored — most visibly into status and
 * mode-selecting fields, where an empty string is never a legitimate value but
 * nevertheless arrives as a *present* value and defeats the caller's intent
 * (mode conflicts, "invalid status" rejections, or treating `""` as a real
 * value). Documentation cannot fix this: by the time the empty string is
 * injected the caller's intent is already gone.
 *
 * This module treats an exact empty string as absent (omitted) for fields
 * where empty carries no legitimate meaning, applied at the single shared
 * tool-input boundary (`createTools` in `src/tools/index.ts`) so it runs on
 * both the V1 and V2 registration paths from one source of truth.
 *
 * Contract (see `coalesce.test.ts`):
 * - Only exact `""` is affected. `null`, `undefined`, `0`, `false`, `[]`, `{}`,
 *   and whitespace-only strings are preserved untouched — a whitespace-only
 *   string may be intentional content, and guessing is how this defect starts.
 * - Recurses into arrays (preserving length and order) and nested objects, so
 *   empty strings inside `task_updates[]` entries are coalesced too.
 * - Never silently drops a non-empty value, and never drops an array element or
 *   object that becomes empty after coalescing.
 * - Fields in {@link EMPTY_STRING_LOAD_BEARING_KEYS} are exempt everywhere they
 *   appear, because for those fields an empty string is a documented,
 * intentional operation (delete, clear, activate) that coalescing would turn
 * into a silent no-op.
 *
 * @module shared/coalesce
 */

/**
 * Tool-argument fields where an empty string (`""`) is a documented,
 * intentional operation rather than an absent value. These are excluded from
 * empty-string coalescing everywhere they appear, across every tool.
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
export const EMPTY_STRING_LOAD_BEARING_KEYS: ReadonlySet<string> = new Set<string>([
  // Patch tools (goop_write_db, goop_write_section, goop_save_note): an empty
  // new_string deletes the matched text; an empty old_string activates patch
  // mode on presence alone (documented in shared/write-mode.ts and pinned by
  // tests) — coalescing either would change the resolved operation mode.
  "new_string",
  "old_string",
  // goop_write_wave (top-level and items[]): an empty value clears the stored
  // field per the documented "supplied values, including empty strings,
  // overwrite it" contract.
  "pr_url",
  "pr_branch",
  // goop_write_wave (top-level and items[]): same overwrite-with-empty contract
  // as pr_url/pr_branch; coalescing turns an intentional title-clear into a
  // silent no-op.
  "title",
]);

/**
 * Recursively treat exact empty strings as absent (omitted) for tool arguments
 * where an empty string carries no legitimate meaning.
 *
 * @param value - The raw argument payload (object, array, or primitive).
 * @param protectedKeys - Fields exempt from coalescing. Defaults to
 *   {@link EMPTY_STRING_LOAD_BEARING_KEYS}. Pass a custom set only in tests.
 * @returns A structurally equivalent value with exact empty strings omitted
 *   from non-protected keys, recursively.
 */
export function coalesceEmptyStrings<T>(
  value: T,
  protectedKeys: ReadonlySet<string> = EMPTY_STRING_LOAD_BEARING_KEYS,
): T {
  return walk(value, protectedKeys) as T;
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
