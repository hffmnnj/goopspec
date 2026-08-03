/**
 * Shared hook utilities: safe execution wrappers, handler chaining,
 * and identity/path classification helpers used across all hooks.
 */

import { log } from "../shared/logger.js";

// ---------------------------------------------------------------------------
// Generic handler type — the SDK's (input, output) => Promise<void> shape
// ---------------------------------------------------------------------------

/** Any async two-arg handler matching the SDK hook signature pattern. */
type AsyncHandler = (...args: never[]) => Promise<void>;

// ---------------------------------------------------------------------------
// Intentional tool-execution denial — the one sentinel safeHandler rethrows
// ---------------------------------------------------------------------------

/**
 * Thrown only when a hook deliberately means to block the in-flight tool
 * call (e.g. the verifier-stage guard denying a wrong-stage `task`
 * delegation). This is the single, narrowly-scoped exception to "a hook
 * error must never crash OpenCode": `safeHandler` recognizes this exact type
 * by identity and rethrows it instead of catching it, so it propagates
 * through `chainHandlers`/`mergeHooks` to the host, which aborts the tool
 * call. Every other error — expected or not, from this hook or any other —
 * keeps the default catch-and-log behavior unchanged.
 *
 * Construct this only for a deliberate denial decision, never for an
 * unexpected failure inside a hook's own logic.
 */
export class IntentionalToolDenialError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IntentionalToolDenialError";
  }
}

// ---------------------------------------------------------------------------
// Safe handler wrapper — graceful degradation on throw
// ---------------------------------------------------------------------------

/**
 * Wrap a hook handler so that exceptions are caught and logged rather than
 * propagated. A hook error must never crash OpenCode — except a deliberate
 * {@link IntentionalToolDenialError}, which is rethrown so the host can
 * actually block the tool call it was raised for.
 */
export function safeHandler<H extends AsyncHandler>(label: string, handler: H): H {
  // Capture once so high-frequency hook invocations avoid reading process.env.
  const debug = process.env.GOOPSPEC_DEBUG === "true";
  const wrapped = async (...args: Parameters<H>): Promise<void> => {
    try {
      if (debug) {
        const start = Date.now();
        await (handler as unknown as (...a: unknown[]) => Promise<void>)(...args);
        const duration = Date.now() - start;
        if (duration > 25) {
          log(`${label}: slow hook detected`, { durationMs: duration });
        }
      } else {
        await (handler as unknown as (...a: unknown[]) => Promise<void>)(...args);
      }
    } catch (err) {
      if (err instanceof IntentionalToolDenialError) {
        throw err;
      }
      // biome-ignore lint/suspicious/noConsole: Intentional error logging for graceful degradation
      console.error(`[goopspec] hook "${label}" error:`, err);
    }
  };
  return wrapped as unknown as H;
}

// ---------------------------------------------------------------------------
// Handler chaining — compose multiple handlers for the same event
// ---------------------------------------------------------------------------

/**
 * Chain multiple handlers for the same hook event into a single handler.
 * Handlers execute sequentially in array order. Each handler receives the
 * same `input` and `output` references, so mutations from earlier handlers
 * are visible to later ones.
 *
 * If a handler throws, the error is caught (via `safeHandler`) and the
 * chain continues with the next handler — unless it is an
 * {@link IntentionalToolDenialError}, which `safeHandler` rethrows; the
 * chain then stops and the error propagates to the caller.
 */
export function chainHandlers<H extends AsyncHandler>(eventName: string, handlers: H[]): H {
  if (handlers.length === 1) {
    return safeHandler(eventName, handlers[0]);
  }

  const wrapped = handlers.map((h, i) => safeHandler(`${eventName}[${i}]`, h));

  const chained = async (...args: Parameters<H>): Promise<void> => {
    for (const handler of wrapped) {
      await (handler as unknown as (...a: unknown[]) => Promise<void>)(...args);
    }
  };

  return chained as unknown as H;
}

// ---------------------------------------------------------------------------
// Identity detection helpers
// ---------------------------------------------------------------------------

const ORCHESTRATOR_PATTERNS = [
  "orchestrator",
  "goop-orchestrator",
  "goopspec-orchestrator",
] as const;

/**
 * Detect whether the current agent identity is the orchestrator.
 */
export function isOrchestrator(agent: string | undefined): boolean {
  if (!agent) return false;
  const lower = agent.toLowerCase();
  return ORCHESTRATOR_PATTERNS.some((p) => lower.includes(p));
}

// ---------------------------------------------------------------------------
// File path classification
// ---------------------------------------------------------------------------

const IMPLEMENTATION_PREFIXES = [
  "src/",
  "lib/",
  "app/",
  "pages/",
  "components/",
  "services/",
  "utils/",
  "helpers/",
  "modules/",
  "packages/",
] as const;

const GOOPSPEC_PREFIXES = [".goopspec/"] as const;

const CODE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".vue", ".svelte"] as const;

/**
 * Classify whether a file path is an implementation file (source code)
 * as opposed to GoopSpec state/docs or config files.
 *
 * Used by the orchestrator-enforcement hook to block the orchestrator
 * from writing implementation files directly.
 */
export function isImplementationFile(filePath: string): boolean {
  if (!filePath) return false;
  const normalized = filePath.replace(/\\/g, "/");

  if (GOOPSPEC_PREFIXES.some((p) => normalized.startsWith(p))) {
    return false;
  }

  if (IMPLEMENTATION_PREFIXES.some((p) => normalized.startsWith(p))) {
    return true;
  }

  return CODE_EXTENSIONS.some((ext) => normalized.endsWith(ext));
}

/**
 * Check whether a file path is a GoopSpec state/doc file.
 */
export function isGoopspecFile(filePath: string): boolean {
  if (!filePath) return false;
  const normalized = filePath.replace(/\\/g, "/");
  return GOOPSPEC_PREFIXES.some((p) => normalized.startsWith(p));
}
