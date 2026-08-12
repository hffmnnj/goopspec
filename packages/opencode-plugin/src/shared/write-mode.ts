/**
 * write-mode.ts — shared operation-mode resolver for GoopSpecDB write tools.
 *
 * Decides whether a call means full-document write/append, patch, batch, or
 * an ambiguous/invalid combination, before any mutation occurs. Replaces
 * presence-based branching (`isPatchActive`) that let `content` silently
 * lose to `old_string`, and let `new_string`/`replace_all` be silently
 * dropped without `old_string`. Pure: callers own DB access and the actual
 * patch execution (`content-patch.ts`).
 */

export interface WriteModeFields {
  content?: string;
  mode?: "replace" | "append";
  old_string?: string;
  new_string?: string;
  replace_all?: boolean;
  /** True when a non-empty items[] batch array accompanies this payload. */
  hasItems?: boolean;
}

export interface FullWriteResolution {
  kind: "full-write";
  content: string;
  mode: "replace" | "append";
}

export interface PatchResolution {
  kind: "patch";
  old_string: string;
  new_string: string;
  replace_all: boolean;
}

export interface BatchResolution {
  kind: "batch";
}

/**
 * No operation fields were present at all. The caller picks the fallback
 * error, because the correct wording differs by context (e.g. an explicitly
 * empty `items: []` vs. no `items` key at all read differently to a caller
 * even though both resolve to "none" here).
 */
export interface NoneResolution {
  kind: "none";
}

export interface WriteModeError {
  kind: "error";
  message: string;
}

export type WriteModeResolution =
  | FullWriteResolution
  | PatchResolution
  | BatchResolution
  | NoneResolution
  | WriteModeError;

const VALID_SHAPES =
  "Valid call shapes: (1) full write/append — doc_type + content, optional mode; " +
  "(2) patch — doc_type + old_string, optional new_string/replace_all; " +
  "(3) batch — items[] only, with no top-level content/old_string/new_string/replace_all/mode.";

/**
 * "Meaningfully present" = defined and non-empty. Empty-string `content` at
 * the top level of a batch call is a documented neutral placeholder some
 * callers still send; `old_string` activates patch mode on presence alone
 * (even "") — that's the documented "patch an empty document" workaround.
 */
function isMeaningful(value: string | undefined): boolean {
  return value !== undefined && value.length > 0;
}

function err(message: string): WriteModeError {
  return { kind: "error", message: `${message} ${VALID_SHAPES}` };
}

/**
 * Resolve a single write-tool payload to exactly one operation mode, or an
 * actionable error naming the field(s) that make the call ambiguous. Full
 * truth table lives in write-mode.test.ts, which pins every row.
 *
 * Rule precedence when a call violates more than one rule: rule 4 (items
 * conflict) first, since it's independent of the other three; then rule 2
 * (dangling patch modifiers), rule 3 (append + patch), rule 1 (content +
 * old_string). Deterministic — callers always get exactly one message.
 */
export function resolveWriteMode(fields: WriteModeFields): WriteModeResolution {
  const hasItems = fields.hasItems === true;
  const meaningfulContent = isMeaningful(fields.content);
  // An all-empty protected patch pair is ambiguous on its own, so preserve the
  // documented blank-document operation. Once content or items[] independently
  // selects a mode, however, the pair is provably host residue, not a patch.
  const hasInjectedEmptyPatchGroup =
    fields.old_string === "" && fields.new_string === "" && (meaningfulContent || hasItems);
  const oldString = hasInjectedEmptyPatchGroup ? undefined : fields.old_string;
  const newString = hasInjectedEmptyPatchGroup ? undefined : fields.new_string;
  const replaceAll =
    hasInjectedEmptyPatchGroup && fields.replace_all === false ? undefined : fields.replace_all;
  const hasOldString = oldString !== undefined;
  const hasNewString = newString !== undefined;
  const hasReplaceAll = replaceAll !== undefined;
  const hasMode = fields.mode !== undefined;

  // Rule 4: items[] + top-level operation field. content is exempt when
  // present-but-empty (documented neutral placeholder).
  if (hasItems) {
    const offending = [
      meaningfulContent ? "content" : null,
      hasOldString ? "old_string" : null,
      hasNewString ? "new_string" : null,
      hasReplaceAll ? "replace_all" : null,
      hasMode ? "mode" : null,
    ].filter((field): field is string => field !== null);

    if (offending.length > 0) {
      return err(
        `${offending.join(", ")} cannot be supplied alongside items[]: batch mode uses only the per-item fields inside items[], so top-level operation fields would be silently ignored.`,
      );
    }

    return { kind: "batch" };
  }

  // Rule 2: new_string/replace_all only configure a patch; without
  // old_string they were previously silently dropped.
  if (!hasOldString && (hasNewString || hasReplaceAll)) {
    const offending = [
      hasNewString ? "new_string" : null,
      hasReplaceAll ? "replace_all" : null,
    ].filter((field): field is string => field !== null);
    return err(
      `${offending.join(", ")} supplied without old_string: ${offending.join(" and ")} only configure patch mode, which activates when old_string is present.`,
    );
  }

  // Rule 3: patch mode has no append variant — it always replaces in place.
  if (hasOldString && fields.mode === "append") {
    return err('mode: "append" cannot be combined with old_string/new_string/replace_all.');
  }

  // Rule 1: two conflicting operations named in the same call. mode:
  // "replace" + old_string is not flagged — "replace" is the default and
  // matches what patch mode already does.
  if (hasOldString && meaningfulContent) {
    return err("content and old_string cannot be supplied together.");
  }

  if (hasOldString) {
    return {
      kind: "patch",
      old_string: oldString as string,
      new_string: newString ?? "",
      replace_all: replaceAll ?? false,
    };
  }

  if (fields.content !== undefined) {
    return { kind: "full-write", content: fields.content, mode: fields.mode ?? "replace" };
  }

  return { kind: "none" };
}
