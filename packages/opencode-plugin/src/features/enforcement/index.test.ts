import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { WorkflowPhase } from "../../core/constants.js";
import { WORKFLOW_PHASES } from "../../core/constants.js";
import { createDefaultWorkflowState, setupTestEnvironment } from "../../test-utils.js";

import {
  // phase-context
  buildEnforcementContext,
  buildPhaseEnforcement,
  buildStateContext,
  // validators
  canStartExecution,
  canStartPlanning,
  // scaffolder
  checkPhaseDocuments,
  getPhaseRules,
  getRequiredDocuments,
  getWorkflowDocDir,
  getWorkflowDocPath,
  isImplementationFile,
  isOperationAllowed,
  isOrchestratorCodeWrite,
  scaffoldPhaseDocuments,
  validateWriteOperation,
} from "./index.js";

// ============================================================================
// Validators
// ============================================================================

describe("validators", () => {
  describe("isImplementationFile", () => {
    it("returns true for source files in implementation directories", () => {
      expect(isImplementationFile("src/index.ts")).toBe(true);
      expect(isImplementationFile("lib/utils.js")).toBe(true);
      expect(isImplementationFile("app/page.tsx")).toBe(true);
      expect(isImplementationFile("packages/core/src/main.ts")).toBe(true);
      expect(isImplementationFile("server/api.ts")).toBe(true);
      expect(isImplementationFile("client/app.ts")).toBe(true);
    });

    it("returns false for .goopspec files", () => {
      expect(isImplementationFile(".goopspec/SPEC.md")).toBe(false);
      expect(isImplementationFile(".goopspec/state.json")).toBe(false);
      expect(isImplementationFile("project/.goopspec/BLUEPRINT.md")).toBe(false);
    });

    it("returns false for node_modules", () => {
      expect(isImplementationFile("node_modules/lodash/index.js")).toBe(false);
      expect(isImplementationFile("src/node_modules/pkg/index.ts")).toBe(false);
    });

    it("returns false for non-code extensions", () => {
      expect(isImplementationFile("src/README.md")).toBe(false);
      expect(isImplementationFile("src/config.json")).toBe(false);
      expect(isImplementationFile("src/config.yaml")).toBe(false);
      expect(isImplementationFile("src/config.yml")).toBe(false);
      expect(isImplementationFile("src/config.toml")).toBe(false);
      expect(isImplementationFile("src/.env")).toBe(false);
    });

    it("returns false for files outside implementation directories", () => {
      expect(isImplementationFile("README.md")).toBe(false);
      expect(isImplementationFile("package.json")).toBe(false);
      expect(isImplementationFile("docs/guide.ts")).toBe(false);
    });

    it("returns false for empty string", () => {
      expect(isImplementationFile("")).toBe(false);
    });

    it("handles Windows-style paths", () => {
      expect(isImplementationFile("src\\index.ts")).toBe(true);
      expect(isImplementationFile(".goopspec\\SPEC.md")).toBe(false);
    });

    it("handles nested implementation directories", () => {
      expect(isImplementationFile("project/src/deep/nested/file.ts")).toBe(true);
      expect(isImplementationFile("apps/web/src/page.tsx")).toBe(true);
    });
  });

  describe("isOperationAllowed", () => {
    describe("write_code", () => {
      it("allows in idle phase", () => {
        expect(isOperationAllowed("idle", "write_code").allowed).toBe(true);
      });

      it("denies in discuss phase", () => {
        const result = isOperationAllowed("discuss", "write_code");
        expect(result.allowed).toBe(false);
        expect(result.reason).toContain("discuss");
      });

      it("denies in plan phase", () => {
        const result = isOperationAllowed("plan", "write_code");
        expect(result.allowed).toBe(false);
        expect(result.reason).toContain("plan");
      });

      it("allows in execute phase (for executors)", () => {
        expect(isOperationAllowed("execute", "write_code").allowed).toBe(true);
      });

      it("denies in accept phase", () => {
        const result = isOperationAllowed("accept", "write_code");
        expect(result.allowed).toBe(false);
        expect(result.reason).toContain("accept");
      });
    });

    describe("create_doc", () => {
      it("allows in every phase", () => {
        for (const phase of WORKFLOW_PHASES) {
          expect(isOperationAllowed(phase, "create_doc").allowed).toBe(true);
        }
      });
    });

    describe("delegate", () => {
      it("denies in idle, discuss, plan", () => {
        for (const phase of ["idle", "discuss", "plan"] as WorkflowPhase[]) {
          const result = isOperationAllowed(phase, "delegate");
          expect(result.allowed).toBe(false);
          expect(result.reason).toBeDefined();
        }
      });

      it("allows in execute and accept", () => {
        expect(isOperationAllowed("execute", "delegate").allowed).toBe(true);
        expect(isOperationAllowed("accept", "delegate").allowed).toBe(true);
      });
    });

    describe("execute_cmd", () => {
      it("allows in every phase", () => {
        for (const phase of WORKFLOW_PHASES) {
          expect(isOperationAllowed(phase, "execute_cmd").allowed).toBe(true);
        }
      });
    });
  });

  describe("validateWriteOperation", () => {
    it("allows non-implementation files in any phase", () => {
      expect(validateWriteOperation("plan", ".goopspec/SPEC.md").allowed).toBe(true);
      expect(validateWriteOperation("plan", "README.md").allowed).toBe(true);
      expect(validateWriteOperation("discuss", "package.json").allowed).toBe(true);
    });

    it("denies implementation files in plan phase", () => {
      const result = validateWriteOperation("plan", "src/index.ts");
      expect(result.allowed).toBe(false);
    });

    it("allows implementation files in execute phase", () => {
      expect(validateWriteOperation("execute", "src/index.ts").allowed).toBe(true);
    });
  });

  describe("canStartExecution", () => {
    it("allows when spec is locked and interview complete", () => {
      const wf = createDefaultWorkflowState({ specLocked: true, interviewComplete: true });
      expect(canStartExecution(wf).allowed).toBe(true);
    });

    it("denies when spec is not locked", () => {
      const wf = createDefaultWorkflowState({ specLocked: false, interviewComplete: true });
      const result = canStartExecution(wf);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("locked");
    });

    it("denies when interview not complete (standard mode)", () => {
      const wf = createDefaultWorkflowState({
        specLocked: true,
        interviewComplete: false,
        mode: "standard",
      });
      const result = canStartExecution(wf);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("interview");
    });

    it("allows without interview in quick mode", () => {
      const wf = createDefaultWorkflowState({
        specLocked: true,
        interviewComplete: false,
        mode: "quick",
      });
      expect(canStartExecution(wf).allowed).toBe(true);
    });
  });

  describe("canStartPlanning", () => {
    it("allows when interview is complete", () => {
      const wf = createDefaultWorkflowState({ interviewComplete: true });
      expect(canStartPlanning(wf).allowed).toBe(true);
    });

    it("denies when interview not complete (standard mode)", () => {
      const wf = createDefaultWorkflowState({ interviewComplete: false, mode: "standard" });
      const result = canStartPlanning(wf);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("interview");
    });

    it("allows without interview in quick mode", () => {
      const wf = createDefaultWorkflowState({ interviewComplete: false, mode: "quick" });
      expect(canStartPlanning(wf).allowed).toBe(true);
    });
  });

  describe("isOrchestratorCodeWrite", () => {
    it("blocks orchestrator from writing implementation files", () => {
      const result = isOrchestratorCodeWrite("orchestrator", "src/index.ts");
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("Orchestrator");
    });

    it("allows orchestrator to write non-implementation files", () => {
      expect(isOrchestratorCodeWrite("orchestrator", ".goopspec/SPEC.md").allowed).toBe(true);
      expect(isOrchestratorCodeWrite("orchestrator", "README.md").allowed).toBe(true);
    });

    it("allows non-orchestrator agents to write implementation files", () => {
      expect(isOrchestratorCodeWrite("executor-high", "src/index.ts").allowed).toBe(true);
      expect(isOrchestratorCodeWrite("executor-medium", "lib/utils.ts").allowed).toBe(true);
    });
  });
});

