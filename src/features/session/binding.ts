import type { PluginContext, StateManager } from "../../core/types.js";
import { ensureSessionDir } from "../../shared/paths.js";
import { logError } from "../../shared/logger.js";
import { createStateManager } from "../state-manager/manager.js";
import { validateSessionId } from "./types.js";

function getProjectName(ctx: PluginContext): string {
  return ctx.config.projectName || ctx.input.project.name;
}

function createBoundStateManager(
  ctx: PluginContext,
  sessionId?: string,
  workflowId?: string,
): StateManager {
  return createStateManager(
    ctx.input.directory,
    getProjectName(ctx),
    ctx.config,
    sessionId,
    workflowId,
  );
}

export function setSession(ctx: PluginContext, sessionId: string, workflowId?: string): void {
  if (!validateSessionId(sessionId)) {
    throw new Error(`Invalid session ID: ${sessionId}`);
  }

  ctx.stateManager = createBoundStateManager(ctx, sessionId, workflowId);
  ctx.sessionId = sessionId;
  ctx.workflowId = workflowId;

  void ensureSessionDir(ctx.input.directory, sessionId).catch((error) => {
    logError(`Failed to ensure session directory for ${sessionId}`, error);
  });
}

/**
 * Change the active workflow for this context without changing the session.
 * Recreates the state manager scoped to the new workflow.
 */
export function setWorkflow(ctx: PluginContext, workflowId: string): void {
  ctx.workflowId = workflowId;
  ctx.stateManager = createBoundStateManager(ctx, ctx.sessionId, workflowId);
}

/**
 * Get the active workflow ID from context.
 * Falls back to "default" if no workflow is bound.
 */
export function getActiveWorkflowId(ctx: PluginContext): string {
  return ctx.workflowId ?? ctx.stateManager.getActiveWorkflowId?.() ?? "default";
}

export function clearSession(ctx: PluginContext): void {
  ctx.stateManager = createBoundStateManager(ctx);
  ctx.sessionId = undefined;
  ctx.workflowId = undefined;
}
