import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { STATE_SCHEMA_VERSION } from "../../core/constants.js";
import type { GoopState } from "../../core/types.js";
import { setupTestEnvironment } from "../../test-utils.js";
import type { GoopSpecDB } from "../db/index.js";
import { createStateManager } from "./index.js";
import { createDefaultWorkflowState } from "./schema.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let testDir: string;
let db: GoopSpecDB;
let cleanup: () => void;

function statePath(): string {
  return join(testDir, ".goopspec", "state.json");
}

function mgr(workflowId?: string) {
  return createStateManager({ projectDir: testDir, db, workflowId });
}

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  const env = setupTestEnvironment("state-mgr");
  testDir = env.testDir;
  db = env.db;
  cleanup = env.cleanup;
});

afterEach(() => cleanup());

// ===========================================================================
// Init & Create
// ===========================================================================

describe("init and create", () => {
  it("creates default state in DB on first access when DB is empty", () => {
    const m = mgr();
    const state = m.getState();

    expect(state.version).toBe(STATE_SCHEMA_VERSION);
    expect(state.activeWorkflowId).toBe("default");
    expect(state.workflows.default).toBeDefined();
  });

  it("loads existing state from DB without modification", () => {
    // Seed the DB with a workflow
    db.upsertWorkflow("default", createDefaultWorkflowState());
    db.upsertWorkflow("_meta", { activeWorkflowId: "default" });

    const m = mgr();
    const state = m.getState();

    expect(state.version).toBe(STATE_SCHEMA_VERSION);
    expect(state.activeWorkflowId).toBe("default");
    expect(state.workflows.default.phase).toBe("idle");
  });

  it("uses provided workflowId as default when creating fresh state", () => {
    const m = mgr("my-feature");
    const state = m.getState();

    expect(state.activeWorkflowId).toBe("my-feature");
    expect(state.workflows["my-feature"]).toBeDefined();
  });
});

// ===========================================================================
// Get / Set state
// ===========================================================================

describe("get and set state", () => {
  it("setState persists and getState returns the new value", () => {
    const m = mgr();
    const original = m.getState();

    const updated: GoopState = {
      ...original,
      activeWorkflowId: "default",
      workflows: {
        ...original.workflows,
        default: { ...original.workflows.default, phase: "plan" },
      },
    };

    m.setState(updated);
    const reloaded = m.getState();
    expect(reloaded.workflows.default.phase).toBe("plan");
  });

  it("persists to DB so a new manager instance reads the same state", () => {
    const m1 = mgr();
    m1.getActiveWorkflow(); // ensure loaded
    m1.lockSpec();

    const m2 = createStateManager({ projectDir: testDir, db });
    expect(m2.getActiveWorkflow().specLocked).toBe(true);
  });
});

// ===========================================================================
// Workflow CRUD
// ===========================================================================

