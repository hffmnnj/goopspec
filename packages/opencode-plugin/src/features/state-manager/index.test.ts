import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { STATE_SCHEMA_VERSION } from "../../core/constants.js";
import type { GoopState } from "../../core/types.js";
import { setupTestEnvironment } from "../../test-utils.js";
import { createStateManager } from "./index.js";
import { createDefaultWorkflowState } from "./schema.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let testDir: string;
let cleanup: () => void;

function statePath(): string {
  return join(testDir, ".goopspec", "state.json");
}

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  const env = setupTestEnvironment("state-mgr");
  testDir = env.testDir;
  cleanup = env.cleanup;
});

afterEach(() => cleanup());

// ===========================================================================
// Init & Create
// ===========================================================================

describe("init and create", () => {
  it("creates state.json on first access when none exists", () => {
    // Remove the scaffolded state.json so the manager creates a fresh one
    unlinkSync(statePath());

    const mgr = createStateManager({ projectDir: testDir });
    const state = mgr.getState();

    expect(state.version).toBe(STATE_SCHEMA_VERSION);
    expect(state.activeWorkflowId).toBe("default");
    expect(state.workflows.default).toBeDefined();
    expect(existsSync(statePath())).toBe(true);
  });

  it("loads existing v2 state.json without modification", () => {
    const mgr = createStateManager({ projectDir: testDir });
    const state = mgr.getState();

    expect(state.version).toBe(STATE_SCHEMA_VERSION);
    expect(state.activeWorkflowId).toBe("default");
    expect(state.workflows.default.phase).toBe("idle");
  });

  it("uses provided workflowId as default when creating fresh state", () => {
    unlinkSync(statePath());

    const mgr = createStateManager({ projectDir: testDir, workflowId: "my-feature" });
    const state = mgr.getState();

    expect(state.activeWorkflowId).toBe("my-feature");
    expect(state.workflows["my-feature"]).toBeDefined();
  });
});

// ===========================================================================
// Get / Set state
// ===========================================================================

describe("get and set state", () => {
  it("setState persists and getState returns the new value", () => {
    const mgr = createStateManager({ projectDir: testDir });
    const original = mgr.getState();

    const updated: GoopState = {
      ...original,
      activeWorkflowId: "default",
      workflows: {
        ...original.workflows,
        default: { ...original.workflows.default, phase: "plan" },
      },
    };

    mgr.setState(updated);
    const reloaded = mgr.getState();
    expect(reloaded.workflows.default.phase).toBe("plan");
  });

  it("persists to disk so a new manager instance reads the same state", () => {
    const mgr1 = createStateManager({ projectDir: testDir });
    mgr1.getActiveWorkflow(); // ensure loaded
    mgr1.lockSpec();

    const mgr2 = createStateManager({ projectDir: testDir });
    expect(mgr2.getActiveWorkflow().specLocked).toBe(true);
  });
});

// ===========================================================================
// Workflow CRUD
// ===========================================================================

describe("workflow CRUD", () => {
  it("createWorkflow adds a new workflow", () => {
    const mgr = createStateManager({ projectDir: testDir });
    const wf = mgr.createWorkflow("feat-auth");

    expect(wf.phase).toBe("idle");
    expect(mgr.listWorkflowIds()).toContain("feat-auth");
  });

  it("createWorkflow returns existing workflow if id already exists", () => {
    const mgr = createStateManager({ projectDir: testDir });
    mgr.createWorkflow("feat-auth");
    mgr.setActiveWorkflow("feat-auth");
    mgr.lockSpec();

    const existing = mgr.createWorkflow("feat-auth");
    expect(existing.specLocked).toBe(true);
  });

  it("createWorkflow creates doc directory for non-default workflows", () => {
    const mgr = createStateManager({ projectDir: testDir });
    mgr.createWorkflow("feat-auth");

    expect(existsSync(join(testDir, ".goopspec", "feat-auth"))).toBe(true);
  });

  it("removeWorkflow deletes a workflow", () => {
    const mgr = createStateManager({ projectDir: testDir });
    mgr.createWorkflow("feat-auth");
    mgr.removeWorkflow("feat-auth");

    expect(mgr.listWorkflowIds()).not.toContain("feat-auth");
  });

  it("removeWorkflow switches active if removed was active", () => {
    const mgr = createStateManager({ projectDir: testDir });
    mgr.createWorkflow("feat-auth");
    mgr.setActiveWorkflow("feat-auth");
    mgr.removeWorkflow("feat-auth");

    expect(mgr.getActiveWorkflowId()).toBe("default");
  });

  it("setActiveWorkflow throws for non-existent workflow", () => {
    const mgr = createStateManager({ projectDir: testDir });
    expect(() => mgr.setActiveWorkflow("nope")).toThrow("does not exist");
  });

  it("setActiveWorkflow switches the active workflow", () => {
    const mgr = createStateManager({ projectDir: testDir });
    mgr.createWorkflow("feat-auth");
    mgr.setActiveWorkflow("feat-auth");

    expect(mgr.getActiveWorkflowId()).toBe("feat-auth");
  });

  it("getWorkflow returns undefined for non-existent id", () => {
    const mgr = createStateManager({ projectDir: testDir });
    expect(mgr.getWorkflow("nope")).toBeUndefined();
  });

  it("listWorkflowIds returns all workflow keys", () => {
    const mgr = createStateManager({ projectDir: testDir });
    mgr.createWorkflow("a");
    mgr.createWorkflow("b");

    const ids = mgr.listWorkflowIds();
    expect(ids).toContain("default");
    expect(ids).toContain("a");
    expect(ids).toContain("b");
  });
});

