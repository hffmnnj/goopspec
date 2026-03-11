/**
 * Tests for State Manager
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { createStateManager, initializeGoopspec } from "./manager.js";
import { createSession } from "../session/manager.js";
import type { ADLEntry, HistoryEntry } from "../../core/types.js";

// Use a temp directory for tests
const TEST_DIR = join(tmpdir(), `goopspec-test-${Date.now()}`);

describe("state-manager", () => {
  beforeEach(() => {
    // Create fresh test directory
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    // Cleanup
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
  });

  describe("createStateManager", () => {
    it("should create a state manager", () => {
      const manager = createStateManager(TEST_DIR);
      expect(manager).toBeTruthy();
      expect(typeof manager.getState).toBe("function");
      expect(typeof manager.setState).toBe("function");
    });
  });

  describe("getState", () => {
    it("should return default state when no state file exists", () => {
      const manager = createStateManager(TEST_DIR, "test-project");
      const state = manager.getState();
      
      expect(state.version).toBe(2);
      expect(state.project.name).toBe("test-project");
      expect(state.workflow.phase).toBe("idle");
      expect(state.workflow.workflowId).toBe("default");
      expect(state.workflow.mode).toBe("standard");
      expect(state.workflow.specLocked).toBe(false);
      expect(state.workflow.acceptanceConfirmed).toBe(false);
      expect(state.workflow.currentWave).toBe(0);
      expect(state.workflow.totalWaves).toBe(0);
      expect(state.workflow.currentPhase).toBeNull();
      expect(state.execution.completedPhases).toEqual([]);
      expect(state.workflows?.default).toBeDefined();
    });

    it("should return cached state on subsequent calls", () => {
      const manager = createStateManager(TEST_DIR);
      const state1 = manager.getState();
      const state2 = manager.getState();
      
      expect(state1).toBe(state2); // Same reference
    });
  });

  describe("setState", () => {
    it("should update state", () => {
      const manager = createStateManager(TEST_DIR);
      
      manager.setState({
        project: { name: "updated", initialized: new Date().toISOString() }
      });
      
      const state = manager.getState();
      expect(state.project.name).toBe("updated");
    });

    it("should persist state to disk", () => {
      const manager = createStateManager(TEST_DIR);
      manager.setState({
        project: { name: "persisted", initialized: new Date().toISOString() }
      });
      
      // Create new manager to read from disk
      const manager2 = createStateManager(TEST_DIR);
      const state = manager2.getState();
      expect(state.project.name).toBe("persisted");
    });

    it("should update lastActivity on changes", () => {
      const manager = createStateManager(TEST_DIR);
      const before = manager.getState().workflow.lastActivity;
      
      // Small delay to ensure different timestamp
      const delay = (ms: number) => new Promise(r => setTimeout(r, ms));
      return delay(10).then(() => {
        manager.setState({});
        const after = manager.getState().workflow.lastActivity;
        expect(after).not.toBe(before);
      });
    });
  });

  describe("updateWorkflow", () => {
    it("should update workflow section", () => {
      const manager = createStateManager(TEST_DIR);
      
      manager.updateWorkflow({
        phase: "plan",
        currentPhase: "phase-1"
      });
      
      const state = manager.getState();
      expect(state.workflow.phase).toBe("plan");
      expect(state.workflow.currentPhase).toBe("phase-1");
    });
  });

  describe("ADL operations", () => {
    it("should create default ADL if not exists", () => {
      const manager = createStateManager(TEST_DIR);
      const adl = manager.getADL();
      
      expect(adl).toContain("# Automated Decision Log");
    });

    it("should append ADL entries", () => {
      const manager = createStateManager(TEST_DIR);
      
      const entry: ADLEntry = {
        timestamp: new Date().toISOString(),
        type: "decision",
        description: "Test decision",
        action: "Did something",
        rule: 1,
        files: ["test.ts"],
      };
      
      manager.appendADL(entry);
      
      const adl = manager.getADL();
      expect(adl).toContain("[DECISION]");
      expect(adl).toContain("Test decision");
      expect(adl).toContain("Did something");
      expect(adl).toContain("Rule 1");
      expect(adl).toContain("test.ts");
    });

    it("should append multiple entries", () => {
      const manager = createStateManager(TEST_DIR);
      
      manager.appendADL({
        timestamp: new Date().toISOString(),
        type: "decision",
        description: "First",
        action: "Action 1",
      });
      
      manager.appendADL({
        timestamp: new Date().toISOString(),
        type: "deviation",
        description: "Second",
        action: "Action 2",
      });
      
      const adl = manager.getADL();
      expect(adl).toContain("First");
      expect(adl).toContain("Second");
      expect(adl).toContain("[DECISION]");
      expect(adl).toContain("[DEVIATION]");
    });

    it("should skip ADL append when adlEnabled is false", () => {
      const manager = createStateManager(TEST_DIR, undefined, { adlEnabled: false });

      manager.appendADL({
        timestamp: new Date().toISOString(),
        type: "decision",
        description: "Should be skipped",
        action: "No write",
      });

      const adl = manager.getADL();
      expect(adl).not.toContain("Should be skipped");
    });
  });

  describe("checkpoint operations", () => {
    it("should save and load checkpoint", () => {
      const manager = createStateManager(TEST_DIR);
      const state = manager.getState();
      
      manager.saveCheckpoint("cp-1", {
        timestamp: new Date().toISOString(),
        state,
        context: { foo: "bar" },
      });
      
      const loaded = manager.loadCheckpoint("cp-1");
      expect(loaded).not.toBeNull();
      expect(loaded?.id).toBe("cp-1");
      expect(loaded?.context?.foo).toBe("bar");
    });

    it("should return null for non-existent checkpoint", () => {
      const manager = createStateManager(TEST_DIR);
      const loaded = manager.loadCheckpoint("non-existent");
      expect(loaded).toBeNull();
    });

    it("should list checkpoints", () => {
      const manager = createStateManager(TEST_DIR);
      const state = manager.getState();
      
      manager.saveCheckpoint("cp-a", {
        timestamp: new Date().toISOString(),
        state,
      });
      
      manager.saveCheckpoint("cp-b", {
        timestamp: new Date().toISOString(),
        state,
      });
      
      const list = manager.listCheckpoints();
      expect(list).toContain("cp-a");
      expect(list).toContain("cp-b");
      expect(list.length).toBe(2);
    });

    it("should return empty list when no checkpoints", () => {
      const manager = createStateManager(TEST_DIR);
      const list = manager.listCheckpoints();
      expect(list).toEqual([]);
    });
  });

  describe("history operations", () => {
    it("should append history entry", () => {
      const manager = createStateManager(TEST_DIR);
      
      const entry: HistoryEntry = {
        timestamp: new Date().toISOString(),
        type: "tool_call",
        sessionId: "session-1",
        data: { tool: "goop_status" },
      };
      
      manager.appendHistory(entry);
      
      // Verify file was created
      const today = new Date().toISOString().split("T")[0];
      const historyPath = join(TEST_DIR, ".goopspec", "history", `${today}.json`);
      expect(existsSync(historyPath)).toBe(true);
      
      const content = JSON.parse(readFileSync(historyPath, "utf-8"));
      expect(content.length).toBe(1);
      expect(content[0].type).toBe("tool_call");
    });

    it("should append multiple entries to same day file", () => {
      const manager = createStateManager(TEST_DIR);
      
      manager.appendHistory({
        timestamp: new Date().toISOString(),
        type: "tool_call",
        data: { tool: "tool1" },
      });
      
      manager.appendHistory({
        timestamp: new Date().toISOString(),
        type: "phase_change",
        data: { phase: "phase-1" },
      });
      
      const today = new Date().toISOString().split("T")[0];
      const historyPath = join(TEST_DIR, ".goopspec", "history", `${today}.json`);
      const content = JSON.parse(readFileSync(historyPath, "utf-8"));
      
      expect(content.length).toBe(2);
    });
  });

  describe("initializeGoopspec", () => {
    it("should initialize .goopspec directory", async () => {
      await initializeGoopspec(TEST_DIR, "my-project");
      
      const goopspecDir = join(TEST_DIR, ".goopspec");
      expect(existsSync(goopspecDir)).toBe(true);
      expect(existsSync(join(goopspecDir, "state.json"))).toBe(true);
      expect(existsSync(join(goopspecDir, "ADL.md"))).toBe(true);
    });

    it("should set project name", async () => {
      await initializeGoopspec(TEST_DIR, "custom-name");
      
      const manager = createStateManager(TEST_DIR);
      const state = manager.getState();
      expect(state.project.name).toBe("custom-name");
    });
  });

  describe("transitionPhase", () => {
    it("should transition from idle to plan", () => {
      const manager = createStateManager(TEST_DIR);
      const result = manager.transitionPhase("plan");
      
      expect(result).toBe(true);
      const state = manager.getState();
      expect(state.workflow.phase).toBe("plan");
    });

    it("should reject invalid transitions", () => {
      const manager = createStateManager(TEST_DIR);
      const result = manager.transitionPhase("execute");
      
      expect(result).toBe(false);
      const state = manager.getState();
      expect(state.workflow.phase).toBe("idle");
    });

    it("should track completed phases", () => {
      const manager = createStateManager(TEST_DIR);
      
      manager.transitionPhase("plan");
      manager.transitionPhase("research");
      
      const state = manager.getState();
      expect(state.execution.completedPhases).toContain("plan");
    });

    it("should log phase transitions to history", () => {
      const manager = createStateManager(TEST_DIR);
      manager.transitionPhase("plan");
      
      const today = new Date().toISOString().split("T")[0];
      const historyPath = join(TEST_DIR, ".goopspec", "history", `${today}.json`);
      expect(existsSync(historyPath)).toBe(true);
      
      const content = JSON.parse(readFileSync(historyPath, "utf-8"));
      const phaseChange = content.find((e: HistoryEntry) => e.type === "phase_change");
      expect(phaseChange).toBeTruthy();
      expect(phaseChange.data.from).toBe("idle");
      expect(phaseChange.data.to).toBe("plan");
    });
  });

  describe("lockSpec", () => {
    it("should lock the spec", () => {
      const manager = createStateManager(TEST_DIR);
      manager.lockSpec();
      
      const state = manager.getState();
      expect(state.workflow.specLocked).toBe(true);
    });
  });

  describe("confirmAcceptance", () => {
    it("should confirm acceptance", () => {
      const manager = createStateManager(TEST_DIR);
      manager.confirmAcceptance();
      
      const state = manager.getState();
      expect(state.workflow.acceptanceConfirmed).toBe(true);
    });
  });

  describe("setMode", () => {
    it("should set task mode", () => {
      const manager = createStateManager(TEST_DIR);
      manager.setMode("quick");
      
      const state = manager.getState();
      expect(state.workflow.mode).toBe("quick");
    });
  });

  describe("updateWaveProgress", () => {
    it("should update wave progress", () => {
      const manager = createStateManager(TEST_DIR);
      manager.updateWaveProgress(2, 5);
      
      const state = manager.getState();
      expect(state.workflow.currentWave).toBe(2);
      expect(state.workflow.totalWaves).toBe(5);
    });
  });

  describe("multi-workflow", () => {
    it("default state has workflows map with 'default' entry", () => {
      const manager = createStateManager(TEST_DIR);
      const state = manager.getState();

      expect(state.workflows).toBeDefined();
      expect(state.workflows?.default).toBeDefined();
      expect(state.workflows?.default.workflowId).toBe("default");
      expect(state.workflows?.default.phase).toBe("idle");
    });

    it("getWorkflow returns workflow by id", () => {
      const manager = createStateManager(TEST_DIR);
      manager.createWorkflow("feat-x");

      const workflow = manager.getWorkflow("feat-x");
      expect(workflow).not.toBeNull();
      expect(workflow?.workflowId).toBe("feat-x");
    });

    it("listWorkflows returns all workflows", () => {
      const manager = createStateManager(TEST_DIR);
      manager.createWorkflow("feat-a");
      manager.createWorkflow("feat-b");

      const workflows = manager.listWorkflows();
      expect(workflows.some((workflow) => workflow.workflowId === "default")).toBe(true);
      expect(workflows.some((workflow) => workflow.workflowId === "feat-a")).toBe(true);
      expect(workflows.some((workflow) => workflow.workflowId === "feat-b")).toBe(true);
    });

    it("setActiveWorkflow switches active workflow", () => {
      const manager = createStateManager(TEST_DIR);
      manager.createWorkflow("feat-a");
      manager.createWorkflow("feat-b");

      manager.setActiveWorkflow("feat-b");
      manager.updateWorkflow({ phase: "plan" });

      const activeState = manager.getState();
      const featB = manager.getWorkflow("feat-b");
      expect(activeState.workflow.workflowId).toBe("feat-b");
      expect(activeState.workflow.phase).toBe("plan");
      expect(featB?.phase).toBe("plan");
    });

    it("createWorkflow adds new entry to workflows map", () => {
      const manager = createStateManager(TEST_DIR);
      manager.createWorkflow("feat-x");

      const state = manager.getState();
      expect(state.workflows?.["feat-x"]).toBeDefined();
      expect(manager.getWorkflow("feat-x")).not.toBeNull();
    });

    it("getActiveWorkflowId returns current workflow id", () => {
      const manager = createStateManager(TEST_DIR);
      expect(manager.getActiveWorkflowId()).toBe("default");
    });
  });

  describe("migration v1 -> v2", () => {
    it("v1 migration: preserves workflow as default entry", () => {
      const goopspecDir = join(TEST_DIR, ".goopspec");
      mkdirSync(goopspecDir, { recursive: true });

      const v1State = {
        version: 1,
        project: {
          name: "v1-project",
          initialized: new Date().toISOString(),
        },
        workflow: {
          currentPhase: "legacy-phase",
          phase: "execute",
          mode: "comprehensive",
          depth: "deep",
          researchOptIn: true,
          specLocked: true,
          acceptanceConfirmed: false,
          interviewComplete: true,
          interviewCompletedAt: new Date().toISOString(),
          currentWave: 3,
          totalWaves: 9,
          lastActivity: new Date().toISOString(),
          autopilot: true,
          lazyAutopilot: false,
          status: "execute",
        },
        execution: {
          activeCheckpointId: null,
          completedPhases: ["plan", "research", "specify"],
          pendingTasks: [],
        },
      };

      const statePath = join(goopspecDir, "state.json");
      mkdirSync(goopspecDir, { recursive: true });
      writeFileSync(statePath, JSON.stringify(v1State, null, 2), "utf-8");

      const manager = createStateManager(TEST_DIR);
      const state = manager.getState();

      expect(state.version).toBe(2);
      expect(state.workflows?.default).toBeDefined();
      expect(state.workflows?.default.workflowId).toBe("default");
      expect(state.workflows?.default.phase).toBe("execute");
      expect(state.workflows?.default.currentPhase).toBe("legacy-phase");
      expect(state.workflows?.default.currentWave).toBe(3);
      expect(state.workflows?.default.totalWaves).toBe(9);
    });

    it("v1 migration: creates backup file", () => {
      const goopspecDir = join(TEST_DIR, ".goopspec");
      mkdirSync(goopspecDir, { recursive: true });

      const v1State = {
        version: 1,
        project: {
          name: "backup-project",
          initialized: new Date().toISOString(),
        },
        workflow: {
          currentPhase: null,
          phase: "idle",
          mode: "standard",
          depth: "standard",
          researchOptIn: false,
          specLocked: false,
          acceptanceConfirmed: false,
          interviewComplete: false,
          interviewCompletedAt: null,
          currentWave: 0,
          totalWaves: 0,
          lastActivity: new Date().toISOString(),
          status: "idle",
        },
        execution: {
          activeCheckpointId: null,
          completedPhases: [],
          pendingTasks: [],
        },
      };

      const statePath = join(goopspecDir, "state.json");
      writeFileSync(statePath, JSON.stringify(v1State, null, 2), "utf-8");

      const manager = createStateManager(TEST_DIR);
      manager.getState();

      const backupPath = `${statePath}.v1-backup`;
      expect(existsSync(backupPath)).toBe(true);
    });
  });

  describe("session-aware routing", () => {
    it("should persist state at root even when session is provided", () => {
      createSession(TEST_DIR, "feat-auth");
      const manager = createStateManager(TEST_DIR, "session-project", undefined, "feat-auth");

      manager.setState({
        project: {
          name: "session-project",
          initialized: new Date().toISOString(),
        },
      });

      const sessionStatePath = join(
        TEST_DIR,
        ".goopspec",
        "sessions",
        "feat-auth",
        "state.json",
      );
      const rootStatePath = join(TEST_DIR, ".goopspec", "state.json");

      expect(existsSync(sessionStatePath)).toBe(false);
      expect(existsSync(rootStatePath)).toBe(true);
    });

    it("should keep root state path behavior when no session is provided", () => {
      const manager = createStateManager(TEST_DIR, "root-project");

      manager.setState({
        project: {
          name: "root-project",
          initialized: new Date().toISOString(),
        },
      });

      const rootStatePath = join(TEST_DIR, ".goopspec", "state.json");
      expect(existsSync(rootStatePath)).toBe(true);
    });

    it("should write checkpoints and history inside the workflow directory", () => {
      createSession(TEST_DIR, "feat-routing");
      const manager = createStateManager(
        TEST_DIR,
        "routing-project",
        undefined,
        "feat-routing",
        "feat-routing",
      );
      const state = manager.getState();

      manager.saveCheckpoint("cp-session", {
        timestamp: new Date().toISOString(),
        state,
      });

      manager.appendHistory({
        timestamp: new Date().toISOString(),
        type: "tool_call",
        data: { tool: "goop_status" },
      });

      const sessionCheckpointPath = join(
        TEST_DIR,
        ".goopspec",
        "feat-routing",
        "checkpoints",
        "cp-session.json",
      );
      const today = new Date().toISOString().split("T")[0];
      const sessionHistoryPath = join(
        TEST_DIR,
        ".goopspec",
        "feat-routing",
        "history",
        `${today}.json`,
      );

      expect(existsSync(sessionCheckpointPath)).toBe(true);
      expect(existsSync(sessionHistoryPath)).toBe(true);
    });

    it("should sync session phase and mode metadata to active session index", () => {
      createSession(TEST_DIR, "feat-sync");
      const manager = createStateManager(TEST_DIR, "sync-project", undefined, "feat-sync");

      manager.transitionPhase("plan");
      manager.setMode("quick");

      const indexPath = join(TEST_DIR, ".goopspec", "sessions", "_active.json");
      const index = JSON.parse(readFileSync(indexPath, "utf-8")) as {
        sessions: Array<{ id: string; phase: string; mode: string; lastActivity: string }>;
      };
      const target = index.sessions.find((session) => session.id === "feat-sync");

      expect(target).toBeDefined();
      expect(target?.phase).toBe("plan");
      expect(target?.mode).toBe("quick");
      expect(typeof target?.lastActivity).toBe("string");
    });
  });
});