describe("workflow CRUD", () => {
  it("createWorkflow adds a new workflow", () => {
    const m = mgr();
    const wf = m.createWorkflow("feat-auth");

    expect(wf.phase).toBe("idle");
    expect(m.listWorkflowIds()).toContain("feat-auth");
  });

  it("createWorkflow returns existing workflow if id already exists", () => {
    const m = mgr();
    m.createWorkflow("feat-auth");
    m.setActiveWorkflow("feat-auth");
    m.lockSpec();

    const existing = m.createWorkflow("feat-auth");
    expect(existing.specLocked).toBe(true);
  });

  it("createWorkflow creates doc directory for non-default workflows", () => {
    const m = mgr();
    m.createWorkflow("feat-auth");

    expect(existsSync(join(testDir, ".goopspec", "feat-auth"))).toBe(true);
  });

  it("removeWorkflow deletes a workflow", () => {
    const m = mgr();
    m.createWorkflow("feat-auth");
    m.removeWorkflow("feat-auth");

    expect(m.listWorkflowIds()).not.toContain("feat-auth");
  });

  it("removeWorkflow switches active if removed was active", () => {
    const m = mgr();
    m.createWorkflow("feat-auth");
    m.setActiveWorkflow("feat-auth");
    m.removeWorkflow("feat-auth");

    expect(m.getActiveWorkflowId()).toBe("default");
  });

  it("setActiveWorkflow throws for non-existent workflow", () => {
    const m = mgr();
    expect(() => m.setActiveWorkflow("nope")).toThrow("does not exist");
  });

  it("setActiveWorkflow switches the active workflow", () => {
    const m = mgr();
    m.createWorkflow("feat-auth");
    m.setActiveWorkflow("feat-auth");

    expect(m.getActiveWorkflowId()).toBe("feat-auth");
  });

  it("getWorkflow returns undefined for non-existent id", () => {
    const m = mgr();
    expect(m.getWorkflow("nope")).toBeUndefined();
  });

  it("listWorkflowIds returns all workflow keys", () => {
    const m = mgr();
    m.createWorkflow("a");
    m.createWorkflow("b");

    const ids = m.listWorkflowIds();
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
    const m = mgr();
    m.transitionPhase("discuss");
    expect(m.getActiveWorkflow().phase).toBe("discuss");
  });

  it("allows valid transition idle -> plan", () => {
    const m = mgr();
    m.transitionPhase("plan");
    expect(m.getActiveWorkflow().phase).toBe("plan");
  });

  it("allows valid chain: idle -> plan -> execute -> accept -> idle", () => {
    const m = mgr();
    m.transitionPhase("plan");
    m.transitionPhase("execute");
    m.transitionPhase("accept");
    m.transitionPhase("idle");
    expect(m.getActiveWorkflow().phase).toBe("idle");
  });

  it("throws on invalid transition idle -> execute", () => {
    const m = mgr();
    expect(() => m.transitionPhase("execute")).toThrow("Invalid phase transition");
  });

  it("throws on invalid transition idle -> accept", () => {
    const m = mgr();
    expect(() => m.transitionPhase("accept")).toThrow("Invalid phase transition");
  });

  it("force=true bypasses validation", () => {
    const m = mgr();
    m.transitionPhase("accept", true);
    expect(m.getActiveWorkflow().phase).toBe("accept");
  });

  it("transitions are scoped to the active workflow", () => {
    const m = mgr();
    m.createWorkflow("feat-auth");
    m.setActiveWorkflow("feat-auth");
    m.transitionPhase("discuss");

    // Switch back — default should still be idle
    m.setActiveWorkflow("default");
    expect(m.getActiveWorkflow().phase).toBe("idle");

    // feat-auth should be discuss
    m.setActiveWorkflow("feat-auth");
    expect(m.getActiveWorkflow().phase).toBe("discuss");
  });
});

// ===========================================================================
// Lock / Unlock / Interview / Acceptance
// ===========================================================================

describe("spec lock and flags", () => {
  it("lockSpec / unlockSpec toggles specLocked", () => {
    const m = mgr();
    expect(m.getActiveWorkflow().specLocked).toBe(false);

    m.lockSpec();
    expect(m.getActiveWorkflow().specLocked).toBe(true);

    m.unlockSpec();
    expect(m.getActiveWorkflow().specLocked).toBe(false);
  });

  it("completeInterview / resetInterview toggles interviewComplete", () => {
    const m = mgr();
    m.completeInterview();
    expect(m.getActiveWorkflow().interviewComplete).toBe(true);

    m.resetInterview();
    expect(m.getActiveWorkflow().interviewComplete).toBe(false);
  });

  it("confirmAcceptance / resetAcceptance toggles acceptanceConfirmed", () => {
    const m = mgr();
    m.confirmAcceptance();
    expect(m.getActiveWorkflow().acceptanceConfirmed).toBe(true);

    m.resetAcceptance();
    expect(m.getActiveWorkflow().acceptanceConfirmed).toBe(false);
  });
});

// ===========================================================================
// Wave tracking
// ===========================================================================

describe("wave tracking", () => {
  it("updateWaveProgress sets current and total", () => {
    const m = mgr();
    m.updateWaveProgress(3, 8);

    const wf = m.getActiveWorkflow();
    expect(wf.currentWave).toBe(3);
    expect(wf.totalWaves).toBe(8);
  });

  it("wave progress persists across manager instances", () => {
    const m1 = mgr();
    m1.updateWaveProgress(5, 10);

    // New manager instance sharing the same DB
    const m2 = createStateManager({ projectDir: testDir, db });
    const wf = m2.getActiveWorkflow();
    expect(wf.currentWave).toBe(5);
    expect(wf.totalWaves).toBe(10);
  });
});

// ===========================================================================
// Mode / Depth / Autopilot
// ===========================================================================