// ===========================================================================
// Phase transitions
// ===========================================================================

describe("phase transitions", () => {
  it("allows valid transition idle -> discuss", () => {
    const mgr = createStateManager({ projectDir: testDir });
    mgr.transitionPhase("discuss");
    expect(mgr.getActiveWorkflow().phase).toBe("discuss");
  });

  it("allows valid transition idle -> plan", () => {
    const mgr = createStateManager({ projectDir: testDir });
    mgr.transitionPhase("plan");
    expect(mgr.getActiveWorkflow().phase).toBe("plan");
  });

  it("allows valid chain: idle -> plan -> execute -> accept -> idle", () => {
    const mgr = createStateManager({ projectDir: testDir });
    mgr.transitionPhase("plan");
    mgr.transitionPhase("execute");
    mgr.transitionPhase("accept");
    mgr.transitionPhase("idle");
    expect(mgr.getActiveWorkflow().phase).toBe("idle");
  });

  it("throws on invalid transition idle -> execute", () => {
    const mgr = createStateManager({ projectDir: testDir });
    expect(() => mgr.transitionPhase("execute")).toThrow("Invalid phase transition");
  });

  it("throws on invalid transition idle -> accept", () => {
    const mgr = createStateManager({ projectDir: testDir });
    expect(() => mgr.transitionPhase("accept")).toThrow("Invalid phase transition");
  });

  it("force=true bypasses validation", () => {
    const mgr = createStateManager({ projectDir: testDir });
    mgr.transitionPhase("accept", true);
    expect(mgr.getActiveWorkflow().phase).toBe("accept");
  });

  it("transitions are scoped to the active workflow", () => {
    const mgr = createStateManager({ projectDir: testDir });
    mgr.createWorkflow("feat-auth");
    mgr.setActiveWorkflow("feat-auth");
    mgr.transitionPhase("discuss");

    // Switch back — default should still be idle
    mgr.setActiveWorkflow("default");
    expect(mgr.getActiveWorkflow().phase).toBe("idle");

    // feat-auth should be discuss
    mgr.setActiveWorkflow("feat-auth");
    expect(mgr.getActiveWorkflow().phase).toBe("discuss");
  });
});

// ===========================================================================
// Lock / Unlock / Interview / Acceptance
// ===========================================================================

describe("spec lock and flags", () => {
  it("lockSpec / unlockSpec toggles specLocked", () => {
    const mgr = createStateManager({ projectDir: testDir });
    expect(mgr.getActiveWorkflow().specLocked).toBe(false);

    mgr.lockSpec();
    expect(mgr.getActiveWorkflow().specLocked).toBe(true);

    mgr.unlockSpec();
    expect(mgr.getActiveWorkflow().specLocked).toBe(false);
  });

  it("completeInterview / resetInterview toggles interviewComplete", () => {
    const mgr = createStateManager({ projectDir: testDir });
    mgr.completeInterview();
    expect(mgr.getActiveWorkflow().interviewComplete).toBe(true);

    mgr.resetInterview();
    expect(mgr.getActiveWorkflow().interviewComplete).toBe(false);
  });

  it("confirmAcceptance / resetAcceptance toggles acceptanceConfirmed", () => {
    const mgr = createStateManager({ projectDir: testDir });
    mgr.confirmAcceptance();
    expect(mgr.getActiveWorkflow().acceptanceConfirmed).toBe(true);

    mgr.resetAcceptance();
    expect(mgr.getActiveWorkflow().acceptanceConfirmed).toBe(false);
  });
});

// ===========================================================================
// Wave tracking
// ===========================================================================

