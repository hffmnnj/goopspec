/**
 * End-to-end integration test for the GoopSpec 5-phase workflow.
 *
 * Proves that the full plugin lifecycle wires together: context assembly,
 * phase transitions, gates, document scaffolding, enforcement, routing,
 * and auto-delegation. Exercises real subsystem implementations (state
 * manager, enforcement, routing) against the mock PluginContext.
 *
 * Covers: MH3 (rebuild plugin), MH5 (core principles), MH15 (validation
 * contract gate), MH18 (auto-delegation).
 *
 * @module integration.test
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { createPluginContext } from "./core/context.js";
import type { PluginInput } from "./core/sdk-compat.js";
import {
  type SpecContract,
  canStartExecution,
  canStartPlanning,
  checkContractGate,
  checkPhaseDocuments,
  getRequiredDocuments,
  isOrchestratorCodeWrite,
  scaffoldPhaseDocuments,
  validateSpecContract,
} from "./features/enforcement/index.js";
import { detectAutoDelegation } from "./features/routing/index.js";
import { createHooks } from "./hooks/index.js";
import {
  createDefaultWorkflowState,
  createMockPluginContext,
  createMockStateManager,
  setupTestEnvironment,
} from "./test-utils.js";
import { createTools } from "./tools/index.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockPluginInput(directory: string): PluginInput {
  return {
    client: {} as PluginInput["client"],
    project: {} as PluginInput["project"],
    directory,
    worktree: directory,
    serverUrl: new URL("http://localhost:0"),
    experimental_workspace: {
      register: () => {},
    },
    $: (async () => ({
      stdout: Buffer.from(""),
      stderr: Buffer.from(""),
      exitCode: 0,
    })) as unknown as PluginInput["$"],
  };
}

// ---------------------------------------------------------------------------
// Integration Tests
// ---------------------------------------------------------------------------

describe("GoopSpec 5-phase integration", () => {
  let testDir: string;
  let cleanup: () => void;

  beforeEach(() => {
    const env = setupTestEnvironment("integration");
    testDir = env.testDir;
    cleanup = env.cleanup;
  });

  afterEach(() => cleanup());

  // ========================================================================
  // 1. Context assembly
  // ========================================================================

  describe("context assembly", () => {
    it("createPluginContext produces a context with all six subsystems", async () => {
      const input = createMockPluginInput(testDir);
      const ctx = await createPluginContext(input);

      expect(ctx.sdk).toBeDefined();
      expect(ctx.sdk.directory).toBe(testDir);
      expect(ctx.stateManager).toBeDefined();
      expect(ctx.memory).toBeDefined();
      expect(ctx.resolver).toBeDefined();
      expect(ctx.session).toBeDefined();
      expect(ctx.sessionManager).toBeDefined();
    });

    it("createTools produces exactly 32 tools from a real context", async () => {
      const input = createMockPluginInput(testDir);
      const ctx = await createPluginContext(input);
      const tools = createTools(ctx);

      const toolNames = Object.keys(tools);
      expect(toolNames).toHaveLength(33);

      // Verify all expected tool names are present
      const expectedTools = [
        "goop_status",
        "goop_state",
        "goop_spec",
        "goop_adl",
        "goop_checkpoint",
        "goop_setup",
        "goop_get_global_config",
        "goop_reference",
        "goop_read_db",
        "goop_write_db",
        "goop_save_note",
        "goop_search_notes",
        "goop_append_chronicle",
        "goop_boot",
        "goop_create_pr",
        "goop_write_section",
        "goop_read_section",
        "goop_write_wave",
        "goop_read_waves",
        "goop_query_decisions",
        "goop_record_verification",
        "goop_read_verifications",
        "goop_blocker",
        "goop_write_traceability",
        "goop_search_docs",
        "goop_timeline",
        "goop_dashboard",
        "goop_infer_intent",
        "memory_save",
        "memory_search",
        "memory_forget",
        "slashcommand",
      ];
      for (const name of expectedTools) {
        expect(toolNames).toContain(name);
      }
    });

    it("createHooks produces a non-empty hooks object", async () => {
      const input = createMockPluginInput(testDir);
      const ctx = await createPluginContext(input);
      const hooks = createHooks(ctx);

      expect(typeof hooks).toBe("object");
      expect(hooks).not.toBeNull();
    });

    it("mock context also wires up correctly for tools and hooks", () => {
      const ctx = createMockPluginContext({ testDir });
      const tools = createTools(ctx);
      const hooks = createHooks(ctx);

      expect(Object.keys(tools)).toHaveLength(33);
      expect(typeof hooks).toBe("object");
    });
  });

  // ========================================================================
  // 2. Discuss → Plan gate
  // ========================================================================

  describe("discuss → plan gate", () => {
    it("canStartPlanning denies when interview is not complete (standard mode)", () => {
      const workflow = createDefaultWorkflowState({
        phase: "discuss",
        mode: "standard",
        interviewComplete: false,
      });

      const result = canStartPlanning(workflow);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("interview");
    });

    it("canStartPlanning allows after completeInterview", () => {
      const mgr = createMockStateManager();
      mgr.transitionPhase("discuss");
      mgr.completeInterview();

      const workflow = mgr.getActiveWorkflow();
      const result = canStartPlanning(workflow);
      expect(result.allowed).toBe(true);
    });

    it("canStartPlanning allows in quick mode even without interview", () => {
      const workflow = createDefaultWorkflowState({
        phase: "discuss",
        mode: "quick",
        interviewComplete: false,
      });

      const result = canStartPlanning(workflow);
      expect(result.allowed).toBe(true);
    });
  });

  // ========================================================================
  // 3. Validation-contract gate (MH15)
  // ========================================================================

  describe("validation-contract gate (MH15)", () => {
    const incompleteContract: SpecContract = {
      vision: "Build something",
      mustHaves: ["Feature A"],
      // missing: outOfScope, risks, constraints
    };

    const completeContract: SpecContract = {
      vision: "Build a complete system",
      mustHaves: ["Feature A", "Feature B"],
      outOfScope: ["Feature C"],
      risks: ["Risk 1"],
      constraints: ["Constraint 1"],
    };

    it("validateSpecContract rejects incomplete contract", () => {
      const result = validateSpecContract(incompleteContract);
      expect(result.valid).toBe(false);
      expect(result.missing).toContain("outOfScope");
      expect(result.missing).toContain("risks");
      expect(result.missing).toContain("constraints");
      expect(result.missing.length).toBe(3);
    });

    it("validateSpecContract accepts complete contract", () => {
      const result = validateSpecContract(completeContract);
      expect(result.valid).toBe(true);
      expect(result.missing).toHaveLength(0);
    });

    it("checkContractGate rejects incomplete contract in standard mode", () => {
      const result = checkContractGate(incompleteContract, "standard");
      expect(result.valid).toBe(false);
      expect(result.missing.length).toBeGreaterThan(0);
    });

    it("checkContractGate accepts complete contract in standard mode", () => {
      const result = checkContractGate(completeContract, "standard");
      expect(result.valid).toBe(true);
    });

    it("checkContractGate bypasses in quick mode (valid even when incomplete)", () => {
      const result = checkContractGate(incompleteContract, "quick");
      expect(result.valid).toBe(true);
      expect(result.missing).toHaveLength(0);
    });

    it("checkContractGate enforces in comprehensive mode", () => {
      const result = checkContractGate(incompleteContract, "comprehensive");
      expect(result.valid).toBe(false);
    });

    it("checkContractGate enforces in milestone mode", () => {
      const result = checkContractGate(incompleteContract, "milestone");
      expect(result.valid).toBe(false);
    });
  });

  // ========================================================================
  // 4. Plan → Execute gate
  // ========================================================================

  describe("plan → execute gate", () => {
    it("canStartExecution denies when spec is not locked", () => {
      const workflow = createDefaultWorkflowState({
        phase: "plan",
        specLocked: false,
        interviewComplete: true,
      });

      const result = canStartExecution(workflow);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("locked");
    });

    it("canStartExecution allows after lockSpec", () => {
      const mgr = createMockStateManager();
      mgr.transitionPhase("discuss");
      mgr.completeInterview();
      mgr.transitionPhase("plan");
      mgr.lockSpec();

      const workflow = mgr.getActiveWorkflow();
      const result = canStartExecution(workflow);
      expect(result.allowed).toBe(true);
    });

    it("canStartExecution denies when interview not complete in standard mode", () => {
      const workflow = createDefaultWorkflowState({
        phase: "plan",
        specLocked: true,
        interviewComplete: false,
        mode: "standard",
      });

      const result = canStartExecution(workflow);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("interview");
    });

    it("canStartExecution allows in quick mode without interview", () => {
      const workflow = createDefaultWorkflowState({
        phase: "plan",
        specLocked: true,
        interviewComplete: false,
        mode: "quick",
      });

      const result = canStartExecution(workflow);
      expect(result.allowed).toBe(true);
    });
  });

  // ========================================================================
  // 5. Document scaffolding
  // ========================================================================

  describe("document scaffolding", () => {
    it("getRequiredDocuments returns expected docs for execute phase", () => {
      const docs = getRequiredDocuments("execute");
      expect(docs).toContain("SPEC.md");
      expect(docs).toContain("BLUEPRINT.md");
      expect(docs).toContain("CHRONICLE.md");
      expect(docs).toContain("ADL.md");
    });

    it("getRequiredDocuments returns SPEC.md and RESEARCH.md for plan phase", () => {
      const docs = getRequiredDocuments("plan");
      expect(docs).toContain("SPEC.md");
      expect(docs).toContain("RESEARCH.md");
    });

    it("getRequiredDocuments returns empty for idle phase", () => {
      const docs = getRequiredDocuments("idle");
      expect(docs).toHaveLength(0);
    });

    it("scaffoldPhaseDocuments creates missing docs in temp dir", () => {
      const workflowId = "test-workflow";
      const result = scaffoldPhaseDocuments(testDir, workflowId, "execute");

      expect(result.errors).toHaveLength(0);
      expect(result.created.length).toBeGreaterThan(0);

      // Verify files actually exist on disk
      for (const docName of result.created) {
        const docPath = join(testDir, ".goopspec", workflowId, docName);
        expect(existsSync(docPath)).toBe(true);
      }
    });

    it("scaffoldPhaseDocuments skips existing docs", () => {
      const workflowId = "test-workflow";

      // First scaffold creates docs
      const first = scaffoldPhaseDocuments(testDir, workflowId, "execute");
      expect(first.created.length).toBeGreaterThan(0);

      // Second scaffold skips them
      const second = scaffoldPhaseDocuments(testDir, workflowId, "execute");
      expect(second.created).toHaveLength(0);
      expect(second.skipped.length).toBeGreaterThan(0);
    });

    it("checkPhaseDocuments reports presence after scaffolding", () => {
      const workflowId = "test-workflow";

      // Before scaffolding: all missing
      const before = checkPhaseDocuments(testDir, workflowId, "execute");
      expect(before.valid).toBe(false);
      expect(before.missing.length).toBeGreaterThan(0);

      // Scaffold
      scaffoldPhaseDocuments(testDir, workflowId, "execute");

      // After scaffolding: all present
      const after = checkPhaseDocuments(testDir, workflowId, "execute");
      expect(after.valid).toBe(true);
      expect(after.missing).toHaveLength(0);
      expect(after.existing.length).toBeGreaterThan(0);
    });
  });

  // ========================================================================
  // 6. Orchestrator enforcement
  // ========================================================================

  describe("orchestrator enforcement", () => {
    it("denies orchestrator writing implementation code", () => {
      const result = isOrchestratorCodeWrite("orchestrator", "src/foo.ts");
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("Orchestrator");
    });

    it("allows executor writing implementation code", () => {
      const result = isOrchestratorCodeWrite("executor-medium", "src/foo.ts");
      expect(result.allowed).toBe(true);
    });

    it("allows orchestrator writing .goopspec docs", () => {
      const result = isOrchestratorCodeWrite("orchestrator", ".goopspec/SPEC.md");
      expect(result.allowed).toBe(true);
    });

    it("allows orchestrator writing non-code files", () => {
      const result = isOrchestratorCodeWrite("orchestrator", "README.md");
      expect(result.allowed).toBe(true);
    });

    it("allows orchestrator writing config files in src", () => {
      const result = isOrchestratorCodeWrite("orchestrator", "src/config.json");
      expect(result.allowed).toBe(true);
    });
  });

  // ========================================================================
  // 7. Auto-delegation (MH18)
  // ========================================================================

  describe("auto-delegation (MH18)", () => {
    it("detects research intent and routes to researcher", () => {
      const result = detectAutoDelegation("research the best auth library");
      expect(result.detected).toBe(true);
      expect(result.agent).toBe("researcher");
      expect(result.intent).toBe("research");
    });

    it("detects debug intent and routes to debugger", () => {
      const result = detectAutoDelegation("debug the failing login test");
      expect(result.detected).toBe(true);
      expect(result.agent).toBe("debugger");
      expect(result.intent).toBe("debug");
    });

    it("returns no delegation for generic implementation prompts", () => {
      const result = detectAutoDelegation("implement the user profile feature");
      expect(result.detected).toBe(false);
      expect(result.agent).toBeUndefined();
      expect(result.intent).toBeUndefined();
    });

    it("prioritises debug over research when both signals present", () => {
      const result = detectAutoDelegation("debug and research why the test is failing");
      expect(result.detected).toBe(true);
      expect(result.agent).toBe("debugger");
      expect(result.intent).toBe("debug");
    });

    it("detects troubleshoot as debug intent", () => {
      const result = detectAutoDelegation("troubleshoot the connection timeout");
      expect(result.detected).toBe(true);
      expect(result.agent).toBe("debugger");
      expect(result.intent).toBe("debug");
    });

    it("detects feasibility as research intent", () => {
      const result = detectAutoDelegation("check feasibility of using WebSockets");
      expect(result.detected).toBe(true);
      expect(result.agent).toBe("researcher");
      expect(result.intent).toBe("research");
    });
  });

  // ========================================================================
  // 8. Phase transitions (full lifecycle)
  // ========================================================================

  describe("phase transitions (full lifecycle)", () => {
    it("drives stateManager through idle → discuss → plan → execute → accept", () => {
      const mgr = createMockStateManager();

      // Start at idle
      expect(mgr.getActiveWorkflow().phase).toBe("idle");

      // idle → discuss
      mgr.transitionPhase("discuss");
      expect(mgr.getActiveWorkflow().phase).toBe("discuss");

      // Complete interview (required for plan gate)
      mgr.completeInterview();
      expect(mgr.getActiveWorkflow().interviewComplete).toBe(true);

      // discuss → plan
      mgr.transitionPhase("plan");
      expect(mgr.getActiveWorkflow().phase).toBe("plan");

      // Lock spec (required for execute gate)
      mgr.lockSpec();
      expect(mgr.getActiveWorkflow().specLocked).toBe(true);

      // plan → execute
      mgr.transitionPhase("execute");
      expect(mgr.getActiveWorkflow().phase).toBe("execute");

      // Track wave progress
      mgr.updateWaveProgress(1, 3);
      expect(mgr.getActiveWorkflow().currentWave).toBe(1);
      expect(mgr.getActiveWorkflow().totalWaves).toBe(3);

      // execute → accept
      mgr.transitionPhase("accept");
      expect(mgr.getActiveWorkflow().phase).toBe("accept");

      // Confirm acceptance
      mgr.confirmAcceptance();
      expect(mgr.getActiveWorkflow().acceptanceConfirmed).toBe(true);

      // accept → idle (cycle complete)
      mgr.transitionPhase("idle");
      expect(mgr.getActiveWorkflow().phase).toBe("idle");
    });

    it("rejects invalid phase transitions", () => {
      const mgr = createMockStateManager();

      // idle → execute (skipping discuss/plan) should throw
      expect(() => mgr.transitionPhase("execute")).toThrow();

      // idle → accept should throw
      expect(() => mgr.transitionPhase("accept")).toThrow();
    });

    it("allows forced transitions that bypass validation", () => {
      const mgr = createMockStateManager();

      // Force idle → execute (normally invalid)
      mgr.transitionPhase("execute", true);
      expect(mgr.getActiveWorkflow().phase).toBe("execute");
    });

    it("supports multi-workflow state with independent phases", () => {
      const mgr = createMockStateManager();

      // Create a second workflow
      mgr.createWorkflow("feature-auth");

      // Default workflow stays at idle
      expect(mgr.getActiveWorkflow().phase).toBe("idle");

      // Switch to feature-auth and advance it
      mgr.setActiveWorkflow("feature-auth");
      mgr.transitionPhase("discuss");
      expect(mgr.getActiveWorkflow().phase).toBe("discuss");

      // Switch back — default is still idle
      mgr.setActiveWorkflow("default");
      expect(mgr.getActiveWorkflow().phase).toBe("idle");

      // feature-auth is still in discuss
      mgr.setActiveWorkflow("feature-auth");
      expect(mgr.getActiveWorkflow().phase).toBe("discuss");
    });

    it("gates integrate with transitions end-to-end", () => {
      const mgr = createMockStateManager();

      // Start workflow
      mgr.transitionPhase("discuss");

      // Gate check: cannot plan without interview
      const planGate1 = canStartPlanning(mgr.getActiveWorkflow());
      expect(planGate1.allowed).toBe(false);

      // Complete interview
      mgr.completeInterview();
      const planGate2 = canStartPlanning(mgr.getActiveWorkflow());
      expect(planGate2.allowed).toBe(true);

      // Transition to plan
      mgr.transitionPhase("plan");

      // Gate check: cannot execute without spec lock
      const execGate1 = canStartExecution(mgr.getActiveWorkflow());
      expect(execGate1.allowed).toBe(false);

      // Lock spec
      mgr.lockSpec();
      const execGate2 = canStartExecution(mgr.getActiveWorkflow());
      expect(execGate2.allowed).toBe(true);

      // Transition to execute
      mgr.transitionPhase("execute");
      expect(mgr.getActiveWorkflow().phase).toBe("execute");
    });

    it("resetWorkflow returns to clean idle state", () => {
      const mgr = createMockStateManager();

      // Advance state
      mgr.transitionPhase("discuss");
      mgr.completeInterview();
      mgr.transitionPhase("plan");
      mgr.lockSpec();
      mgr.setMode("comprehensive");
      mgr.setDepth("deep");

      // Reset
      mgr.resetWorkflow();

      const wf = mgr.getActiveWorkflow();
      expect(wf.phase).toBe("idle");
      expect(wf.interviewComplete).toBe(false);
      expect(wf.specLocked).toBe(false);
      expect(wf.mode).toBe("standard");
      expect(wf.depth).toBe("standard");
    });
  });
});
