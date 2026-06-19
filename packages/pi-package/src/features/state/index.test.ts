import { afterEach, describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { StateManager } from "./index.js";

function makeTmpDir(): string {
	const tmp = path.join(
		os.tmpdir(),
		`goopspec-state-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
	);
	fs.mkdirSync(tmp, { recursive: true });
	return tmp;
}

describe("StateManager", () => {
	let tmpDir: string;
	let sm: StateManager;

	afterEach(() => {
		sm?.close();
		if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	it("returns default state for unknown workflow", () => {
		tmpDir = makeTmpDir();
		sm = new StateManager(tmpDir);
		const state = sm.getState("new-wf");
		expect(state.phase).toBe("discuss");
		expect(state.specLocked).toBe(false);
		expect(state.workflowId).toBe("new-wf");
	});

	it("creates a workflow with default state", () => {
		tmpDir = makeTmpDir();
		sm = new StateManager(tmpDir);
		const state = sm.createWorkflow("my-workflow");
		expect(state.workflowId).toBe("my-workflow");
		expect(state.phase).toBe("discuss");
		expect(state.createdAt).toBeTruthy();
		expect(state.updatedAt).toBeTruthy();
	});

	it("persists state updates", () => {
		tmpDir = makeTmpDir();
		sm = new StateManager(tmpDir);
		sm.createWorkflow("wf-1");
		sm.setState("wf-1", { specLocked: true, currentWave: 2 });
		const state = sm.getState("wf-1");
		expect(state.specLocked).toBe(true);
		expect(state.currentWave).toBe(2);
	});

	it("transitions phase successfully", () => {
		tmpDir = makeTmpDir();
		sm = new StateManager(tmpDir);
		sm.createWorkflow("wf-1");
		const result = sm.transitionPhase("wf-1", "plan");
		expect(result.ok).toBe(true);
		expect(sm.getState("wf-1").phase).toBe("plan");
	});

	it("rejects invalid phase transition", () => {
		tmpDir = makeTmpDir();
		sm = new StateManager(tmpDir);
		sm.createWorkflow("wf-1");
		const result = sm.transitionPhase("wf-1", "confirm");
		expect(result.ok).toBe(false);
		expect(result.error).toContain("Cannot transition");
	});

	it("locks and unlocks spec", () => {
		tmpDir = makeTmpDir();
		sm = new StateManager(tmpDir);
		sm.createWorkflow("wf-1");
		sm.lockSpec("wf-1");
		expect(sm.getState("wf-1").specLocked).toBe(true);
		sm.unlockSpec("wf-1");
		expect(sm.getState("wf-1").specLocked).toBe(false);
	});

	it("sets and gets active workflow id", () => {
		tmpDir = makeTmpDir();
		sm = new StateManager(tmpDir);
		sm.setActiveWorkflowId("my-active");
		expect(sm.getActiveWorkflowId()).toBe("my-active");
	});

	it("returns default active workflow when none set", () => {
		tmpDir = makeTmpDir();
		sm = new StateManager(tmpDir);
		expect(sm.getActiveWorkflowId()).toBe("default");
	});

	it("lists workflows (excluding meta)", () => {
		tmpDir = makeTmpDir();
		sm = new StateManager(tmpDir);
		sm.createWorkflow("alpha");
		sm.createWorkflow("beta");
		const list = sm.listWorkflows();
		expect(list).toContain("alpha");
		expect(list).toContain("beta");
		expect(list).not.toContain("__meta__");
	});

	it("updates wave progress", () => {
		tmpDir = makeTmpDir();
		sm = new StateManager(tmpDir);
		sm.createWorkflow("wf-1");
		sm.updateWave("wf-1", 3, 6);
		const state = sm.getState("wf-1");
		expect(state.currentWave).toBe(3);
		expect(state.totalWaves).toBe(6);
	});

	it("completes interview", () => {
		tmpDir = makeTmpDir();
		sm = new StateManager(tmpDir);
		sm.createWorkflow("wf-1");
		sm.completeInterview("wf-1");
		expect(sm.getState("wf-1").interviewComplete).toBe(true);
	});

	it("confirms acceptance", () => {
		tmpDir = makeTmpDir();
		sm = new StateManager(tmpDir);
		sm.createWorkflow("wf-1");
		sm.confirmAcceptance("wf-1");
		expect(sm.getState("wf-1").acceptanceConfirmed).toBe(true);
	});

	it("sets autopilot with lazy flag", () => {
		tmpDir = makeTmpDir();
		sm = new StateManager(tmpDir);
		sm.createWorkflow("wf-1");
		sm.setAutopilot("wf-1", true, true);
		const state = sm.getState("wf-1");
		expect(state.autopilot).toBe(true);
		expect(state.lazyAutopilot).toBe(true);
	});

	it("supports multi-step phase transitions", () => {
		tmpDir = makeTmpDir();
		sm = new StateManager(tmpDir);
		sm.createWorkflow("wf-1");
		expect(sm.transitionPhase("wf-1", "plan").ok).toBe(true);
		expect(sm.transitionPhase("wf-1", "execute").ok).toBe(true);
		expect(sm.transitionPhase("wf-1", "accept").ok).toBe(true);
		expect(sm.transitionPhase("wf-1", "confirm").ok).toBe(true);
		expect(sm.getState("wf-1").phase).toBe("confirm");
	});

	it("allows backward transition from plan to discuss", () => {
		tmpDir = makeTmpDir();
		sm = new StateManager(tmpDir);
		sm.createWorkflow("wf-1");
		sm.transitionPhase("wf-1", "plan");
		const result = sm.transitionPhase("wf-1", "discuss");
		expect(result.ok).toBe(true);
		expect(sm.getState("wf-1").phase).toBe("discuss");
	});

	it("preserves existing state fields on partial update", () => {
		tmpDir = makeTmpDir();
		sm = new StateManager(tmpDir);
		sm.createWorkflow("wf-1");
		sm.setState("wf-1", { specLocked: true, currentWave: 2, totalWaves: 5 });
		sm.setState("wf-1", { currentWave: 3 });
		const state = sm.getState("wf-1");
		expect(state.specLocked).toBe(true);
		expect(state.currentWave).toBe(3);
		expect(state.totalWaves).toBe(5);
	});
});
