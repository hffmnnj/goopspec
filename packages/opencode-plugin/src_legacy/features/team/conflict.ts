/**
 * Conflict detection utilities for team coordination.
 * Detects when agents try to write to files claimed by other agents.
 */

import { getRegistry } from "./registry.js";
import { generateAgentFilePath } from "./file-patterns.js";
import type { AgentRegistration } from "./types.js";

export interface ConflictInfo {
  hasConflict: boolean;
  claimedBy?: {
    agentId: string;
    agentType: string;
    task: string;
  };
  suggestedPath?: string;
  warningMessage?: string;
}

const buildConflictInfo = (
  agentId: string,
  agent: AgentRegistration,
  suggestedPath: string
): ConflictInfo => {
  const claimedBy = {
    agentId,
    agentType: agent.type,
    task: agent.task,
  };

  const conflict: ConflictInfo = {
    hasConflict: true,
    claimedBy,
    suggestedPath,
  };

  return {
    ...conflict,
    warningMessage: generateConflictWarning(conflict),
  };
};

/**
 * Check if a file is claimed by another agent.
 */
export async function checkFileConflict(
  filePath: string,
  requestingAgentId: string
): Promise<ConflictInfo> {
  const registry = await getRegistry();

  for (const [agentId, agent] of Object.entries(registry.agents)) {
    if (!agent.claimedFiles?.includes(filePath)) {
      continue;
    }

    if (agentId === requestingAgentId) {
      return { hasConflict: false };
    }

    const suggestedPath = suggestAgentFilePath(filePath, requestingAgentId);
    return buildConflictInfo(agentId, agent, suggestedPath);
  }

  return { hasConflict: false };
}

/**
 * Suggest a per-agent file path to avoid conflicts.
 */
export function suggestAgentFilePath(filePath: string, agentId: string): string {
  return generateAgentFilePath(filePath, agentId);
}

/**
 * Generate a human-readable conflict warning message.
 */
export function generateConflictWarning(conflict: ConflictInfo): string {
  if (!conflict.hasConflict || !conflict.claimedBy) {
    return "";
  }

  const { agentId, agentType, task } = conflict.claimedBy;
  const suggestedPath = conflict.suggestedPath ?? "";
  const lines = [
    "WARNING: File Conflict Detected",
    "",
    "The file you're trying to write is claimed by another agent:",
    `- Agent: ${agentId} (${agentType})`,
    `- Task: ${task}`,
    "",
    "Suggested action: Write to your per-agent file instead:",
    `→ ${suggestedPath}`,
  ];

  return lines.join("\n");
}
