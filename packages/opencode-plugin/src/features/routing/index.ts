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

import { AGENT_ROLES, type AgentRole, type ExecutorTier } from "../../core/constants.js";
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

/** OpenCode agent registration key (for example, `goop-researcher`). */
export type AgentId = `goop-${AgentRole}`;

/** Result of resolving a routing role to an OpenCode agent ID. */
export interface AgentIdResolutionResult {
  readonly role: AgentRole;
  readonly agentId: AgentId;
  readonly fallbackApplied: boolean;
  readonly reason: string;
}

/** Options for resolving a routed role to an OpenCode agent ID. */
export interface AgentIdResolutionOptions {
  readonly availableAgentIds?: readonly string[] | Record<string, unknown>;
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

/** Convert a bare GoopSpec role to the OpenCode `Config.agent` key. */
export function toAgentId(role: AgentRole): AgentId {
  return `goop-${role}` as AgentId;
}

/** Normalize either `explorer` or `goop-explorer` into a bare role. */
export function normalizeAgentRole(agent: AgentRole | string): AgentRole | undefined {
  const role = agent.replace(/^goop-/, "");
  return (AGENT_ROLES as readonly string[]).includes(role) ? (role as AgentRole) : undefined;
}

/**
 * Resolve a routed role to the actual OpenCode agent ID.
 *
 * Routing categories use bare roles (`explorer`), while OpenCode validates task
 * subagents against `Config.agent` keys (`goop-explorer`). This helper is the
 * bridge between the two namespaces and applies the requested explorer →
 * researcher fallback when explorer is not registered.
 */
export function resolveAgentId(
  agent: AgentRole | string,
  options: AgentIdResolutionOptions = {},
): AgentIdResolutionResult {
  const role = normalizeAgentRole(agent) ?? "researcher";
  const agentId = toAgentId(role);

  if (isAgentAvailable(agentId, options.availableAgentIds)) {
    return {
      role,
      agentId,
      fallbackApplied: false,
      reason: `Resolved ${role} to registered agent ID ${agentId}.`,
    };
  }

  if (role === "explorer" && isAgentAvailable("goop-researcher", options.availableAgentIds)) {
    return {
      role: "researcher",
      agentId: "goop-researcher",
      fallbackApplied: true,
      reason: "goop-explorer is unavailable; falling back to goop-researcher.",
    };
  }

  return {
    role,
    agentId,
    fallbackApplied: false,
    reason: options.availableAgentIds
      ? `${agentId} is not in the available agent list.`
      : `Resolved ${role} to agent ID ${agentId}.`,
  };
}

/** Classify a description and return the OpenCode-valid agent ID. */
export function routeToAgentId(
  description: string,
  options: ClassifierOptions & AgentIdResolutionOptions = {},
): RoutingResult & AgentIdResolutionResult {
  const routed = route(description, options);
  const resolved = resolveAgentId(routed.agent, options);
  return { ...routed, ...resolved };
}

function isAgentAvailable(
  agentId: AgentId,
  availableAgentIds: readonly string[] | Record<string, unknown> | undefined,
): boolean {
  if (!availableAgentIds) return true;
  if (Array.isArray(availableAgentIds)) return availableAgentIds.includes(agentId);
  return Object.hasOwn(availableAgentIds as Record<string, unknown>, agentId);
}

// ---------------------------------------------------------------------------
// Auto-delegation detection (MH18)
// ---------------------------------------------------------------------------

/** Signals that indicate a research intent. */
const RESEARCH_INTENTS: readonly RegExp[] = [
  /\bresearch\b/i,
  /\binvestigate\s+(?:options?|and\s+compare)\b/i,
  /\bexplore\s+options?\b/i,
  /\bcompare\s+(?:alternatives|approaches|libraries|frameworks|providers|tools)\b/i,
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
  /\bfix\s+(?:bug|error|issue|crash|failing)\b/i,
  /\bfailing\s+test/i,
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
