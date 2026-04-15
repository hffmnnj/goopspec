/**
 * Type definitions for the agent registry.
 *
 * @module features/team/types
 */

export interface AgentRegistration {
  /**
   * Unique agent identifier.
   */
  id: string;

  /**
   * Agent type (e.g., goop-executor-high).
   */
  type: string;

  /**
   * Task description assigned to the agent.
   */
  task: string;

  /**
   * Files currently claimed by the agent.
   */
  claimedFiles: string[];

  /**
   * Parent agent ID, if spawned by another agent.
   */
  parentId?: string;

  /**
   * Registration start timestamp in milliseconds.
   */
  startedAt: number;

  /**
   * Optional time-to-live for cleanup, in milliseconds.
   */
  ttl?: number;
}

export interface AgentRegistry {
  /**
   * Registry schema version.
   */
  version: number;

  /**
   * Map of active agents keyed by agent ID.
   */
  agents: Record<string, AgentRegistration>;
}

export type RegistryOperationResult<T = AgentRegistry> =
  | { ok: true; registry: T }
  | { ok: false; error: string };