// ============================================================================
// Scaffolder
// ============================================================================

describe("scaffolder", () => {
  let testDir: string;
  let cleanup: () => void;

  beforeEach(() => {
    const env = setupTestEnvironment("enforcement-scaffolder");
    testDir = env.testDir;
    cleanup = env.cleanup;
  });

  afterEach(() => cleanup());

  describe("getWorkflowDocDir", () => {
    it("returns path under .goopspec/<workflowId>", () => {
      const dir = getWorkflowDocDir("/project", "my-feature");
      expect(dir).toBe("/project/.goopspec/my-feature");
    });

    it("handles default workflow", () => {
      const dir = getWorkflowDocDir("/project", "default");
      expect(dir).toBe("/project/.goopspec/default");
    });
  });

  describe("getWorkflowDocPath", () => {
    it("returns full path for a document", () => {
      const path = getWorkflowDocPath("/project", "feat-auth", "SPEC.md");
      expect(path).toBe("/project/.goopspec/feat-auth/SPEC.md");
    });
  });

  describe("getRequiredDocuments", () => {
    it("returns empty for idle phase", () => {
      expect(getRequiredDocuments("idle")).toEqual([]);
    });

    it("returns empty for discuss phase", () => {
      expect(getRequiredDocuments("discuss")).toEqual([]);
    });

    it("returns SPEC.md and RESEARCH.md for plan phase", () => {
      const docs = getRequiredDocuments("plan");
      expect(docs).toContain("SPEC.md");
      expect(docs).toContain("RESEARCH.md");
    });

    it("returns core docs for execute phase", () => {
      const docs = getRequiredDocuments("execute");
      expect(docs).toContain("SPEC.md");
      expect(docs).toContain("BLUEPRINT.md");
      expect(docs).toContain("CHRONICLE.md");
      expect(docs).toContain("ADL.md");
    });

    it("returns core docs for accept phase", () => {
      const docs = getRequiredDocuments("accept");
      expect(docs).toContain("SPEC.md");
      expect(docs).toContain("BLUEPRINT.md");
      expect(docs).toContain("CHRONICLE.md");
      expect(docs).toContain("ADL.md");
    });
  });

  describe("checkPhaseDocuments", () => {
    it("reports all missing when directory is empty", () => {
      const result = checkPhaseDocuments(testDir, "test-wf", "execute");
      expect(result.valid).toBe(false);
      expect(result.missing.length).toBeGreaterThan(0);
      expect(result.existing).toEqual([]);
    });

    it("reports valid when no docs required (idle)", () => {
      const result = checkPhaseDocuments(testDir, "test-wf", "idle");
      expect(result.valid).toBe(true);
      expect(result.missing).toEqual([]);
    });
  });

  describe("scaffoldPhaseDocuments", () => {
    it("creates required documents for execute phase", () => {
      const result = scaffoldPhaseDocuments(testDir, "test-wf", "execute");
      expect(result.errors).toEqual([]);
      expect(result.created.length).toBeGreaterThan(0);
      expect(result.created).toContain("SPEC.md");
      expect(result.created).toContain("BLUEPRINT.md");
      expect(result.created).toContain("CHRONICLE.md");
      expect(result.created).toContain("ADL.md");

      // Verify files actually exist
      const docDir = getWorkflowDocDir(testDir, "test-wf");
      expect(existsSync(join(docDir, "SPEC.md"))).toBe(true);
      expect(existsSync(join(docDir, "BLUEPRINT.md"))).toBe(true);
      expect(existsSync(join(docDir, "CHRONICLE.md"))).toBe(true);
      expect(existsSync(join(docDir, "ADL.md"))).toBe(true);
    });

    it("creates SPEC.md and RESEARCH.md for plan phase", () => {
      const result = scaffoldPhaseDocuments(testDir, "test-wf", "plan");
      expect(result.errors).toEqual([]);
      expect(result.created).toContain("SPEC.md");
      expect(result.created).toContain("RESEARCH.md");
    });

    it("does not overwrite existing documents", () => {
      // First scaffold
      scaffoldPhaseDocuments(testDir, "test-wf", "execute");

      // Write custom content to SPEC.md
      const specPath = getWorkflowDocPath(testDir, "test-wf", "SPEC.md");
      const customContent = "# Custom SPEC content";
      writeFileSync(specPath, customContent, "utf-8");

      // Second scaffold
      const result = scaffoldPhaseDocuments(testDir, "test-wf", "execute");
      expect(result.skipped).toContain("SPEC.md");

      // Verify content was preserved
      const content = readFileSync(specPath, "utf-8");
      expect(content).toBe(customContent);
    });

    it("creates no documents for idle phase", () => {
      const result = scaffoldPhaseDocuments(testDir, "test-wf", "idle");
      expect(result.created).toEqual([]);
      expect(result.errors).toEqual([]);
    });

    it("creates the workflow directory if it does not exist", () => {
      const docDir = getWorkflowDocDir(testDir, "new-workflow");
      expect(existsSync(docDir)).toBe(false);

      scaffoldPhaseDocuments(testDir, "new-workflow", "execute");
      expect(existsSync(docDir)).toBe(true);
    });

    it("templates contain the workflow ID", () => {
      scaffoldPhaseDocuments(testDir, "feat-auth", "execute");
      const specPath = getWorkflowDocPath(testDir, "feat-auth", "SPEC.md");
      const content = readFileSync(specPath, "utf-8");
      expect(content).toContain("feat-auth");
    });

    it("check passes after scaffolding", () => {
      scaffoldPhaseDocuments(testDir, "test-wf", "execute");
      const check = checkPhaseDocuments(testDir, "test-wf", "execute");
      expect(check.valid).toBe(true);
      expect(check.missing).toEqual([]);
    });
  });
});