describe("wave tracking", () => {
  it("updateWaveProgress sets current and total", () => {
    const mgr = createStateManager({ projectDir: testDir });
    mgr.updateWaveProgress(3, 8);

    const wf = mgr.getActiveWorkflow();
    expect(wf.currentWave).toBe(3);
    expect(wf.totalWaves).toBe(8);
  });

  it("wave progress persists across manager instances", () => {
    const mgr1 = createStateManager({ projectDir: testDir });
    mgr1.updateWaveProgress(5, 10);

    const mgr2 = createStateManager({ projectDir: testDir });
    const wf = mgr2.getActiveWorkflow();
    expect(wf.currentWave).toBe(5);
    expect(wf.totalWaves).toBe(10);
  });
});

// ===========================================================================
// Mode / Depth / Autopilot
// ===========================================================================

describe("mode, depth, and workflow updates", () => {
  it("setMode changes the task mode", () => {
    const mgr = createStateManager({ projectDir: testDir });
    mgr.setMode("comprehensive");
    expect(mgr.getActiveWorkflow().mode).toBe("comprehensive");
  });

  it("setDepth changes the workflow depth", () => {
    const mgr = createStateManager({ projectDir: testDir });
    mgr.setDepth("deep");
    expect(mgr.getActiveWorkflow().depth).toBe("deep");
  });

  it("updateWorkflow applies partial updates", () => {
    const mgr = createStateManager({ projectDir: testDir });
    mgr.updateWorkflow({ autopilot: true, lazyAutopilot: true });

    const wf = mgr.getActiveWorkflow();
    expect(wf.autopilot).toBe(true);
    expect(wf.lazyAutopilot).toBe(true);
  });

  it("resetWorkflow returns active workflow to defaults", () => {
    const mgr = createStateManager({ projectDir: testDir });
    mgr.transitionPhase("plan");
    mgr.lockSpec();
    mgr.updateWaveProgress(3, 5);

    mgr.resetWorkflow();
    const wf = mgr.getActiveWorkflow();
    expect(wf.phase).toBe("idle");
    expect(wf.specLocked).toBe(false);
    expect(wf.currentWave).toBe(0);
  });
});

// ===========================================================================
// ADL
// ===========================================================================

describe("ADL (Automated Decision Log)", () => {
  it("getADL creates the file if missing and returns header", () => {
    const mgr = createStateManager({ projectDir: testDir });
    const adl = mgr.getADL();
    expect(adl).toContain("Automated Decision Log");
  });

  it("appendADL adds an entry to the log", () => {
    const mgr = createStateManager({ projectDir: testDir });
    mgr.appendADL({
      timestamp: "2026-06-16T12:00:00Z",
      type: "decision",
      description: "Chose approach A",
      action: "Implemented approach A",
      rule: 1,
      files: ["src/foo.ts"],
    });

    const adl = mgr.getADL();
    expect(adl).toContain("[DECISION]");
    expect(adl).toContain("Rule 1");
    expect(adl).toContain("Chose approach A");
    expect(adl).toContain("src/foo.ts");
  });
});

// ===========================================================================
// Checkpoints
// ===========================================================================

describe("checkpoints", () => {
  it("saveCheckpoint + loadCheckpoint round-trips data", () => {
    const mgr = createStateManager({ projectDir: testDir });
    const data = {
      id: "cp-1",
      timestamp: "2026-06-16T12:00:00Z",
      state: mgr.getState(),
      context: { note: "test" },
    };

    mgr.saveCheckpoint("cp-1", data);
    const loaded = mgr.loadCheckpoint("cp-1");

    expect(loaded).not.toBeNull();
    expect(loaded?.id).toBe("cp-1");
    expect(loaded?.context).toEqual({ note: "test" });
  });

  it("loadCheckpoint returns null for non-existent checkpoint", () => {
    const mgr = createStateManager({ projectDir: testDir });
    expect(mgr.loadCheckpoint("nope")).toBeNull();
  });

  it("listCheckpoints returns saved checkpoint ids", () => {
    const mgr = createStateManager({ projectDir: testDir });
    const base = {
      timestamp: "2026-06-16T12:00:00Z",
      state: mgr.getState(),
    };

    mgr.saveCheckpoint("cp-a", { id: "cp-a", ...base });
    mgr.saveCheckpoint("cp-b", { id: "cp-b", ...base });

    const ids = mgr.listCheckpoints();
    expect(ids).toContain("cp-a");
    expect(ids).toContain("cp-b");
  });

  it("saveCheckpoint updates the workflow checkpoint field", () => {
    const mgr = createStateManager({ projectDir: testDir });
    mgr.saveCheckpoint("wave-2-done", {
      id: "wave-2-done",
      timestamp: "2026-06-16T12:00:00Z",
      state: mgr.getState(),
    });

    expect(mgr.getActiveWorkflow().checkpoint).toBe("wave-2-done");
  });
});

