/**
 * Command-Processor Hook — intercepts GoopSpec slash commands via
 * `command.execute.before` to ensure reliable session→workflow binding
 * and inject lightweight context priming.
 *
 * Fixes the 0.2.x stale-binding bug where slash commands resolved to
 * the wrong workflow. Uses `command.execute.before` (not tool.execute.after)
 * because it fires before the command runs and can inject parts directly.
 *
 * @module hooks/command-processor
 */

import type { SdkPart } from "../core/sdk-compat.js";
import type { PluginContext } from "../core/types.js";
import type { HookFactory, Hooks } from "./types.js";
import { safeHandler } from "./utils.js";

const GOOPSPEC_COMMAND_PREFIX = "goop-";

/** Detect whether a command name is a GoopSpec command (goop-*). */
export function isGoopspecCommand(command: string): boolean {
	if (!command) return false;
	return command.toLowerCase().startsWith(GOOPSPEC_COMMAND_PREFIX);
}

/** Compact context line for injection into command output. */
export function buildPrimingText(workflowId: string, phase: string): string {
	return `[GoopSpec] Active workflow: ${workflowId} | Phase: ${phase}`;
}

function createTextPart(sessionId: string, text: string): SdkPart {
	return {
		id: `goopspec-primer-${Date.now()}`,
		sessionID: sessionId,
		messageID: "goopspec-command-processor",
		type: "text" as const,
		text,
	} as SdkPart;
}

/**
 * Ensure the stateManager's active workflow matches the session's
 * intended workflow. If the session has no explicit binding or the
 * target workflow doesn't exist, leave the current active workflow as-is.
 */
function ensureWorkflowBinding(ctx: PluginContext, _sessionId: string): void {
	const sessionWorkflowId = ctx.session.workflowId;
	if (!sessionWorkflowId) return;

	const currentActiveId = ctx.stateManager.getActiveWorkflowId();
	if (currentActiveId === sessionWorkflowId) return;

	const targetWorkflow = ctx.stateManager.getWorkflow(sessionWorkflowId);
	if (!targetWorkflow) return;

	try {
		ctx.stateManager.setActiveWorkflow(sessionWorkflowId);
	} catch {
		// Graceful: workflow may have been removed between check and switch.
	}
}

/**
 * Create the command-processor hook.
 *
 * On `command.execute.before` for GoopSpec commands:
 * 1. Syncs the stateManager's active workflow with the session binding
 * 2. Injects a priming text part with workflow/phase context
 *
 * Non-GoopSpec commands are ignored. Never throws.
 */
export const createCommandProcessorHook: HookFactory = (
	ctx: PluginContext,
): Partial<Hooks> => {
	const handler: NonNullable<Hooks["command.execute.before"]> = async (
		input,
		output,
	) => {
		const { command, sessionID } = input;

		if (!isGoopspecCommand(command)) return;

		ensureWorkflowBinding(ctx, sessionID);

		const workflow = ctx.stateManager.getActiveWorkflow();
		const workflowId = ctx.stateManager.getActiveWorkflowId();
		const primingText = buildPrimingText(workflowId, workflow.phase);
		output.parts.push(createTextPart(sessionID, primingText));
	};

	return {
		"command.execute.before": safeHandler("command-processor", handler),
	};
};

export { createCommandProcessorHook as commandProcessorFactory };
