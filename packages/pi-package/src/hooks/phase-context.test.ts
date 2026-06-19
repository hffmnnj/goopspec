import { afterEach, describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { GoopPiContext } from "../core/types.js";
import { StateManager } from "../features/state/index.js";
import { createPhaseContextHook } from "./phase-context.js";

function makeCtx(): { ctx: GoopPiContext; tmpDir: string } {
	const tmpDir = path.join(
		os.tmpdir(),
		`pch-${Date.now()}-${Math.random().toString(36).slice(2)}`,
	);
	fs.mkdirSync(tmpDir, { recursive: true });
	const ctx: GoopPiContext = {
		projectDir: tmpDir,
		runtime: "pi",
		dbPath: path.join(tmpDir, ".goopspec", "goopspec.db"),
		goopspecDir: path.join(tmpDir, ".goopspec"),
	};
	return { ctx, tmpDir };
}

describe("phase-context hook", () => {
	let tmpDir: string;

	afterEach(() => {
		if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	it("injects systemPromptAddition with workflow context", async () => {
		const { ctx, tmpDir: td } = makeCtx();
		tmpDir = td;
		const sm = new StateManager(tmpDir);
		sm.createWorkflow("default");
		sm.setActiveWorkflowId("default");
		sm.close();
		const hook = createPhaseContextHook(ctx);
		const piCtx: { projectDir: string; systemPromptAddition?: string } = {
			projectDir: tmpDir,
		};
		await hook(piCtx);
		expect(piCtx.systemPromptAddition).toContain("GoopSpec Workflow Context");
		expect(piCtx.systemPromptAddition).toContain("discuss");
	});

	it("shows LOCKED when spec is locked", async () => {
		const { ctx, tmpDir: td } = makeCtx();
		tmpDir = td;
		const sm = new StateManager(tmpDir);
		sm.createWorkflow("default");
		sm.setActiveWorkflowId("default");
		sm.lockSpec("default");
		sm.close();
		const hook = createPhaseContextHook(ctx);
		const piCtx: { projectDir: string; systemPromptAddition?: string } = {
			projectDir: tmpDir,
		};
		await hook(piCtx);
		expect(piCtx.systemPromptAddition).toContain("LOCKED");
	});

	it("includes plan-phase guidance when in plan phase", async () => {
		const { ctx, tmpDir: td } = makeCtx();
		tmpDir = td;
		const sm = new StateManager(tmpDir);
		sm.createWorkflow("default");
		sm.setActiveWorkflowId("default");
		sm.transitionPhase("default", "plan");
		sm.close();
		const hook = createPhaseContextHook(ctx);
		const piCtx: { projectDir: string; systemPromptAddition?: string } = {
			projectDir: tmpDir,
		};
		await hook(piCtx);
		expect(piCtx.systemPromptAddition).toContain("SPEC.md");
	});

	it("includes wave info when totalWaves > 0", async () => {
		const { ctx, tmpDir: td } = makeCtx();
		tmpDir = td;
		const sm = new StateManager(tmpDir);
		sm.createWorkflow("default");
		sm.setActiveWorkflowId("default");
		sm.transitionPhase("default", "plan");
		sm.transitionPhase("default", "execute");
		sm.updateWave("default", 2, 5);
		sm.close();
		const hook = createPhaseContextHook(ctx);
		const piCtx: { projectDir: string; systemPromptAddition?: string } = {
			projectDir: tmpDir,
		};
		await hook(piCtx);
		expect(piCtx.systemPromptAddition).toContain("**Wave:** 2/5");
	});

	it("includes autopilot info when enabled", async () => {
		const { ctx, tmpDir: td } = makeCtx();
		tmpDir = td;
		const sm = new StateManager(tmpDir);
		sm.createWorkflow("default");
		sm.setActiveWorkflowId("default");
		sm.setAutopilot("default", true, true);
		sm.close();
		const hook = createPhaseContextHook(ctx);
		const piCtx: { projectDir: string; systemPromptAddition?: string } = {
			projectDir: tmpDir,
		};
		await hook(piCtx);
		expect(piCtx.systemPromptAddition).toContain("Autopilot");
		expect(piCtx.systemPromptAddition).toContain("lazy");
	});

	it("does not throw when projectDir is invalid", async () => {
		const { ctx, tmpDir: td } = makeCtx();
		tmpDir = td;
		const hook = createPhaseContextHook(ctx);
		const piCtx: { projectDir: string; systemPromptAddition?: string } = {
			projectDir: "/dev/null/impossible-path",
		};
		// Should not throw — graceful degradation via catch block
		await hook(piCtx);
		expect(piCtx.systemPromptAddition).toBeUndefined();
	});
});
