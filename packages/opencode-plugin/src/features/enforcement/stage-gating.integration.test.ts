/**
 * Stage-gated verification lifecycle — end-to-end integration proof.
 *
 * Wave 5 Task 1 (wave-verifier-gating). Unit tests already cover each seam
 * (registration, the dispatch guard, the wave-completion gate, the
 * auto-progression gate, the acceptance audit) in isolation. This file wires
 * them together through their real production entry points — the same
 * `PluginContext`, the same `GoopSpecDB`, the same `goop_write_wave` tool,
 * the same merged `createHooks` pipeline, the same `registerHooksV2`
 * adapter — to prove the *connected* path holds, not just its parts.
 *
 * Sequence (one flowing scenario, `it` blocks run in declaration order and
 * share state through the describe-scoped `ctx`):
 *   1. goop-wave-verifier registers through the V1 config hook and the V2
 *      agent/catalog transform adapter (shared AGENT_ROLES-derived path).
 *   2. In execute phase, the real merged `tool.execute.before` guard permits
 *      goop-wave-verifier and blocks goop-verifier.                    (MH5)
 *   3. All wave 1 tasks complete, but completion is blocked with zero
 *      verification rows.                                              (MH2)
 *   4. A recorded fail row keeps completion blocked.                   (MH2)
 *   5. Remediation is represented without dispatching a subagent; a later
 *      pass row for the SAME check_name supersedes the fail row and
 *      completion succeeds — proving latest-per-check semantics.   (MH2, MH7)
 *   6. Wave 1 is the final wave, so its completion (with verification
 *      evidence) permits the real auto-progression hook to advance
 *      execute → accept.                                               (MH2)
 *   7. In accept phase, the same merged guard flips: goop-verifier is
 *      permitted, goop-wave-verifier is blocked.                   (MH4, MH5)
 *   8. `goop_acceptance_audit` surfaces the wave's verification rows,
 *      including both the historical fail row and the pass row that
 *      superseded it (append-only evidence).                       (MH2, MH7)
 *
 * @module features/enforcement/stage-gating.integration.test
 */

import { afterAll, beforeAll, describe, expect, it } from "bun:test";

import { registerHooksV2 } from "../../core/hooks-v2.js";
import type { SdkConfig, ToolResult } from "../../core/sdk-compat.js";
import type {
	V2AgentDraft,
	V2AgentInfo,
	V2CatalogDraft,
	V2RuntimeContext,
	V2SessionRequestEvent,
	V2ToolExecuteAfterEvent,
	V2ToolExecuteBeforeEvent,
} from "../../core/v2-compat.js";
import { createAgentRegistrationHook } from "../../hooks/agent-registration.js";
import { createAutoProgressionHook } from "../../hooks/auto-progression.js";
import { DEFAULT_HOOK_FACTORIES, createHooks } from "../../hooks/index.js";
import type { Hooks } from "../../hooks/types.js";
import { IntentionalToolDenialError } from "../../hooks/utils.js";
import {
	type PluginContext,
	createDefaultWorkflowState,
	createMockPluginContext,
	createMockToolContext,
	setupTestEnvironment,
} from "../../test-utils.js";
import { createGoopAcceptanceAuditTool } from "../../tools/goop-acceptance-audit/index.js";
import { createGoopWriteWaveTool } from "../../tools/goop-write-wave/index.js";

// ---------------------------------------------------------------------------
// Test-local helpers
// ---------------------------------------------------------------------------

function taskArgs(subagentType: string): { args: Record<string, unknown> } {
	return {
		args: { description: "d", prompt: "p", subagent_type: subagentType },
	};
}

/** Extracts the `<!-- JSON -->` envelope goop_acceptance_audit returns. */
function parseAuditEnvelope(result: ToolResult | string): {
	blockers: string;
	verifications: string;
	waves: string;
} {
	const text = typeof result === "string" ? result : result.output;
	const match = text.match(/<!--\n([\s\S]*?)\n-->/);
	if (!match) {
		throw new Error(
			`goop_acceptance_audit did not return the expected JSON envelope: ${text}`,
		);
	}
	return JSON.parse(match[1]);
}

interface V2Registrations {
	agentTransform?: (draft: V2AgentDraft) => void | Promise<void>;
	catalogTransform?: (draft: V2CatalogDraft) => void | Promise<void>;
}

/**
 * Minimal real-shaped V2 runtime stub. Mirrors `createRuntimeContext` in
 * `core/hooks-v2.test.ts`: session/tool capture the request and tool hooks so
 * `registerHooksV2` runs its full registration path without throwing, while
 * agent/catalog capture their transform callbacks so this test can invoke
 * them directly with the exact draft under scrutiny.
 */
