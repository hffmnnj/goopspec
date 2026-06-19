import { afterEach, describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { GoopPiContext } from "../core/types.js";
import { StateManager } from "../features/state/index.js";
import { createSpecLockGuardHook } from "./spec-lock-guard.js";

function makeCtx(): { ctx: GoopPiContext; tmpDir: string } {
	const tmpDir = path.join(
		os.tmpdir(),
		`slg-${Date.now()}-${Math.random().toString(36).slice(2)}`,
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

describe("spec-lock-guard hook", () => {
	let tmpDir: string;

	afterEach(() => {
		if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	it("allows non-write tools through", async () => {
		const { ctx, tmpDir: td } = makeCtx();
		tmpDir = td;
		const hook = createSpecLockGuardHook(ctx);
		const result = await hook({ projectDir: tmpDir, toolName: "goop_read_db" });
		expect(result).toBeUndefined();
	});

	it("allows write tools when phase is not plan", async () => {
		const { ctx, tmpDir: td } = makeCtx();
		tmpDir = td;
		const sm = new StateManager(tmpDir);
		sm.createWorkflow("default");
		sm.setActiveWorkflowId("default");
		sm.close();
		const hook = createSpecLockGuardHook(ctx);
		const result = await hook({ projectDir: tmpDir, toolName: "write" });
		expect(result).toBeUndefined();
	});

	it("blocks write during locked plan phase", async () => {
		const { ctx, tmpDir: td } = makeCtx();
		tmpDir = td;
		const sm = new StateManager(tmpDir);
		sm.createWorkflow("default");
		sm.setActiveWorkflowId("default");
		sm.transitionPhase("default", "plan");
		sm.lockSpec("default");
		sm.close();
		const hook = createSpecLockGuardHook(ctx);
		const result = await hook({ projectDir: tmpDir, toolName: "write" });
		expect(result?.block).toBe(true);
		expect(result?.reason).toContain("Spec is locked");
	});

	it("blocks edit during locked plan phase", async () => {
		const { ctx, tmpDir: td } = makeCtx();
		tmpDir = td;
		const sm = new StateManager(tmpDir);
		sm.createWorkflow("default");
		sm.setActiveWorkflowId("default");
		sm.transitionPhase("default", "plan");
		sm.lockSpec("default");
		sm.close();
		const hook = createSpecLockGuardHook(ctx);
		const result = await hook({ projectDir: tmpDir, toolName: "edit" });
		expect(result?.block).toBe(true);
	});

	it("blocks bash during locked plan phase", async () => {
		const { ctx, tmpDir: td } = makeCtx();
		tmpDir = td;
		const sm = new StateManager(tmpDir);
		sm.createWorkflow("default");
		sm.setActiveWorkflowId("default");
		sm.transitionPhase("default", "plan");
		sm.lockSpec("default");
		sm.close();
		const hook = createSpecLockGuardHook(ctx);
		const result = await hook({ projectDir: tmpDir, toolName: "bash" });
		expect(result?.block).toBe(true);
	});

	it("does not block when spec not locked in plan phase", async () => {
		const { ctx, tmpDir: td } = makeCtx();
		tmpDir = td;
		const sm = new StateManager(tmpDir);
		sm.createWorkflow("default");
		sm.setActiveWorkflowId("default");
		sm.transitionPhase("default", "plan");
		sm.close();
		const hook = createSpecLockGuardHook(ctx);
		const result = await hook({ projectDir: tmpDir, toolName: "write" });
		expect(result).toBeUndefined();
	});

	it("allows write tools during execute phase even when spec locked", async () => {
		const { ctx, tmpDir: td } = makeCtx();
		tmpDir = td;
		const sm = new StateManager(tmpDir);
		sm.createWorkflow("default");
		sm.setActiveWorkflowId("default");
		sm.transitionPhase("default", "plan");
		sm.lockSpec("default");
		sm.transitionPhase("default", "execute");
		sm.close();
		const hook = createSpecLockGuardHook(ctx);
		const result = await hook({ projectDir: tmpDir, toolName: "write" });
		expect(result).toBeUndefined();
	});

	it("handles case-insensitive tool names", async () => {
		const { ctx, tmpDir: td } = makeCtx();
		tmpDir = td;
		const sm = new StateManager(tmpDir);
		sm.createWorkflow("default");
		sm.setActiveWorkflowId("default");
		sm.transitionPhase("default", "plan");
		sm.lockSpec("default");
		sm.close();
		const hook = createSpecLockGuardHook(ctx);
		const result = await hook({ projectDir: tmpDir, toolName: "Write" });
		expect(result?.block).toBe(true);
	});

	it("does not throw when DB does not exist", async () => {
		const { ctx, tmpDir: td } = makeCtx();
		tmpDir = td;
		const hook = createSpecLockGuardHook(ctx);
		const result = await hook({
			projectDir: path.join(tmpDir, "nonexistent"),
			toolName: "write",
		});
		// Graceful degradation — should not block and should not throw
		expect(result).toBeUndefined();
	});
});
