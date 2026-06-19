/**
 * Phase Context Hook — injects GoopSpec workflow context into the system prompt.
 *
 * Fires on Pi's `before_agent_start` event. Reads the current workflow state
 * from the DB and appends phase-specific guidance to `systemPromptAddition`.
 */

import type { GoopPiContext } from "../core/types.js";
import { StateManager } from "../features/state/index.js";
import { logError } from "../shared/logger.js";

export type BeforeAgentStartHandler = (ctx: {
	projectDir: string;
	systemPromptAddition?: string;
	[key: string]: unknown;
}) => Promise<void> | void;

export function createPhaseContextHook(
	_ctx: GoopPiContext,
): BeforeAgentStartHandler {
	return async (piCtx) => {
		let sm: StateManager | undefined;
		try {
			sm = new StateManager(piCtx.projectDir);
			const workflowId = sm.getActiveWorkflowId();
			const state = sm.getState(workflowId);
			piCtx.systemPromptAddition = buildPhaseContext(state);
		} catch (error) {
			logError("phase-context hook failed", error);
		} finally {
			sm?.close();
		}
	};
}

function buildPhaseContext(state: {
	workflowId: string;
	phase: string;
	specLocked: boolean;
	interviewComplete: boolean;
	currentWave: number;
	totalWaves: number;
	autopilot: boolean;
	lazyAutopilot: boolean;
}): string {
	const lines = [
		"---",
		"## GoopSpec Workflow Context",
		`- **Workflow:** ${state.workflowId}`,
		`- **Phase:** ${state.phase}`,
		`- **Spec:** ${state.specLocked ? "[LOCKED] -- do not propose structural changes" : "[UNLOCKED]"}`,
		`- **Interview:** ${state.interviewComplete ? "Complete" : "Pending"}`,
	];
	if (state.totalWaves > 0)
		lines.push(`- **Wave:** ${state.currentWave}/${state.totalWaves}`);
	if (state.autopilot)
		lines.push(`- **Autopilot:** ON${state.lazyAutopilot ? " (lazy)" : ""}`);

	const guidance: Record<string, string> = {
		discuss:
			"Conduct discovery interview. Write REQUIREMENTS.md via goop_write_db when complete.",
		plan: "Create SPEC.md and BLUEPRINT.md. Lock spec via goop_state({ action: 'lock-spec' }).",
		execute: `Implement blueprint wave ${state.currentWave + 1}. Update chronicle via goop_write_db({ doc_type: 'chronicle', mode: 'append' }).`,
		accept:
			"Verify all must-haves are implemented. Present results and request user acceptance.",
		confirm: "Archive workflow and save learnings via goop_save_note.",
	};

	if (guidance[state.phase]) {
		lines.push("", `**Phase guidance:** ${guidance[state.phase]}`);
	}
	lines.push("---");
	return lines.join("\n");
}