function createV2RuntimeStub(registrations: V2Registrations): V2RuntimeContext {
	return {
		session: {
			create: async () => ({}),
			get: async () => ({}),
			prompt: async () => ({}),
			command: async () => ({}),
			synthetic: async () => ({}),
			interrupt: async () => ({}),
			hook: async (
				_event: "request",
				_callback: (event: V2SessionRequestEvent) => void | Promise<void>,
			) => {},
		},
		tool: {
			transform: async () => {},
			hook: async (
				_event: "execute.before" | "execute.after",
				_callback:
					| ((event: V2ToolExecuteBeforeEvent) => void | Promise<void>)
					| ((event: V2ToolExecuteAfterEvent) => void | Promise<void>),
			) => {},
		},
		agent: {
			transform: async (
				callback: (draft: V2AgentDraft) => void | Promise<void>,
			) => {
				registrations.agentTransform = callback;
			},
			reload: async () => {},
		},
		catalog: {
			transform: async (
				callback: (draft: V2CatalogDraft) => void | Promise<void>,
			) => {
				registrations.catalogTransform = callback;
			},
			reload: async () => {},
		},
	} as unknown as V2RuntimeContext;
}

// ---------------------------------------------------------------------------
// Scenario
// ---------------------------------------------------------------------------

describe("stage-gated verification lifecycle (integration)", () => {
	let cleanup: () => void;
	let ctx: PluginContext;
	let originalGlobalConfigPath: string | undefined;

	beforeAll(() => {
		const env = setupTestEnvironment("stage-gating-lifecycle");
		cleanup = env.cleanup;

		// Isolate from any real ~/.config/opencode/goopspec.json on the host
		// machine so thinking-level and model-override assertions stay
		// deterministic regardless of what is configured outside this repo.
		originalGlobalConfigPath = process.env.GOOPSPEC_GLOBAL_CONFIG_PATH;
		process.env.GOOPSPEC_GLOBAL_CONFIG_PATH = `${env.testDir}/no-global-config.json`;

		ctx = createMockPluginContext({
			testDir: env.testDir,
			db: env.db,
			state: {
				workflows: {
					default: createDefaultWorkflowState({
						phase: "execute",
						currentWave: 1,
						totalWaves: 1,
						specLocked: true,
						autopilot: true,
					}),
				},
			},
		});
	});

	afterAll(() => {
		if (originalGlobalConfigPath === undefined) {
			Reflect.deleteProperty(process.env, "GOOPSPEC_GLOBAL_CONFIG_PATH");
		} else {
			process.env.GOOPSPEC_GLOBAL_CONFIG_PATH = originalGlobalConfigPath;
		}
		cleanup();
	});

	// -------------------------------------------------------------------------
	// 1. Registration — V1 config hook + V2 agent/catalog transform adapter
	// -------------------------------------------------------------------------

	it("1. goop-wave-verifier registers through both the V1 and V2 shared registration paths", async () => {
		// V1: the real config hook loads agents/goop-wave-verifier.md from the
		// package's bundled roster and injects it into config.agent.
		const v1Hooks = createAgentRegistrationHook(ctx);
		const config: SdkConfig = {};
		await v1Hooks.config?.(config);

		expect(config.agent?.["goop-wave-verifier"]).toBeDefined();
		expect(config.agent?.["goop-wave-verifier"]?.model).toBeTruthy();

		// V2: the real registerHooksV2 adapter registers a thinking-level agent
		// transform that recognises "wave-verifier" through the shared
		// AGENT_ROLES registry (getGoopRole) — the same registry the V1 path
		// used above — and resolves it to a live catalog variant.
		const registrations: V2Registrations = {};
		await registerHooksV2(createV2RuntimeStub(registrations), ctx);

		const agent: V2AgentInfo = {
			id: "goop-wave-verifier",
			model: { providerID: "anthropic", id: "claude-sonnet-4-6" },
			request: { headers: {}, body: {} },
		};
		const catalog: V2CatalogDraft = {
			provider: {
				list: () => [
					{
						provider: { id: "anthropic" },
						models: new Map([
							[
								"claude-sonnet-4-6",
								{
									variants: [
										{
											id: "low",
											headers: {},
											body: { reasoning_effort: "low" },
										},
										{
											id: "high",
											headers: { "x-reasoning": "high" },
											body: { reasoning_effort: "high" },
										},
									],
								},
							],
						]),
					},
				],
			},
		};
		const agentDraft: V2AgentDraft = {
			list: () => [agent],
			update: (_id, update) => update(agent),
		};

		await registrations.catalogTransform?.(catalog);
		await registrations.agentTransform?.(agentDraft);

		// wave-verifier is not an explorer/researcher role, so its resolved
		// default thinking level is "high" — proving getGoopRole recognised it
		// via the shared registry rather than a role-specific special case.
		expect(agent.model?.variant).toBe("high");
		expect(agent.request.body).toEqual({ reasoning_effort: "high" });
	});

	// -------------------------------------------------------------------------
	// 2. Execute-phase dispatch guard (real merged tool.execute.before chain)
	// -------------------------------------------------------------------------

	it("2. in execute phase, the merged guard permits goop-wave-verifier and blocks goop-verifier", async () => {
		expect(ctx.stateManager.getActiveWorkflow().phase).toBe("execute");

		const hooks = createHooks(ctx, [...DEFAULT_HOOK_FACTORIES]);
		const guardHandler = hooks["tool.execute.before"];
		if (!guardHandler)
			throw new Error("merged tool.execute.before not defined");

		await expect(
			guardHandler(
				{ tool: "task", sessionID: "s1", callID: "c1" },
				taskArgs("goop-wave-verifier"),
			),
		).resolves.toBeUndefined();

		await expect(
			guardHandler(
				{ tool: "task", sessionID: "s1", callID: "c2" },
				taskArgs("goop-verifier"),
			),
		).rejects.toThrow(IntentionalToolDenialError);
	});

	// -------------------------------------------------------------------------
	// 3. Tasks complete, but completion is blocked with zero verification rows
	// -------------------------------------------------------------------------

	it("3. wave 1 tasks complete, but completion is blocked without a verification row", async () => {
		const writeWaveTool = createGoopWriteWaveTool(ctx);
		const toolCtx = createMockToolContext();

		const created = await writeWaveTool.execute(
			{
				wave_number: 1,
				title: "Wave 1: stage-gated lifecycle proof",
				status: "in_progress",
				tasks: [
					{
						task_index: 1,
						description: "Implement the seam",
						agent: "executor-high",
					},
					{
						task_index: 2,
						description: "Wire the tests",
						agent: "executor-high",
					},
				],
			},
			toolCtx,
		);
		expect(created).toContain("Written wave 1");

		const tasksDone = await writeWaveTool.execute(
			{
				wave_number: 1,
				task_updates: [
					{ task_index: 1, status: "done" },
					{ task_index: 2, status: "done" },
				],
			},
			toolCtx,
		);
		expect(tasksDone).toContain("updated task 1 to done");
		expect(tasksDone).toContain("updated task 2 to done");

		const blockedCompletion = await writeWaveTool.execute(
			{ wave_number: 1, status: "done" },
			toolCtx,
		);
		expect(blockedCompletion).toContain("Error in goop_write_wave");
		expect(blockedCompletion).toContain("cannot be marked complete");
		expect(blockedCompletion).toContain("goop-wave-verifier");

		// The denial threw inside the same DB transaction as the status write,
		// so the whole attempt rolled back — the wave is still in_progress, not
		// half-completed.
		const waveAfterBlock = ctx.db.getWave("default", 1);
		expect(waveAfterBlock?.status).toBe("in_progress");
	});

	// -------------------------------------------------------------------------
	// 4. A fail verification row keeps completion blocked
	// -------------------------------------------------------------------------

	it("4. a recorded fail verification row keeps completion blocked", async () => {
		const writeWaveTool = createGoopWriteWaveTool(ctx);
		const toolCtx = createMockToolContext();

		const failRecorded = await writeWaveTool.execute(
			{
				wave_number: 1,
				verifications: [
					{ check_name: "test", status: "fail", detail: "3 failing specs" },
				],
			},
			toolCtx,
		);
		expect(failRecorded).toContain(
			"Recorded test=fail verification for wave 1",
		);

		const stillBlocked = await writeWaveTool.execute(
			{ wave_number: 1, status: "done" },
			toolCtx,
		);
		expect(stillBlocked).toContain("Error in goop_write_wave");
		expect(stillBlocked).toContain("cannot be marked complete");

		const waveStillBlocked = ctx.db.getWave("default", 1);
		expect(waveStillBlocked?.status).toBe("in_progress");
	});

	// -------------------------------------------------------------------------
	// 5. Remediation (no subagent dispatch here) + a later pass row unblocks
	//    completion via latest-per-check semantics
	// -------------------------------------------------------------------------

	it("5. remediation is represented without dispatching a subagent, and a later pass row for the same check unblocks completion", async () => {
		// Real remediation happens via a `task()` dispatch to a goop-executor-*
		// subagent in production. This test does not perform that dispatch — it
		// records the same durable evidence a real remediation turn would leave
		// behind (an ADL observation), then proceeds to the re-verification the
		// remediation would trigger.
		ctx.stateManager.appendADL({
			timestamp: new Date().toISOString(),
			type: "observation",
			description:
				"Executor remediation for wave 1 check 'test': fixed the 3 failing specs flagged above.",
			action:
				"Represents goop-executor-* remediation; re-verification recorded as a new row.",
		});
		expect(ctx.stateManager.getADL()).toContain(
			"Executor remediation for wave 1",
		);

		const writeWaveTool = createGoopWriteWaveTool(ctx);
		const toolCtx = createMockToolContext();

		const passRecorded = await writeWaveTool.execute(
			{
				wave_number: 1,
				verifications: [
					{
						check_name: "test",
						status: "pass",
						detail: "3/3 specs green after remediation",
					},
				],
			},
			toolCtx,
		);
		expect(passRecorded).toContain(
			"Recorded test=pass verification for wave 1",
		);

		const completed = await writeWaveTool.execute(
			{ wave_number: 1, status: "done" },
			toolCtx,
		);
		expect(completed).not.toContain("Error in goop_write_wave");
		expect(completed).toContain("Written wave 1");

		const waveAfterCompletion = ctx.db.getWave("default", 1);
		expect(waveAfterCompletion?.status).toBe("done");
		if (!waveAfterCompletion)
			throw new Error("wave 1 not found after completion");

		// Append-only: both the earlier fail row and the later pass row for the
		// SAME check_name ("test") persist — nothing was deleted or overwritten.
		// The gate is satisfied because the pass row is the latest by id.
		const rows = ctx.db.getVerifications("default", waveAfterCompletion.id);
		const testRows = rows.filter((row) => row.check_name === "test");
		expect(testRows).toHaveLength(2);
		expect(testRows.map((row) => row.status).sort()).toEqual([
			"failed",
			"passed",
		]);
	});

	// -------------------------------------------------------------------------
	// 6. Final-wave completion permits the real execute → accept transition
	// -------------------------------------------------------------------------

	it("6. final-wave completion with verification evidence permits execute → accept auto-progression", async () => {
		const autoProgressionHooks = createAutoProgressionHook(ctx);
		const afterHandler = autoProgressionHooks[
			"tool.execute.after"
		] as NonNullable<Hooks["tool.execute.after"]>;

		const progressionOutput = { title: "result", output: "ok", metadata: {} };
		await afterHandler(
			{ tool: "goop_write_wave", sessionID: "s1", callID: "c3", args: {} },
			progressionOutput,
		);

		expect(ctx.stateManager.getActiveWorkflow().phase).toBe("accept");
		expect(progressionOutput.output).toContain(
			"Auto-Progression: execute → accept",
		);
	});

	// -------------------------------------------------------------------------
	// 7. Accept-phase dispatch guard flips: verifier permitted, wave-verifier blocked
	// -------------------------------------------------------------------------

	it("7. in accept phase, the merged guard permits goop-verifier and blocks goop-wave-verifier", async () => {
		expect(ctx.stateManager.getActiveWorkflow().phase).toBe("accept");

		const hooks = createHooks(ctx, [...DEFAULT_HOOK_FACTORIES]);
		const guardHandler = hooks["tool.execute.before"];
		if (!guardHandler)
			throw new Error("merged tool.execute.before not defined");

		await expect(
			guardHandler(
				{ tool: "task", sessionID: "s1", callID: "c4" },
				taskArgs("goop-verifier"),
			),
		).resolves.toBeUndefined();

		await expect(
			guardHandler(
				{ tool: "task", sessionID: "s1", callID: "c5" },
				taskArgs("goop-wave-verifier"),
			),
		).rejects.toThrow(IntentionalToolDenialError);
	});

	// -------------------------------------------------------------------------
	// 8. goop_acceptance_audit surfaces the append-only verification history
	// -------------------------------------------------------------------------

	it("8. goop_acceptance_audit surfaces per-wave verification rows, including the append-only fail/pass history", async () => {
		const auditTool = createGoopAcceptanceAuditTool(ctx);
		const toolCtx = createMockToolContext();

		const auditResult = await auditTool.execute({}, toolCtx);
		const parsed = parseAuditEnvelope(auditResult);

		// Both the historical fail row and the pass row that superseded it are
		// present — the audit never collapses history to only the effective row.
		expect(parsed.verifications).toContain("test: failed");
		expect(parsed.verifications).toContain("test: passed");
		expect(parsed.verifications).toContain("Status: 1 failing");

		// The wave itself renders as done, with its own verification section
		// repeating the same append-only history for a second, independent
		// confirmation source.
		expect(parsed.waves).toContain(
			"## Wave 1: Wave 1: stage-gated lifecycle proof",
		);
		expect(parsed.waves).toContain("- status: done");
		expect(parsed.waves).toContain("- test: failed");
		expect(parsed.waves).toContain("- test: passed");
	});
});
