/**
 * Reference Signals — transient in-memory signal store.
 *
 * Passes keyword-matched reference names from the `chat.message` hook to the
 * `experimental.chat.system.transform` hook within the same request cycle.
 *
 * Design constraints:
 * - No PluginContext or WorkflowState dependency.
 * - No database access.
 * - No disk persistence — signals are ephemeral per-request.
 *
 * @module features/reference-signals
 */

// ---------------------------------------------------------------------------
// Signal store (module-level, not exported)
// ---------------------------------------------------------------------------

const signals = new Map<string, string[]>();

// ---------------------------------------------------------------------------
// Signal store API
// ---------------------------------------------------------------------------

/** Store which references are relevant for a session. */
export function setSignals(sessionId: string, refs: string[]): void {
  signals.set(sessionId, refs);
}

/** Retrieve relevant references for a session. Returns [] if not set. */
export function getSignals(sessionId: string): string[] {
  return signals.get(sessionId) ?? [];
}

/** Remove signals for a session after they have been consumed. */
export function clearSignals(sessionId: string): void {
  signals.delete(sessionId);
}

// ---------------------------------------------------------------------------
// Keyword → reference name mapping
// ---------------------------------------------------------------------------

/**
 * Ordered list of [pattern, referenceNames] tuples.
 *
 * Using an array of tuples rather than a Map because RegExp keys in a Map
 * compare by reference identity, not by pattern equality.
 *
 * Patterns are case-insensitive (the `i` flag is set on each RegExp).
 */
export const KEYWORD_PATTERNS: ReadonlyArray<readonly [RegExp, readonly string[]]> = [
  [/\b(debug|debugging|error|crash|stack.?trace|exception|breakpoint|not working|broken|failing)\b/i, ["debugging"]],
  [/\b(pr|pull.?request|open.?pr|create.?pr|gh pr|merge request|review)\b/i, ["pr-creation"]],
  [/\b(dogfood|dogfooding|manual.?test|test.?manually|eat.?your.?own)\b/i, ["dogfooding"]],
  [/\b(commit|branch|git|stash|rebase|cherry.?pick)\b/i, ["git-workflow"]],
  [/\b(test|tdd|unit.?test|test.?driven|coverage|spec)\b/i, ["tdd"]],
  [/\b(security|vuln|cve|auth|xss|injection|owasp)\b/i, ["security-checklist"]],
];

// ---------------------------------------------------------------------------
// Reference detection
// ---------------------------------------------------------------------------

/**
 * Detect relevant references from a text string.
 *
 * Runs each pattern against `text`, collects all matched reference names
 * (deduplicated, preserving first-match order), and returns at most 2.
 *
 * @param text - The user message text to scan.
 * @returns Up to 2 deduplicated reference names.
 */
export function detectReferences(text: string): string[] {
  const seen = new Set<string>();
  const results: string[] = [];

  for (const [pattern, refs] of KEYWORD_PATTERNS) {
    if (results.length >= 2) break;
    if (pattern.test(text)) {
      for (const ref of refs) {
        if (!seen.has(ref)) {
          seen.add(ref);
          results.push(ref);
          if (results.length >= 2) break;
        }
      }
    }
  }

  return results;
}
