/**
 * Registry cleanup utilities for team coordination.
 * @module features/team/cleanup
 */

import { getRegistry, deregisterAgent } from "./registry.js";
import { log } from "../../shared/logger.js";

const DEFAULT_MAX_AGE_MS = 30 * 60 * 1000;

export interface CleanupResult {
  cleaned: string[];
  remaining: number;
}

export async function cleanupStaleAgents(
  maxAgeMs: number = DEFAULT_MAX_AGE_MS
): Promise<CleanupResult> {
  const registry = await getRegistry();
  const now = Date.now();
  const cleaned: string[] = [];

  for (const [agentId, agent] of Object.entries(registry.agents)) {
    const age = now - agent.startedAt;
    const threshold = agent.ttl ?? maxAgeMs;

    if (age > threshold) {
      log(
        `Cleaning up stale agent: ${agentId} (age: ${age}ms, threshold: ${threshold}ms)`
      );
      await deregisterAgent(agentId);
      cleaned.push(agentId);
    }
  }

  const updatedRegistry = await getRegistry();
  return {
    cleaned,
    remaining: Object.keys(updatedRegistry.agents).length,
  };
}

export async function cleanupAllAgents(): Promise<CleanupResult> {
  const registry = await getRegistry();
  const cleaned: string[] = [];

  for (const agentId of Object.keys(registry.agents)) {
    log(`Cleaning up agent: ${agentId}`);
    await deregisterAgent(agentId);
    cleaned.push(agentId);
  }

  return { cleaned, remaining: 0 };
}

export async function getStaleAgentCount(
  maxAgeMs: number = DEFAULT_MAX_AGE_MS
): Promise<number> {
  const registry = await getRegistry();
  const now = Date.now();
  let count = 0;

  for (const agent of Object.values(registry.agents)) {
    const age = now - agent.startedAt;
    const threshold = agent.ttl ?? maxAgeMs;
    if (age > threshold) count++;
  }

  return count;
}
