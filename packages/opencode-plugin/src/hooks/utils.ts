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
// Safe handler wrapper — graceful degradation on throw
// ---------------------------------------------------------------------------

/**
 * Wrap a hook handler so that exceptions are caught and logged rather than
 * propagated. A hook error must never crash OpenCode.
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
 * chain continues with the next handler.
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
