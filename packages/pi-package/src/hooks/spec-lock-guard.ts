/**
 * Spec Lock Guard Hook — blocks write/edit tools during locked plan phase.
 *
 * Fires on Pi's `tool_call` event. When the spec is locked and the phase
 * is `plan`, returns `{ block: true, reason }` for write-capable tools.
 * All other cases pass through silently.
 */

import type { GoopPiContext } from "../core/types.js";
import { StateManager } from "../features/state/index.js";
import { logError } from "../shared/logger.js";

const WRITE_TOOL_NAMES = new Set(["write", "edit", "bash", "multiedit"]);

export type ToolCallContext = {
	projectDir: string;
	toolName?: string;
	[key: string]: unknown;
};

export type ToolCallResult = { block?: boolean; reason?: string };
export type ToolCallHandler = (
	ctx: ToolCallContext,
) => Promise<ToolCallResult | undefined> | ToolCallResult | undefined;

export function createSpecLockGuardHook(_ctx: GoopPiContext): ToolCallHandler {
	return async (piCtx) => {
		const toolName = piCtx.toolName?.toLowerCase() ?? "";
		if (!WRITE_TOOL_NAMES.has(toolName)) return;
		let sm: StateManager | undefined;
		try {
			sm = new StateManager(piCtx.projectDir);
			const workflowId = sm.getActiveWorkflowId();
			const state = sm.getState(workflowId);
			if (state.phase === "plan" && state.specLocked) {
				return {
					block: true,
					reason: `[GoopSpec] Spec is locked during 'plan' phase. Use /goop-execute to begin implementation.`,
				};
			}
			return;
		} catch (error) {
			logError("spec-lock-guard hook failed", error);
			return;
		} finally {
			sm?.close();
		}
	};
}
