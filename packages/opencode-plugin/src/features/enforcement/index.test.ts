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
  // scaffolder
  checkPhaseDocuments,
  getPhaseRules,
  getRequiredDocuments,
  getWorkflowDocDir,
  getWorkflowDocPath,
  scaffoldPhaseDocuments,
} from "./index.js";

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

    it("nudges execute phase toward scoped test evidence", () => {
      const output = buildPhaseEnforcement("execute");
      expect(output).toContain("scoped test evidence (narrowest run covering the change)");
      expect(output).toContain(
        "Demand a full-suite rerun when a scoped run already covers the change",
      );
    });

    it("requires the full test suite at the acceptance gate", () => {
      const output = buildPhaseEnforcement("accept");
      expect(output).toContain(
        "Run the full test suite and ensure it passes at the acceptance gate",
      );
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
    it("returns phase enforcement rules only — state is single-sourced elsewhere", () => {
      const wf = createDefaultWorkflowState({ phase: "execute", specLocked: true });
      const output = buildEnforcementContext(wf);
      expect(output).toContain("## PHASE ENFORCEMENT: EXECUTE");
      // No longer duplicates workflow state — that lives solely in
      // buildStateBlock's <goopspec_state> block (system-transform.ts).
      expect(output).not.toContain("## CURRENT STATE");
    });

    it("matches buildPhaseEnforcement(workflow.phase) exactly", () => {
      const wf = createDefaultWorkflowState({ phase: "idle" });
      const output = buildEnforcementContext(wf);
      expect(output).toBe(buildPhaseEnforcement("idle"));
    });
  });
});