// ===========================================================================
// v1 -> v2 migration
// ===========================================================================

describe("v1 to v2 migration", () => {
  it("migrates a v1 state file to v2 format", () => {
    // Write a v1-style state.json (no version, no workflows map)
    const v1State = {
      workflow: {
        phase: "execute",
        mode: "standard",
        depth: "deep",
        specLocked: true,
        interviewComplete: true,
        acceptanceConfirmed: false,
        currentWave: 3,
        totalWaves: 5,
      },
    };
    writeFileSync(statePath(), JSON.stringify(v1State), "utf-8");

    const mgr = createStateManager({ projectDir: testDir });
    const state = mgr.getState();

    expect(state.version).toBe(STATE_SCHEMA_VERSION);
    expect(state.activeWorkflowId).toBe("default");
    expect(state.workflows.default).toBeDefined();
    expect(state.workflows.default.phase).toBe("execute");
    expect(state.workflows.default.specLocked).toBe(true);
    expect(state.workflows.default.currentWave).toBe(3);
    expect(state.workflows.default.depth).toBe("deep");
  });

  it("creates a .backup file before migration", () => {
    const v1State = { workflow: { phase: "plan" } };
    writeFileSync(statePath(), JSON.stringify(v1State), "utf-8");

    createStateManager({ projectDir: testDir }).getState();

    const backupPath = `${statePath()}.backup`;
    expect(existsSync(backupPath)).toBe(true);

    const backup = JSON.parse(readFileSync(backupPath, "utf-8"));
    expect(backup.workflow.phase).toBe("plan");
  });

  it("handles completely empty state file gracefully", () => {
    writeFileSync(statePath(), "{}", "utf-8");

    const mgr = createStateManager({ projectDir: testDir });
    const state = mgr.getState();

    expect(state.version).toBe(STATE_SCHEMA_VERSION);
    expect(state.workflows.default).toBeDefined();
    expect(state.workflows.default.phase).toBe("idle");
  });

  it("handles malformed JSON by creating fresh state", () => {
    writeFileSync(statePath(), "not json at all", "utf-8");

    const mgr = createStateManager({ projectDir: testDir });
    const state = mgr.getState();

    expect(state.version).toBe(STATE_SCHEMA_VERSION);
    expect(state.workflows.default).toBeDefined();
  });
});

// ===========================================================================
// Atomic writes
// ===========================================================================

describe("atomic writes", () => {
  it("state.json is valid JSON after every mutation", () => {
    const mgr = createStateManager({ projectDir: testDir });

    mgr.transitionPhase("plan");
    expect(() => JSON.parse(readFileSync(statePath(), "utf-8"))).not.toThrow();

    mgr.lockSpec();
    expect(() => JSON.parse(readFileSync(statePath(), "utf-8"))).not.toThrow();

    mgr.updateWaveProgress(1, 3);
    expect(() => JSON.parse(readFileSync(statePath(), "utf-8"))).not.toThrow();
  });

  it("no .tmp files remain after writes", () => {
    const mgr = createStateManager({ projectDir: testDir });
    mgr.transitionPhase("plan");
    mgr.lockSpec();

    const goopDir = join(testDir, ".goopspec");
    const files = readdirSync(goopDir) as string[];
    const tmpFiles = files.filter((f: string) => f.includes(".tmp."));
    expect(tmpFiles.length).toBe(0);
  });
});

// ===========================================================================
// Schema defaults
// ===========================================================================

describe("createDefaultWorkflowState", () => {
  it("returns sensible defaults", () => {
    const wf = createDefaultWorkflowState();
    expect(wf.phase).toBe("idle");
    expect(wf.mode).toBe("standard");
    expect(wf.depth).toBe("standard");
    expect(wf.interviewComplete).toBe(false);
    expect(wf.specLocked).toBe(false);
    expect(wf.acceptanceConfirmed).toBe(false);
    expect(wf.currentWave).toBe(0);
    expect(wf.totalWaves).toBe(0);
    expect(wf.autopilot).toBe(false);
    expect(wf.lazyAutopilot).toBe(false);
  });

  it("accepts overrides", () => {
    const wf = createDefaultWorkflowState({ phase: "execute", specLocked: true });
    expect(wf.phase).toBe("execute");
    expect(wf.specLocked).toBe(true);
    expect(wf.mode).toBe("standard"); // non-overridden stays default
  });
});
