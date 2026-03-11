/**
 * Integration tests for multi-workflow isolation
 * Verifies Wave 1–3 features work end-to-end:
 * - Multiple workflows share one state.json
 * - Workflow-scoped docs live in .goopspec/<workflowId>/
 * - V1→V2 migration preserves data and produces correct layout
 * - Default workflow maps to .goopspec/ root
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { createStateManager } from "./manager.js";
import {
  createMockV1State,
  createMockV2State,
} from "../../test-utils.js";
import {
  getWorkflowDir,
  getWorkflowDocPath,
  getProjectGoopspecDir,
  WORKFLOW_SCOPED_FILES,
} from "../../shared/paths.js";

// ============================================================================
// Helpers
// ============================================================================

function makeTestDir(): string {
  const dir = join(
    tmpdir(),
    `goopspec-int-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  mkdirSync(dir, { recursive: true });
  return dir;
}

function writeState(testDir: string, state: Record<string, unknown>): void {
  const goopspecDir = join(testDir, ".goopspec");
  mkdirSync(goopspecDir, { recursive: true });
  writeFileSync(
    join(goopspecDir, "state.json"),
    JSON.stringify(state, null, 2),
    "utf-8",
  );
}

// ============================================================================
// Tests
// ============================================================================

describe("multi-workflow integration", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = makeTestDir();
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  // --------------------------------------------------------------------------
  // State JSON is always at root
  // --------------------------------------------------------------------------

  describe("state.json global placement", () => {
    it("state.json lives at .goopspec/ root for default workflow", () => {
      const manager = createStateManager(testDir, "root-wf");
      // Trigger a write by mutating state
      manager.setState({});

      const rootStatePath = join(testDir, ".goopspec", "state.json");
      expect(existsSync(rootStatePath)).toBe(true);

      // Should NOT be inside a sub-directory
      const subStatePath = join(testDir, ".goopspec", "default", "state.json");
      expect(existsSync(subStatePath)).toBe(false);
    });

    it("state.json lives at .goopspec/ root for non-default workflow", () => {
      const manager = createStateManager(testDir, "feature-wf", undefined, undefined, "feat-x");
      // Trigger a write by mutating state
      manager.setState({});

      const rootStatePath = join(testDir, ".goopspec", "state.json");
      expect(existsSync(rootStatePath)).toBe(true);

      // Sub-dir for workflow data is created but state.json NOT in it
      const wfStatePath = join(testDir, ".goopspec", "feat-x", "state.json");
      expect(existsSync(wfStatePath)).toBe(false);
    });

    it("two managers pointing at different workflows share the same state.json", () => {
      const mgr1 = createStateManager(testDir, "shared-state", undefined, undefined, "wf-a");
      const mgr2 = createStateManager(testDir, "shared-state", undefined, undefined, "wf-b");

      // Mutate each manager to trigger a disk write
      mgr1.setState({});
      // mgr2 reads from disk (gets wf-a) and merges wf-b
      mgr2.createWorkflow("wf-a-extra"); // creates a new entry, triggers saveState

      // Both should have written to the same file
      const statePath = join(testDir, ".goopspec", "state.json");
      const raw = JSON.parse(readFileSync(statePath, "utf-8")) as Record<string, unknown>;
      const workflows = raw.workflows as Record<string, unknown>;

      // wf-a was written by mgr1, wf-b context is present, wf-a-extra added by mgr2
      expect(workflows["wf-a"]).toBeDefined();
      expect(workflows["wf-a-extra"]).toBeDefined();
    });
  });

  // --------------------------------------------------------------------------
  // Workflow-scoped document paths
  // --------------------------------------------------------------------------

  describe("workflow-scoped document paths", () => {
    it("default workflow docs live at .goopspec/ root", () => {
      const dir = getWorkflowDir(testDir, "default");
      expect(dir).toBe(join(testDir, ".goopspec"));
    });

    it("non-default workflow docs live at .goopspec/<workflowId>/", () => {
      const dir = getWorkflowDir(testDir, "feat-auth");
      expect(dir).toBe(join(testDir, ".goopspec", "feat-auth"));
    });

    it("getWorkflowDocPath returns correct path for each scoped file", () => {
      for (const file of WORKFLOW_SCOPED_FILES) {
        const filename = file.endsWith("/") ? file.slice(0, -1) : file;

        const defaultPath = getWorkflowDocPath(testDir, "default", filename);
        expect(defaultPath).toBe(join(testDir, ".goopspec", filename));

        const wfPath = getWorkflowDocPath(testDir, "feat-a", filename);
        expect(wfPath).toBe(join(testDir, ".goopspec", "feat-a", filename));
      }
    });
  });

  // --------------------------------------------------------------------------
  // Workflow isolation — checkpoints and history
  // --------------------------------------------------------------------------

  describe("workflow isolation for checkpoints and history", () => {
    it("default workflow checkpoints live at .goopspec/checkpoints/", () => {
      const manager = createStateManager(testDir, "default-wf");
      const state = manager.getState();
      manager.saveCheckpoint("cp-default", {
        timestamp: new Date().toISOString(),
        state,
      });

      const cpPath = join(testDir, ".goopspec", "checkpoints", "cp-default.json");
      expect(existsSync(cpPath)).toBe(true);

      // Should NOT appear in any sub-dir
      const wrongPath = join(testDir, ".goopspec", "default", "checkpoints", "cp-default.json");
      expect(existsSync(wrongPath)).toBe(false);
    });

    it("non-default workflow checkpoints live at .goopspec/<id>/checkpoints/", () => {
      const manager = createStateManager(testDir, "feat-wf", undefined, undefined, "feat-cp");
      const state = manager.getState();
      manager.saveCheckpoint("cp-feat", {
        timestamp: new Date().toISOString(),
        state,
      });

      const cpPath = join(testDir, ".goopspec", "feat-cp", "checkpoints", "cp-feat.json");
      expect(existsSync(cpPath)).toBe(true);

      // Should NOT appear at root checkpoints
      const rootCpPath = join(testDir, ".goopspec", "checkpoints", "cp-feat.json");
      expect(existsSync(rootCpPath)).toBe(false);
    });

    it("two workflows store checkpoints in isolated directories", () => {
      const mgrA = createStateManager(testDir, "proj", undefined, undefined, "wf-a");
      const mgrB = createStateManager(testDir, "proj", undefined, undefined, "wf-b");

      const stateA = mgrA.getState();
      const stateB = mgrB.getState();

      mgrA.saveCheckpoint("cp-a", { timestamp: new Date().toISOString(), state: stateA });
      mgrB.saveCheckpoint("cp-b", { timestamp: new Date().toISOString(), state: stateB });

      const cpA = join(testDir, ".goopspec", "wf-a", "checkpoints", "cp-a.json");
      const cpB = join(testDir, ".goopspec", "wf-b", "checkpoints", "cp-b.json");
      const cpAinB = join(testDir, ".goopspec", "wf-b", "checkpoints", "cp-a.json");
      const cpBinA = join(testDir, ".goopspec", "wf-a", "checkpoints", "cp-b.json");

      expect(existsSync(cpA)).toBe(true);
      expect(existsSync(cpB)).toBe(true);
      expect(existsSync(cpAinB)).toBe(false);
      expect(existsSync(cpBinA)).toBe(false);
    });

    it("two workflows store history in isolated directories", () => {
      const mgrA = createStateManager(testDir, "proj", undefined, undefined, "wf-a");
      const mgrB = createStateManager(testDir, "proj", undefined, undefined, "wf-b");

      mgrA.appendHistory({ timestamp: new Date().toISOString(), type: "phase_change", data: { from: "idle", to: "plan" } });
      mgrB.appendHistory({ timestamp: new Date().toISOString(), type: "tool_call", data: { tool: "goop_status" } });

      const today = new Date().toISOString().split("T")[0];
      const histA = join(testDir, ".goopspec", "wf-a", "history", `${today}.json`);
      const histB = join(testDir, ".goopspec", "wf-b", "history", `${today}.json`);

      expect(existsSync(histA)).toBe(true);
      expect(existsSync(histB)).toBe(true);

      // Cross-check: wf-a history should not contain wf-b tool_call entry
      const entriesA = JSON.parse(readFileSync(histA, "utf-8")) as Array<{ type: string }>;
      expect(entriesA.every((e) => e.type !== "tool_call")).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // Workflow phase isolation
  // --------------------------------------------------------------------------

  describe("workflow phase isolation", () => {
    it("transitioning phase in one workflow does not affect another", () => {
      // Seed shared state with two workflows
      const v2State = createMockV2State({
        workflows: {
          "wf-x": { phase: "idle" },
          "wf-y": { phase: "idle" },
        },
      });
      writeState(testDir, v2State);

      const mgrX = createStateManager(testDir, "proj", undefined, undefined, "wf-x");
      mgrX.transitionPhase("plan");

      // Read wf-y state via a fresh manager
      const mgrY = createStateManager(testDir, "proj", undefined, undefined, "wf-y");
      const stateY = mgrY.getState();

      // wf-y should still be idle — phase isolation guaranteed by workflow map
      const raw = JSON.parse(
        readFileSync(join(testDir, ".goopspec", "state.json"), "utf-8"),
      ) as { workflows: Record<string, { phase: string }> };

      expect(raw.workflows["wf-x"].phase).toBe("plan");
      expect(raw.workflows["wf-y"].phase).toBe("idle");
      expect(stateY.workflow.phase).toBe("idle");
    });

    it("locking spec in one workflow does not affect another", () => {
      const v2State = createMockV2State({
        workflows: {
          "wf-lock": { specLocked: false },
          "wf-free": { specLocked: false },
        },
      });
      writeState(testDir, v2State);

      const mgrLock = createStateManager(testDir, "proj", undefined, undefined, "wf-lock");
      mgrLock.lockSpec();

      const raw = JSON.parse(
        readFileSync(join(testDir, ".goopspec", "state.json"), "utf-8"),
      ) as { workflows: Record<string, { specLocked: boolean }> };

      expect(raw.workflows["wf-lock"].specLocked).toBe(true);
      expect(raw.workflows["wf-free"].specLocked).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // V1 → V2 migration
  // --------------------------------------------------------------------------

  describe("V1 → V2 migration", () => {
    it("migrates v1 state to v2 format with workflows map", () => {
      const v1 = createMockV1State({ projectName: "migrated-project", phase: "execute" });
      writeState(testDir, v1);

      const manager = createStateManager(testDir, "migrated-project");
      const state = manager.getState();

      expect(state.version).toBe(2);
      expect(state.workflows).toBeDefined();
      expect(state.workflows!["default"]).toBeDefined();
      expect(state.workflows!["default"].phase).toBe("execute");
      expect(state.project.name).toBe("migrated-project");
    });

    it("creates a backup file during v1 migration", () => {
      const v1 = createMockV1State({ projectName: "backup-test" });
      writeState(testDir, v1);

      const manager = createStateManager(testDir);
      manager.getState();

      const backupPath = join(testDir, ".goopspec", "state.json.v1-backup");
      expect(existsSync(backupPath)).toBe(true);
    });

    it("migrated state preserves specLocked flag", () => {
      const v1 = createMockV1State({ specLocked: true });
      writeState(testDir, v1);

      const manager = createStateManager(testDir);
      const state = manager.getState();

      expect(state.workflow.specLocked).toBe(true);
      expect(state.workflows!["default"].specLocked).toBe(true);
    });

    it("migrated state is immediately usable for workflow operations", () => {
      const v1 = createMockV1State({ phase: "idle" });
      writeState(testDir, v1);

      const manager = createStateManager(testDir);
      const ok = manager.transitionPhase("plan");
      expect(ok).toBe(true);

      const state = manager.getState();
      expect(state.workflow.phase).toBe("plan");
    });
  });

  // --------------------------------------------------------------------------
  // createWorkflow / listWorkflows / setActiveWorkflow
  // --------------------------------------------------------------------------

  describe("workflow management API", () => {
    it("createWorkflow registers a new workflow entry in state.json", () => {
      const manager = createStateManager(testDir, "mgmt-proj");
      manager.createWorkflow("feat-new");

      const raw = JSON.parse(
        readFileSync(join(testDir, ".goopspec", "state.json"), "utf-8"),
      ) as { workflows: Record<string, unknown> };

      expect(raw.workflows["feat-new"]).toBeDefined();
    });

    it("createWorkflow is idempotent — second call returns existing entry", () => {
      const manager = createStateManager(testDir, "mgmt-proj");
      const first = manager.createWorkflow("feat-idem");

      manager.transitionPhase("plan"); // mutate default workflow
      const second = manager.createWorkflow("feat-idem");

      expect(second.workflowId).toBe(first.workflowId);
      expect(second.phase).toBe(first.phase);
    });

    it("listWorkflows returns all registered workflows", () => {
      const manager = createStateManager(testDir, "list-proj");
      manager.createWorkflow("wf-1");
      manager.createWorkflow("wf-2");

      const list = manager.listWorkflows();
      const ids = list.map((w) => w.workflowId);

      expect(ids).toContain("default");
      expect(ids).toContain("wf-1");
      expect(ids).toContain("wf-2");
    });

    it("setActiveWorkflow switches the active workflow context", () => {
      const v2State = createMockV2State({
        workflows: {
          default: { phase: "idle" },
          "feat-switch": { phase: "execute", currentWave: 3, totalWaves: 5 },
        },
      });
      writeState(testDir, v2State);

      const manager = createStateManager(testDir);
      const switched = manager.setActiveWorkflow("feat-switch");
      expect(switched).toBe(true);

      const state = manager.getState();
      expect(state.workflow.phase).toBe("execute");
      expect(state.workflow.currentWave).toBe(3);
    });

    it("setActiveWorkflow returns false for non-existent workflow", () => {
      const manager = createStateManager(testDir);
      const result = manager.setActiveWorkflow("non-existent");
      expect(result).toBe(false);
    });

    it("getActiveWorkflowId returns the current active workflow id", () => {
      const manager = createStateManager(testDir, "proj", undefined, undefined, "my-wf");
      expect(manager.getActiveWorkflowId()).toBe("my-wf");
    });
  });

  // --------------------------------------------------------------------------
  // Default workflow backward compat
  // --------------------------------------------------------------------------

  describe("backward compatibility — default workflow", () => {
    it("fresh project with no workflowId param behaves identically to before", () => {
      const manager = createStateManager(testDir, "compat-project");
      const state = manager.getState();

      expect(state.version).toBe(2);
      expect(state.project.name).toBe("compat-project");
      expect(state.workflow.phase).toBe("idle");
      expect(manager.getActiveWorkflowId()).toBe("default");

      // state.json is at root — trigger write first
      manager.setState({});
      expect(existsSync(join(testDir, ".goopspec", "state.json"))).toBe(true);

      // No sub-directory for default
      expect(existsSync(join(testDir, ".goopspec", "default"))).toBe(false);
    });

    it("ADL for default workflow writes to .goopspec/ADL.md", () => {
      const manager = createStateManager(testDir, "compat-project");
      manager.appendADL({
        timestamp: new Date().toISOString(),
        type: "decision",
        description: "Compat test decision",
        action: "No action",
      });

      const adlPath = join(testDir, ".goopspec", "ADL.md");
      expect(existsSync(adlPath)).toBe(true);
      const content = readFileSync(adlPath, "utf-8");
      expect(content).toContain("Compat test decision");
    });

    it("ADL for non-default workflow writes to .goopspec/<id>/ADL.md", () => {
      const manager = createStateManager(testDir, "feat-project", undefined, undefined, "feat-adl");
      manager.appendADL({
        timestamp: new Date().toISOString(),
        type: "observation",
        description: "Feature workflow observation",
        action: "Observed something",
      });

      const wfAdlPath = join(testDir, ".goopspec", "feat-adl", "ADL.md");
      const rootAdlPath = join(testDir, ".goopspec", "ADL.md");

      expect(existsSync(wfAdlPath)).toBe(true);
      expect(existsSync(rootAdlPath)).toBe(false);

      const content = readFileSync(wfAdlPath, "utf-8");
      expect(content).toContain("Feature workflow observation");
    });
  });

  // --------------------------------------------------------------------------
  // Global files are never scoped to workflows
  // --------------------------------------------------------------------------

  describe("global file placement", () => {
    it("getProjectGoopspecDir always returns root .goopspec/ regardless of workflow", () => {
      const dir = getProjectGoopspecDir(testDir);
      expect(dir).toBe(join(testDir, ".goopspec"));
    });

    it("state.json is always written to .goopspec/ root", () => {
      // Sequential: each manager reads the prior state from disk and adds its workflow.
      // Use a single manager to create multiple workflows to guarantee all are in one file.
      const mgr = createStateManager(testDir, "global-test");
      mgr.createWorkflow("alpha"); // won't save — "default" already exists, alpha is new
      // createWorkflow returns early for "default" (already in default state),
      // but "alpha" is genuinely new so it triggers saveState
      mgr.createWorkflow("beta");
      mgr.createWorkflow("gamma");

      const statePath = join(testDir, ".goopspec", "state.json");
      expect(existsSync(statePath)).toBe(true);

      const raw = JSON.parse(readFileSync(statePath, "utf-8")) as {
        workflows: Record<string, unknown>;
      };

      expect(Object.keys(raw.workflows)).toContain("default");
      expect(Object.keys(raw.workflows)).toContain("alpha");
      expect(Object.keys(raw.workflows)).toContain("beta");
      expect(Object.keys(raw.workflows)).toContain("gamma");
    });
  });
});
