/**
 * Exact-substring content patch helper.
 *
 * Matches Edit-tool semantics: case-sensitive, whitespace-sensitive,
 * single-match default, opt-in replace all, and a no-op guard for identical
 * strings. Never throws; always returns a structured PatchResult.
 */

export interface PatchOptions {
  /** Replace every occurrence instead of requiring a single unique match. */
  replaceAll?: boolean;
}

export interface PatchResult {
  ok: boolean;
  /** Patched content; present only when the patch succeeds. */
  content?: string;
  /** Number of occurrences of `oldString` found in `existing`. */
  matchCount: number;
  /** Human-readable error; present only when the patch fails. */
  error?: string;
}

export function patchContent(
  existing: string,
  oldString: string,
  newString: string,
  options?: PatchOptions,
): PatchResult {
  if (oldString === newString) {
    return {
      ok: false,
      matchCount: 0,
      error: "Old string is identical to new string — no replacement needed.",
    };
  }

  const matchCount = existing.split(oldString).length - 1;

  if (matchCount === 0) {
    return {
      ok: false,
      matchCount: 0,
      error:
        "Old string did not appear verbatim in the content. Ensure the string matches exactly, including whitespace and indentation.",
    };
  }

  const replaceAll = options?.replaceAll ?? false;

  if (matchCount > 1 && !replaceAll) {
    return {
      ok: false,
      matchCount,
      error: `Old string matched ${matchCount} occurrences. Provide a more specific string with more surrounding context, or set replace_all=true to replace all.`,
    };
  }

  const content = replaceAll
    ? existing.replaceAll(oldString, newString)
    : existing.replace(oldString, newString);

  return { ok: true, content, matchCount };
}
