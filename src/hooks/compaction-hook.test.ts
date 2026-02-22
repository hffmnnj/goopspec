import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { writeFileSync } from "fs";
import { join } from "path";
import { mkdirSync, rmSync } from "fs";
import { tmpdir } from "os";
import {
  createCompactionHook,
  buildWorkflowStateBlock,
  buildSpecBlock,
  buildADLBlock,
  buildToolInstructionsBlock,
} from "./compaction-hook.js";
import {
  setupTestEnvironment,
  createMockPluginContext,
  createMockStateManager,
  type PluginContext,
} from "../test-utils.js";

describe("compaction hook", () => {
  let cleanup: () => void;
  let testDir: string;
  let ctx: PluginContext;

  beforeEach(() => {
    const env = setupTestEnvironment("compaction-hook-test");
    cleanup = env.cleanup;
    testDir = env.testDir;
    ctx = createMockPluginContext({ testDir });
  });

  afterEach(() => {
    cleanup();
  });

  describe("registration and basic firing", () => {
    it("factory returns async function", () => {
      const hook = createCompactionHook(ctx);
      expect(typeof hook).toBe("function");
      expect(hook.constructor.name).toBe("AsyncFunction");
    });

    it("hook pushes at least one string to output.context", async () => {
      const hook = createCompactionHook(ctx);
      const output: { context: string[]; prompt?: string } = { context: [] };

      await hook(undefined, output);

      expect(output.context.length).toBeGreaterThan(0);
      for (const entry of output.context) {
        expect(typeof entry).toBe("string");
      }
      expect(output.prompt).toBeUndefined();
    });

    it("output.prompt is undefined after hook runs", async () => {
      const hook = createCompactionHook(ctx);
      const output: { context: string[]; prompt?: string } = { context: [] };

      await hook(undefined, output);

      expect(output.prompt).toBeUndefined();
    });

    it("hook does not throw with minimal mock context", async () => {
      const minimalCtx = createMockPluginContext({ testDir });
      const hook = createCompactionHook(minimalCtx);
      const output: { context: string[]; prompt?: string } = { context: [] };

      // Should complete without throwing
      await hook(undefined, output);

      expect(output.context.length).toBeGreaterThan(0);
      expect(output.prompt).toBeUndefined();
    });
  });

  // =========================================================================
  // Task 2.2: Workflow State Injection Tests
  // =========================================================================

  describe("workflow state injection", () => {
    it("includes current phase in output", async () => {
      const hookCtx = createMockPluginContext({
        testDir,
        state: {
          workflow: {
            phase: "execute",
            specLocked: true,
            currentWave: 2,
            totalWaves: 4,
            mode: "standard",
            depth: "standard",
            researchOptIn: false,
            acceptanceConfirmed: false,
            interviewComplete: true,
            interviewCompletedAt: null,
            currentPhase: null,
            lastActivity: new Date().toISOString(),
          },
        },
      });
      const hook = createCompactionHook(hookCtx);
      const output: { context: string[]; prompt?: string } = { context: [] };

      await hook(undefined, output);

      const joined = output.context.join("\n");
      expect(joined.toUpperCase()).toContain("EXECUTE");
    });

    it("includes wave progress when waves are non-zero", async () => {
      const hookCtx = createMockPluginContext({
        testDir,
        state: {
          workflow: {
            phase: "execute",
            specLocked: true,
            currentWave: 2,
            totalWaves: 4,
            mode: "standard",
            depth: "standard",
            researchOptIn: false,
            acceptanceConfirmed: false,
            interviewComplete: true,
            interviewCompletedAt: null,
            currentPhase: null,
            lastActivity: new Date().toISOString(),
          },
        },
      });
      const hook = createCompactionHook(hookCtx);
      const output: { context: string[]; prompt?: string } = { context: [] };

      await hook(undefined, output);

      const joined = output.context.join("\n");
      expect(joined).toContain("2 of 4");
    });

    it("omits wave line when currentWave and totalWaves are both 0", async () => {
      const hookCtx = createMockPluginContext({
        testDir,
        state: {
          workflow: {
            phase: "execute",
            specLocked: false,
            currentWave: 0,
            totalWaves: 0,
            mode: "standard",
            depth: "standard",
            researchOptIn: false,
            acceptanceConfirmed: false,
            interviewComplete: false,
            interviewCompletedAt: null,
            currentPhase: null,
            lastActivity: new Date().toISOString(),
          },
        },
      });
      const hook = createCompactionHook(hookCtx);
      const output: { context: string[]; prompt?: string } = { context: [] };

      await hook(undefined, output);

      const joined = output.context.join("\n");
      expect(joined).not.toContain("0 of 0");
    });

    it("includes spec locked status", async () => {
      const hookCtx = createMockPluginContext({
        testDir,
        state: {
          workflow: {
            phase: "execute",
            specLocked: true,
            currentWave: 1,
            totalWaves: 3,
            mode: "standard",
            depth: "standard",
            researchOptIn: false,
            acceptanceConfirmed: false,
            interviewComplete: true,
            interviewCompletedAt: null,
            currentPhase: null,
            lastActivity: new Date().toISOString(),
          },
        },
      });
      const hook = createCompactionHook(hookCtx);
      const output: { context: string[]; prompt?: string } = { context: [] };

      await hook(undefined, output);

      const joined = output.context.join("\n");
      expect(joined).toContain("LOCKED");
    });

    it("uses imperative language with RESUME FROM THIS POINT", async () => {
      const hook = createCompactionHook(ctx);
      const output: { context: string[]; prompt?: string } = { context: [] };

      await hook(undefined, output);

      const joined = output.context.join("\n");
      expect(joined).toContain("RESUME FROM THIS POINT");
    });

    it("produces different directives for different phases", async () => {
      const planCtx = createMockPluginContext({
        testDir,
        state: {
          workflow: {
            phase: "plan",
            specLocked: false,
            currentWave: 0,
            totalWaves: 0,
            mode: "standard",
            depth: "standard",
            researchOptIn: false,
            acceptanceConfirmed: false,
            interviewComplete: false,
            interviewCompletedAt: null,
            currentPhase: null,
            lastActivity: new Date().toISOString(),
          },
        },
      });
      const executeCtx = createMockPluginContext({
        testDir,
        state: {
          workflow: {
            phase: "execute",
            specLocked: true,
            currentWave: 1,
            totalWaves: 2,
            mode: "standard",
            depth: "standard",
            researchOptIn: false,
            acceptanceConfirmed: false,
            interviewComplete: true,
            interviewCompletedAt: null,
            currentPhase: null,
            lastActivity: new Date().toISOString(),
          },
        },
      });

      const planOutput: { context: string[]; prompt?: string } = { context: [] };
      const execOutput: { context: string[]; prompt?: string } = { context: [] };

      await createCompactionHook(planCtx)(undefined, planOutput);
      await createCompactionHook(executeCtx)(undefined, execOutput);

      const planJoined = planOutput.context.join("\n");
      const execJoined = execOutput.context.join("\n");

      // Plan phase should mention planning
      expect(planJoined).toContain("planning phase");
      // Execute phase should mention execution
      expect(execJoined).toContain("execution phase");
      // They should be different
      expect(planJoined).not.toEqual(execJoined);
    });
  });

  // =========================================================================
  // Task 2.3: Spec Content Injection Tests
  // =========================================================================

  describe("spec content injection", () => {
    it("includes full content for SPEC.md with 200 or fewer lines", async () => {
      const smallSpec = "# Test Spec\n\n## Must-Haves\n\n- MH1: Do the thing\n\n## Out of Scope\n\n- Not this\n\nSmall spec content here.";
      writeFileSync(join(testDir, ".goopspec", "SPEC.md"), smallSpec);

      const hook = createCompactionHook(ctx);
      const output: { context: string[]; prompt?: string } = { context: [] };

      await hook(undefined, output);

      const joined = output.context.join("\n");
      expect(joined).toContain("Small spec content here.");
      expect(joined).toContain("MH1: Do the thing");
    });

    it("extracts must-haves and out-of-scope for SPEC.md with more than 200 lines", async () => {
      // Build a SPEC.md with >200 lines containing known sections
      const lines: string[] = [];
      lines.push("# Large Specification");
      lines.push("");
      lines.push("## Must-Haves");
      lines.push("");
      lines.push("- MH1: Critical feature alpha");
      lines.push("- MH2: Critical feature beta");
      lines.push("");
      // Pad with filler to push past 200 lines
      for (let i = 0; i < 100; i++) {
        lines.push(`Filler line ${i} for must-haves section.`);
      }
      lines.push("");
      lines.push("## Out of Scope");
      lines.push("");
      lines.push("- NS1: Not building this widget");
      lines.push("");
      // More filler
      for (let i = 0; i < 50; i++) {
        lines.push(`Filler line ${i} for out-of-scope section.`);
      }
      lines.push("");
      lines.push("## Other Section");
      lines.push("");
      lines.push("This other section content should NOT appear.");
      // More filler to ensure >200 lines total
      for (let i = 0; i < 50; i++) {
        lines.push(`Other filler ${i}.`);
      }

      const largeSpec = lines.join("\n");
      expect(largeSpec.split("\n").length).toBeGreaterThan(200);

      writeFileSync(join(testDir, ".goopspec", "SPEC.md"), largeSpec);

      const hook = createCompactionHook(ctx);
      const output: { context: string[]; prompt?: string } = { context: [] };

      await hook(undefined, output);

      const joined = output.context.join("\n");
      expect(joined).toContain("Must-Haves");
      expect(joined).toContain("MH1: Critical feature alpha");
      expect(joined).toContain("Out of Scope");
      expect(joined).toContain("NS1: Not building this widget");
      expect(joined).not.toContain("## Other Section");
      expect(joined).not.toContain("This other section content should NOT appear.");
    });

    it("silently skips when SPEC.md is missing", async () => {
      // Default test environment has no SPEC.md — just .goopspec/ dir
      const hook = createCompactionHook(ctx);
      const output: { context: string[]; prompt?: string } = { context: [] };

      await hook(undefined, output);

      // Should still have at least the tool instructions block
      expect(output.context.length).toBeGreaterThan(0);
      // No error thrown — hook completed
      expect(output.prompt).toBeUndefined();
    });

    it("handles empty SPEC.md gracefully", async () => {
      writeFileSync(join(testDir, ".goopspec", "SPEC.md"), "");

      const hook = createCompactionHook(ctx);
      const output: { context: string[]; prompt?: string } = { context: [] };

      // Should not throw
      await hook(undefined, output);

      // Hook still runs — at minimum tool instructions are present
      expect(output.context.length).toBeGreaterThan(0);
    });
  });

  // =========================================================================
  // Task 2.4: ADL Entries Injection Tests
  // =========================================================================

  describe("ADL entries injection", () => {
    function buildADLMarkdown(count: number): string {
      const entries: string[] = [];
      entries.push("# Automated Decision Log\n");
      for (let i = 1; i <= count; i++) {
        entries.push(`### Decision ${i}: Choice about item ${i}\n\n**Description:** Decided on item ${i}\n**Action:** Took action ${i}\n`);
      }
      return entries.join("\n");
    }

    it("injects only the last 5 ADL entries when more than 5 exist", async () => {
      const adlMarkdown = buildADLMarkdown(10);
      const stateManager = createMockStateManager();
      const hookCtx: PluginContext = {
        ...createMockPluginContext({ testDir }),
        stateManager: {
          ...stateManager,
          getADL: () => adlMarkdown,
        },
      };

      const hook = createCompactionHook(hookCtx);
      const output: { context: string[]; prompt?: string } = { context: [] };

      await hook(undefined, output);

      const joined = output.context.join("\n");
      // Should contain entries 6-10
      expect(joined).toContain("Decision 6");
      expect(joined).toContain("Decision 7");
      expect(joined).toContain("Decision 8");
      expect(joined).toContain("Decision 9");
      expect(joined).toContain("Decision 10");
      // Should NOT contain entries 1-5
      expect(joined).not.toContain("Decision 1:");
      expect(joined).not.toContain("Decision 2:");
      expect(joined).not.toContain("Decision 3:");
      expect(joined).not.toContain("Decision 4:");
      expect(joined).not.toContain("Decision 5:");
    });

    it("injects all entries when fewer than 5 exist", async () => {
      const adlMarkdown = buildADLMarkdown(2);
      const stateManager = createMockStateManager();
      const hookCtx: PluginContext = {
        ...createMockPluginContext({ testDir }),
        stateManager: {
          ...stateManager,
          getADL: () => adlMarkdown,
        },
      };

      const hook = createCompactionHook(hookCtx);
      const output: { context: string[]; prompt?: string } = { context: [] };

      await hook(undefined, output);

      const joined = output.context.join("\n");
      expect(joined).toContain("Decision 1");
      expect(joined).toContain("Decision 2");
    });

    it("skips ADL block when ADL is empty", async () => {
      const stateManager = createMockStateManager();
      const hookCtx: PluginContext = {
        ...createMockPluginContext({ testDir }),
        stateManager: {
          ...stateManager,
          getADL: () => "",
        },
      };

      const hook = createCompactionHook(hookCtx);
      const output: { context: string[]; prompt?: string } = { context: [] };

      await hook(undefined, output);

      const joined = output.context.join("\n");
      expect(joined).not.toContain("Recent Architectural Decisions");
    });

    it("includes imperative framing in ADL content", async () => {
      const adlMarkdown = buildADLMarkdown(2);
      const stateManager = createMockStateManager();
      const hookCtx: PluginContext = {
        ...createMockPluginContext({ testDir }),
        stateManager: {
          ...stateManager,
          getADL: () => adlMarkdown,
        },
      };

      const hook = createCompactionHook(hookCtx);
      const output: { context: string[]; prompt?: string } = { context: [] };

      await hook(undefined, output);

      const joined = output.context.join("\n");
      expect(joined).toContain("Honour them");
      expect(joined).toContain("Do not re-debate");
    });
  });

  // =========================================================================
  // Task 2.5: Graceful Degradation Tests
  // =========================================================================

  describe("graceful degradation", () => {
    it("succeeds when .goopspec directory does not exist", async () => {
      // Create a bare temp dir without .goopspec/
      const bareDir = join(tmpdir(), `compaction-bare-${Date.now()}-${Math.random().toString(36).slice(2)}`);
      mkdirSync(bareDir, { recursive: true });

      try {
        const bareCtx = createMockPluginContext({ testDir: bareDir });
        const hook = createCompactionHook(bareCtx);
        const output: { context: string[]; prompt?: string } = { context: [] };

        await hook(undefined, output);

        // Should still push tool instructions at minimum
        expect(output.context.length).toBeGreaterThan(0);
        expect(output.prompt).toBeUndefined();
      } finally {
        rmSync(bareDir, { recursive: true, force: true });
      }
    });

    it("succeeds when getState() throws", async () => {
      const stateManager = createMockStateManager();
      const hookCtx: PluginContext = {
        ...createMockPluginContext({ testDir }),
        stateManager: {
          ...stateManager,
          getState: () => {
            throw new Error("state error");
          },
        },
      };

      const hook = createCompactionHook(hookCtx);
      const output: { context: string[]; prompt?: string } = { context: [] };

      // Should not throw
      await hook(undefined, output);

      // Tool instructions should still be present
      const joined = output.context.join("\n");
      expect(joined).toContain("goop_status");
    });

    it("succeeds when getADL() throws", async () => {
      const stateManager = createMockStateManager();
      const hookCtx: PluginContext = {
        ...createMockPluginContext({ testDir }),
        stateManager: {
          ...stateManager,
          getADL: () => {
            throw new Error("ADL error");
          },
        },
      };

      const hook = createCompactionHook(hookCtx);
      const output: { context: string[]; prompt?: string } = { context: [] };

      // Should not throw
      await hook(undefined, output);

      // Tool instructions should still be present
      const joined = output.context.join("\n");
      expect(joined).toContain("goop_status");
    });

    it("succeeds with completely empty state", async () => {
      // Default state has all fields at defaults (idle, 0/0, false, etc.)
      const defaultCtx = createMockPluginContext({ testDir });
      const hook = createCompactionHook(defaultCtx);
      const output: { context: string[]; prompt?: string } = { context: [] };

      await hook(undefined, output);

      expect(output.context.length).toBeGreaterThan(0);
      expect(output.prompt).toBeUndefined();
    });

    it("injects tool instructions even when all other sources fail", async () => {
      const stateManager = createMockStateManager();
      const hookCtx: PluginContext = {
        ...createMockPluginContext({ testDir }),
        stateManager: {
          ...stateManager,
          getState: () => {
            throw new Error("state error");
          },
          getADL: () => {
            throw new Error("ADL error");
          },
        },
      };
      // No SPEC.md exists in testDir

      const hook = createCompactionHook(hookCtx);
      const output: { context: string[]; prompt?: string } = { context: [] };

      await hook(undefined, output);

      // At least the tool instructions block should be present
      expect(output.context.length).toBeGreaterThanOrEqual(1);
      const last = output.context[output.context.length - 1];
      expect(last).toContain("goop_status");
      expect(last).toContain("goop_spec");
      expect(last).toContain("goop_adl");
    });

    it("never throws regardless of context", async () => {
      const stateManager = createMockStateManager();
      const hookCtx: PluginContext = {
        ...createMockPluginContext({ testDir }),
        stateManager: {
          ...stateManager,
          getState: () => {
            throw new Error("catastrophic state failure");
          },
          getADL: () => {
            throw new Error("catastrophic ADL failure");
          },
        },
      };

      const hook = createCompactionHook(hookCtx);
      const output: { context: string[]; prompt?: string } = { context: [] };

      // Must resolve without throwing
      await expect(hook(undefined, output)).resolves.toBeUndefined();
    });
  });

  // =========================================================================
  // Task 2.6: Tool Re-hydration Instructions Tests
  // =========================================================================

  describe("tool re-hydration instructions", () => {
    it("includes goop_status in the final context entry", async () => {
      const hook = createCompactionHook(ctx);
      const output: { context: string[]; prompt?: string } = { context: [] };

      await hook(undefined, output);

      const last = output.context[output.context.length - 1];
      expect(last).toContain("goop_status");
    });

    it('includes goop_spec with action:read and file:spec in final entry', async () => {
      const hook = createCompactionHook(ctx);
      const output: { context: string[]; prompt?: string } = { context: [] };

      await hook(undefined, output);

      const last = output.context[output.context.length - 1];
      expect(last).toContain('goop_spec({ "action": "read", "file": "spec" })');
    });

    it('includes goop_adl with action:read in final entry', async () => {
      const hook = createCompactionHook(ctx);
      const output: { context: string[]; prompt?: string } = { context: [] };

      await hook(undefined, output);

      const last = output.context[output.context.length - 1];
      expect(last).toContain('goop_adl({ "action": "read" })');
    });

    it("injects tool block even when state, SPEC.md, and ADL are all absent", async () => {
      const stateManager = createMockStateManager();
      const hookCtx: PluginContext = {
        ...createMockPluginContext({ testDir }),
        stateManager: {
          ...stateManager,
          getState: () => {
            throw new Error("state error");
          },
          getADL: () => "",
        },
      };
      // No SPEC.md in testDir

      const hook = createCompactionHook(hookCtx);
      const output: { context: string[]; prompt?: string } = { context: [] };

      await hook(undefined, output);

      const last = output.context[output.context.length - 1];
      expect(last).toContain("goop_status");
    });

    it("tool instructions block is always the last context entry", async () => {
      // Set up full state, spec, and ADL so multiple blocks are pushed
      writeFileSync(
        join(testDir, ".goopspec", "SPEC.md"),
        "# Spec\n\n## Must-Haves\n\n- MH1: Feature\n"
      );
      const stateManager = createMockStateManager({
        workflow: {
          phase: "execute",
          specLocked: true,
          currentWave: 2,
          totalWaves: 4,
          mode: "standard",
          depth: "standard",
          researchOptIn: false,
          acceptanceConfirmed: false,
          interviewComplete: true,
          interviewCompletedAt: null,
          currentPhase: null,
          lastActivity: new Date().toISOString(),
        },
      });
      const adlMarkdown = "### Decision 1: Use TypeScript\n\n**Description:** Chose TS\n";
      const hookCtx: PluginContext = {
        ...createMockPluginContext({ testDir }),
        stateManager: {
          ...stateManager,
          getADL: () => adlMarkdown,
        },
      };

      const hook = createCompactionHook(hookCtx);
      const output: { context: string[]; prompt?: string } = { context: [] };

      await hook(undefined, output);

      // Should have multiple entries (state + spec + ADL + tool instructions)
      expect(output.context.length).toBeGreaterThanOrEqual(3);

      const last = output.context[output.context.length - 1];
      // Last entry is the tool block
      expect(last).toContain("goop_status");
      expect(last).toContain("goop_spec");
      expect(last).toContain("goop_adl");
      expect(last).toContain("NOW");
    });

    it("uses imperative language in tool instructions", async () => {
      const hook = createCompactionHook(ctx);
      const output: { context: string[]; prompt?: string } = { context: [] };

      await hook(undefined, output);

      const last = output.context[output.context.length - 1];
      expect(last).toContain("NOW");
      expect(last).toContain("before taking any action");
    });
  });
});
