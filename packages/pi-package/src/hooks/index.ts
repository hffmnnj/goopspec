/**
 * Hook registration — wires GoopSpec lifecycle hooks into Pi's event system.
 *
 * Registers:
 * - `before_agent_start` — phase context injection
 * - `tool_call` — spec-lock enforcement
 */

import { PI_EVENTS } from "../core/constants.js";
import type { GoopPiContext } from "../core/types.js";
import { createPhaseContextHook } from "./phase-context.js";
import { createSpecLockGuardHook } from "./spec-lock-guard.js";

export type EventRegistrar = {
	on: (event: string, handler: (...args: unknown[]) => unknown) => void;
};

export function registerHooks(pi: EventRegistrar, ctx: GoopPiContext): void {
	pi.on(
		PI_EVENTS.BEFORE_AGENT_START,
		createPhaseContextHook(ctx) as (...args: unknown[]) => unknown,
	);
	pi.on(
		PI_EVENTS.TOOL_CALL,
		createSpecLockGuardHook(ctx) as (...args: unknown[]) => unknown,
	);
}

export { createPhaseContextHook, createSpecLockGuardHook };
