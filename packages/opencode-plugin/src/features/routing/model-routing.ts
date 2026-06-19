/**
 * Per-role model routing — resolves the effective model for any agent role
 * or executor tier, with fallback when the preferred model is unavailable.
 *
 * Resolution chain (highest priority wins):
 *   1. Per-role config override  (`config.agentModels[role]`)
 *   2. Blanket default override  (`config.defaultModel`)
 *   3. Built-in default          (`DEFAULT_MODEL_MAP[role]`)
 *
 * This module delegates to `getEffectiveModelMap` from the setup feature
 * (single source of truth) rather than re-implementing the merge logic.
 *
 * @module features/routing/model-routing
 */

import type { AgentRole, ExecutorTier } from "../../core/constants.js";
import { AGENT_ROLES } from "../../core/constants.js";
import type { AgentModelPreference } from "../../core/types.js";
import { DEFAULT_MODEL_MAP, getEffectiveModelMap } from "../setup/index.js";
import { normalizeAgentRole, resolveAgentId } from "./index.js";

// ---------------------------------------------------------------------------
// Resolve model for a role
// ---------------------------------------------------------------------------

/**
 * Resolve the effective model for a given agent role.
 *
 * When `projectDir` is provided, config overrides are applied via the
 * setup module's `getEffectiveModelMap`. Without it, only the built-in
 * defaults are used.
 *
 * @param role      - The agent role to resolve a model for.
 * @param projectDir - Optional project directory for config-based overrides.
 * @returns The resolved model identifier string.
 */
export function resolveModelForRole(
  role: AgentRole | string,
  projectDir?: string,
  availableAgentIds?: readonly string[] | Record<string, unknown>,
): string {
  const resolved = resolveAgentId(role, { availableAgentIds });
  const normalizedRole = normalizeAgentRole(resolved.agentId) ?? "orchestrator";

  if (projectDir) {
    const effective = getEffectiveModelMap(projectDir);
    return (
      effective[normalizedRole] ?? DEFAULT_MODEL_MAP[normalizedRole] ?? DEFAULT_MODEL_MAP.orchestrator
    );
  }
  return DEFAULT_MODEL_MAP[normalizedRole] ?? DEFAULT_MODEL_MAP.orchestrator;
}

// ---------------------------------------------------------------------------
// Resolve model for an executor tier
// ---------------------------------------------------------------------------

/**
 * Resolve the effective model for an executor tier.
 *
 * Maps the tier to its corresponding `executor-{tier}` agent role and
 * delegates to `resolveModelForRole`.
 *
 * @param tier       - The executor tier (e.g. "low", "frontend-high").
 * @param projectDir - Optional project directory for config-based overrides.
 * @returns The resolved model identifier string.
 */
export function resolveModelForTier(tier: ExecutorTier, projectDir?: string): string {
  const role = `executor-${tier}` as AgentRole;
  return resolveModelForRole(role, projectDir);
}

// ---------------------------------------------------------------------------
// Fallback helper
// ---------------------------------------------------------------------------

/**
 * Select the preferred model if it appears in the available list,
 * otherwise return the first available model, or the preferred model
 * as a last resort when the available list is empty.
 *
 * @param preferred  - The model the agent prefers.
 * @param available  - Models currently available in the environment.
 * @returns The best model to use.
 */
export function withFallback(preferred: string, available: readonly string[]): string {
  if (available.length === 0) {
    return preferred;
  }
  if (available.includes(preferred)) {
    return preferred;
  }
  return available[0];
}

// ---------------------------------------------------------------------------
// Build preference map
// ---------------------------------------------------------------------------

/**
 * Build a full `AgentModelPreference` map for all 13 roles.
 *
 * Each entry contains the effective preferred model (from config chain)
 * and the built-in default as fallback (when they differ).
 *
 * @param projectDir - Optional project directory for config-based overrides.
 * @returns A record mapping every agent role to its model preference.
 */
export function buildModelPreferenceMap(
  projectDir?: string,
): Record<AgentRole, AgentModelPreference> {
  const effective = projectDir ? getEffectiveModelMap(projectDir) : { ...DEFAULT_MODEL_MAP };

  const result = {} as Record<AgentRole, AgentModelPreference>;
  for (const role of AGENT_ROLES) {
    const preferred = effective[role] ?? DEFAULT_MODEL_MAP[role];
    const builtIn = DEFAULT_MODEL_MAP[role];
    result[role] = {
      preferred,
      fallback: preferred !== builtIn ? builtIn : undefined,
    };
  }
  return result;
}
