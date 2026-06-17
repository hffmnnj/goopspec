/**
 * Routing engine — classifies task descriptions and dispatches to agents.
 *
 * Public API:
 * - `route(description)` — full classification with agent, tier, confidence.
 * - `detectAutoDelegation(prompt)` — detect research/debug intents for
 *   auto-dispatch (MH18: replaces removed /goop-research and /goop-debug).
 *
 * @module features/routing
 */

import type { AgentRole, ExecutorTier } from "../../core/constants.js";
import { type ClassifierOptions, classify } from "./classifier.js";

// Re-export types and categories for consumers.
export type { ClassificationResult, ClassifierOptions } from "./classifier.js";
export type { RoutingCategory } from "./categories.js";
export {
  ROUTING_CATEGORIES,
  DEFAULT_AGENT,
  DEFAULT_TIER,
} from "./categories.js";

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

/** Result of routing a task description. */
export interface RoutingResult {
  readonly agent: AgentRole;
  readonly tier: ExecutorTier | undefined;
  readonly confidence: number;
  readonly reason: string;
  readonly category: string;
  readonly matchedSignals: readonly string[];
}

/**
 * Classify a task description and return the best agent to handle it.
 *
 * Delegates to the classifier, which scores all routing categories
 * and picks the highest-confidence match.
 */
export function route(description: string, options?: ClassifierOptions): RoutingResult {
  return classify(description, options);
}

// ---------------------------------------------------------------------------
// Auto-delegation detection (MH18)
// ---------------------------------------------------------------------------

/** Signals that indicate a research intent. */
const RESEARCH_INTENTS: readonly RegExp[] = [
  /\bresearch\b/i,
  /\binvestigate\s+options?\b/i,
  /\bexplore\s+options?\b/i,
  /\bcompare\s+(?:alternatives|approaches|libraries|frameworks)\b/i,
  /\bevaluate\s+(?:approaches|options|tools)\b/i,
  /\bfeasibility\b/i,
  /\bspike\b/i,
  /\bproof\s+of\s+concept\b/i,
  /\bpoc\b/i,
  /\bpros\s+and\s+cons\b/i,
  /\btrade-?off/i,
  /\bwhich\s+(?:library|framework|tool|approach)\b/i,
  /\bbest\s+approach\b/i,
];

/** Signals that indicate a debug intent. */
const DEBUG_INTENTS: readonly RegExp[] = [
  /\bdebug\b/i,
  /\bfix\s+(?:bug|error|issue|crash)\b/i,
  /\btroubleshoot\b/i,
  /\broot\s+cause\b/i,
  /\bwhy\b[\s\S]{0,30}\b(?:failing|broken|crashing)\b/i,
  /\bnot\s+working\b/i,
  /\bstack\s+trace\b/i,
  /\bdiagnose\b/i,
  /\bregression\b/i,
  /\binvestigate\s+(?:error|bug|crash|failure)\b/i,
];

/** Result of auto-delegation detection. */
export interface AutoDelegationResult {
  /** Whether an auto-delegation intent was detected. */
  readonly detected: boolean;
  /** The agent to delegate to, if detected. */
  readonly agent: AgentRole | undefined;
  /** Which intent type was detected. */
  readonly intent: "research" | "debug" | undefined;
  /** The pattern that matched. */
  readonly matchedPattern: string | undefined;
}

/**
 * Detect whether a user prompt contains a research or debug intent
 * that should be auto-delegated to the appropriate specialist agent.
 *
 * This replaces the removed `/goop-research` and `/goop-debug` commands
 * (MH18). The orchestrator calls this on incoming prompts to decide
 * whether to auto-dispatch without requiring a slash command.
 */
export function detectAutoDelegation(prompt: string): AutoDelegationResult {
  const text = prompt.toLowerCase();

  // Check debug first — "debug" is more urgent/specific than "research".
  for (const pattern of DEBUG_INTENTS) {
    const match = pattern.exec(text);
    if (match) {
      return {
        detected: true,
        agent: "debugger",
        intent: "debug",
        matchedPattern: match[0],
      };
    }
  }

  for (const pattern of RESEARCH_INTENTS) {
    const match = pattern.exec(text);
    if (match) {
      return {
        detected: true,
        agent: "researcher",
        intent: "research",
        matchedPattern: match[0],
      };
    }
  }

  return {
    detected: false,
    agent: undefined,
    intent: undefined,
    matchedPattern: undefined,
  };
}