describe("mode, depth, and workflow updates", () => {
  it("setMode changes the task mode", () => {
    const m = mgr();
    m.setMode("comprehensive");
    expect(m.getActiveWorkflow().mode).toBe("comprehensive");
  });

  it("setDepth changes the workflow depth", () => {
    const m = mgr();
    m.setDepth("deep");
    expect(m.getActiveWorkflow().depth).toBe("deep");
  });

  it("updateWorkflow applies partial updates", () => {
    const m = mgr();
    m.updateWorkflow({ autopilot: true, lazyAutopilot: true });

    const wf = m.getActiveWorkflow();
    expect(wf.autopilot).toBe(true);
    expect(wf.lazyAutopilot).toBe(true);
  });

  it("resetWorkflow returns active workflow to defaults", () => {
    const m = mgr();
    m.transitionPhase("plan");
    m.lockSpec();
    m.updateWaveProgress(3, 5);

    m.resetWorkflow();
    const wf = m.getActiveWorkflow();
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
    const m = mgr();
    const adl = m.getADL();
    expect(adl).toContain("Automated Decision Log");
  });

  it("appendADL adds an entry to the log", () => {
    const m = mgr();
    m.appendADL({
      timestamp: "2026-06-16T12:00:00Z",
      type: "decision",
      description: "Chose approach A",
      action: "Implemented approach A",
      rule: 1,
      files: ["src/foo.ts"],
    });

    const adl = m.getADL();
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
    const m = mgr();
    const data = {
      id: "cp-1",
      timestamp: "2026-06-16T12:00:00Z",
      state: m.getState(),
      context: { note: "test" },
    };

    m.saveCheckpoint("cp-1", data);
    const loaded = m.loadCheckpoint("cp-1");

    expect(loaded).not.toBeNull();
    expect(loaded?.id).toBe("cp-1");
    expect(loaded?.context).toEqual({ note: "test" });
  });

  it("loadCheckpoint returns null for non-existent checkpoint", () => {
    const m = mgr();
    expect(m.loadCheckpoint("nope")).toBeNull();
  });

  it("listCheckpoints returns saved checkpoint ids", () => {
    const m = mgr();
    const base = {
      timestamp: "2026-06-16T12:00:00Z",
      state: m.getState(),
    };

    m.saveCheckpoint("cp-a", { id: "cp-a", ...base });
    m.saveCheckpoint("cp-b", { id: "cp-b", ...base });

    const ids = m.listCheckpoints();
    expect(ids).toContain("cp-a");
    expect(ids).toContain("cp-b");
  });

  it("saveCheckpoint updates the workflow checkpoint field", () => {
    const m = mgr();
    m.saveCheckpoint("wave-2-done", {
      id: "wave-2-done",
      timestamp: "2026-06-16T12:00:00Z",
      state: m.getState(),
    });

    expect(m.getActiveWorkflow().checkpoint).toBe("wave-2-done");
  });
});

// ===========================================================================
// Auto-import from state.json
// ===========================================================================

describe("auto-import from state.json", () => {
  it("imports a v2 state.json into DB on first access", () => {
    const v2State: GoopState = {
      version: STATE_SCHEMA_VERSION,
      activeWorkflowId: "default",
      workflows: {
        default: createDefaultWorkflowState({ phase: "execute", specLocked: true }),
        "feat-auth": createDefaultWorkflowState({ phase: "plan" }),
      },
    };
    writeFileSync(statePath(), JSON.stringify(v2State), "utf-8");

    const m = mgr();
    const state = m.getState();

    expect(state.workflows.default.phase).toBe("execute");
    expect(state.workflows.default.specLocked).toBe(true);
    expect(state.workflows["feat-auth"]).toBeDefined();
    expect(state.workflows["feat-auth"].phase).toBe("plan");
  });

  it("renames state.json to state.json.backup after import", () => {
    const v2State: GoopState = {
      version: STATE_SCHEMA_VERSION,
      activeWorkflowId: "default",
      workflows: {
        default: createDefaultWorkflowState(),
      },
    };
    writeFileSync(statePath(), JSON.stringify(v2State), "utf-8");

    mgr().getState();

    expect(existsSync(`${statePath()}.backup`)).toBe(true);
    expect(existsSync(statePath())).toBe(false);
  });

  it("migrates a v1 state.json through v2 migration then into DB", () => {
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

    const m = mgr();
    const state = m.getState();

    expect(state.version).toBe(STATE_SCHEMA_VERSION);
    expect(state.activeWorkflowId).toBe("default");
    expect(state.workflows.default.phase).toBe("execute");
    expect(state.workflows.default.specLocked).toBe(true);
    expect(state.workflows.default.currentWave).toBe(3);
    expect(state.workflows.default.depth).toBe("deep");
  });

  it("handles malformed state.json by creating fresh state", () => {
    writeFileSync(statePath(), "not json at all", "utf-8");

    const m = mgr();
    const state = m.getState();

    expect(state.version).toBe(STATE_SCHEMA_VERSION);
    expect(state.workflows.default).toBeDefined();
  });

  it("handles empty JSON state.json by migrating to v2", () => {
    writeFileSync(statePath(), "{}", "utf-8");

    const m = mgr();
    const state = m.getState();

    expect(state.version).toBe(STATE_SCHEMA_VERSION);
    expect(state.workflows.default).toBeDefined();
    expect(state.workflows.default.phase).toBe("idle");
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