// ============================================================================
// Phase Context
// ============================================================================

describe("phase-context", () => {
  describe("getPhaseRules", () => {
    it("returns rules for every workflow phase", () => {
      for (const phase of WORKFLOW_PHASES) {
        const rules = getPhaseRules(phase);
        expect(rules.phase).toBe(phase);
        expect(rules.label).toBeDefined();
        expect(rules.mustDo.length).toBeGreaterThan(0);
        expect(rules.mustNotDo.length).toBeGreaterThan(0);
      }
    });

    it("execute phase includes delegation note", () => {
      const rules = getPhaseRules("execute");
      expect(rules.delegationNote).toBeDefined();
      expect(rules.delegationNote).toContain("executor");
    });

    it("non-execute phases have no delegation note", () => {
      for (const phase of ["idle", "discuss", "plan", "accept"] as WorkflowPhase[]) {
        const rules = getPhaseRules(phase);
        expect(rules.delegationNote).toBeUndefined();
      }
    });
  });

  describe("buildPhaseEnforcement", () => {
    it("returns markdown with MUST DO and MUST NOT DO sections", () => {
      const output = buildPhaseEnforcement("execute");
      expect(output).toContain("## PHASE ENFORCEMENT: EXECUTE");
      expect(output).toContain("### MUST DO:");
      expect(output).toContain("### MUST NOT DO:");
    });

    it("includes required documents for execute phase", () => {
      const output = buildPhaseEnforcement("execute");
      expect(output).toContain("### REQUIRED DOCUMENTS:");
      expect(output).toContain("SPEC.md");
    });

    it("includes delegation section for execute phase", () => {
      const output = buildPhaseEnforcement("execute");
      expect(output).toContain("### DELEGATION (CRITICAL):");
    });

    it("does not include delegation for plan phase", () => {
      const output = buildPhaseEnforcement("plan");
      expect(output).not.toContain("DELEGATION");
    });

    it("returns non-empty for all phases", () => {
      for (const phase of WORKFLOW_PHASES) {
        const output = buildPhaseEnforcement(phase);
        expect(output.length).toBeGreaterThan(0);
      }
    });
  });

  describe("buildStateContext", () => {
    it("includes workflow ID and phase", () => {
      const wf = createDefaultWorkflowState({ phase: "execute" });
      const output = buildStateContext(wf, "feat-auth");
      expect(output).toContain("feat-auth");
      expect(output).toContain("execute");
    });

    it("includes wave progress when waves exist", () => {
      const wf = createDefaultWorkflowState({
        phase: "execute",
        currentWave: 2,
        totalWaves: 5,
      });
      const output = buildStateContext(wf, "default");
      expect(output).toContain("2/5");
    });

    it("omits wave progress when no waves", () => {
      const wf = createDefaultWorkflowState({ phase: "plan" });
      const output = buildStateContext(wf, "default");
      expect(output).not.toContain("Wave Progress");
    });

    it("includes spec lock status", () => {
      const locked = createDefaultWorkflowState({ specLocked: true });
      const unlocked = createDefaultWorkflowState({ specLocked: false });
      expect(buildStateContext(locked, "x")).toContain("Yes");
      expect(buildStateContext(unlocked, "x")).toContain("No");
    });

    it("includes acceptance when confirmed", () => {
      const wf = createDefaultWorkflowState({ acceptanceConfirmed: true });
      const output = buildStateContext(wf, "x");
      expect(output).toContain("Confirmed");
    });

    it("includes checkpoint when set", () => {
      const wf = createDefaultWorkflowState({ checkpoint: "wave-3-done" });
      const output = buildStateContext(wf, "x");
      expect(output).toContain("wave-3-done");
    });
  });

  describe("buildEnforcementContext", () => {
    it("combines state and phase enforcement", () => {
      const wf = createDefaultWorkflowState({ phase: "execute", specLocked: true });
      const output = buildEnforcementContext(wf, "feat-auth");
      expect(output).toContain("## CURRENT STATE");
      expect(output).toContain("## PHASE ENFORCEMENT: EXECUTE");
    });

    it("returns state-only when phase has no enforcement", () => {
      // All phases have enforcement, but test the structure
      const wf = createDefaultWorkflowState({ phase: "idle" });
      const output = buildEnforcementContext(wf, "default");
      expect(output).toContain("## CURRENT STATE");
      expect(output).toContain("## PHASE ENFORCEMENT: IDLE");
    });
  });
});
