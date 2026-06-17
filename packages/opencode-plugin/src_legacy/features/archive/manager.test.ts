/**
 * Tests for Archive Manager
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, rmSync, existsSync, writeFileSync, readFileSync, readdirSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { createArchiveManager } from "./manager.js";
import { extractLearnings } from "./learnings.js";
import type { MemoryManager, MemoryInput, StateManager } from "../../core/types.js";

// Use a temp directory for tests
const TEST_DIR = join(tmpdir(), `goopspec-archive-test-${Date.now()}`);

describe("archive-manager", () => {
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

  describe("createArchiveManager", () => {
    it("should create an archive manager", () => {
      const manager = createArchiveManager(TEST_DIR);
      expect(manager).toBeTruthy();
      expect(typeof manager.archiveMilestone).toBe("function");
      expect(typeof manager.archiveQuickTask).toBe("function");
      expect(typeof manager.listArchived).toBe("function");
    });

    it("should work without workflowId param (backward compat)", () => {
      const manager = createArchiveManager(TEST_DIR);
      expect(manager).toBeTruthy();
      expect(typeof manager.archiveMilestone).toBe("function");
    });

    it("should accept optional workflowId param", () => {
      const manager = createArchiveManager(TEST_DIR, undefined, "feat-auth");
      expect(manager).toBeTruthy();
    });
  });

  describe("archiveQuickTask", () => {
    it("should archive a quick task with summary", async () => {
      const manager = createArchiveManager(TEST_DIR);
      const taskName = "test-task";
      const summary = "This is a test task summary";

      const taskPath = await manager.archiveQuickTask(taskName, summary);

      expect(existsSync(taskPath)).toBe(true);
      expect(taskPath).toContain("001-test-task");

      const summaryPath = join(taskPath, "SUMMARY.md");
      expect(existsSync(summaryPath)).toBe(true);
    });

    it("should increment task numbers", async () => {
      const manager = createArchiveManager(TEST_DIR);

      const task1 = await manager.archiveQuickTask("task-one", "Summary 1");
      const task2 = await manager.archiveQuickTask("task-two", "Summary 2");

      expect(task1).toContain("001-task-one");
      expect(task2).toContain("002-task-two");
    });
  });

  describe("archiveMilestone (workflow-scoped)", () => {
    it("should archive default workflow from .goopspec/ root", async () => {
      const manager = createArchiveManager(TEST_DIR);

      // Create workflow docs at .goopspec/ root (default workflow)
      const goopspecDir = join(TEST_DIR, ".goopspec");
      mkdirSync(goopspecDir, { recursive: true });

      writeFileSync(join(goopspecDir, "SPEC.md"), "# Test Spec\n\nDecision: Use TypeScript");
      writeFileSync(join(goopspecDir, "CHRONICLE.md"), "## Wave 1\n\n- Task 1\n- Task 2");

      const retrospective = "# Retrospective\n\nPattern: TDD worked well\nGotcha: Type errors";

      const entry = await manager.archiveMilestone("v1.0-test", retrospective);

      // Archive ID should be default-<timestamp>
      expect(entry.id).toMatch(/^default-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}$/);
      expect(entry.name).toBe("v1.0-test");
      expect(existsSync(entry.retrospectivePath)).toBe(true);
      expect(existsSync(entry.learningsPath)).toBe(true);
    });

    it("should archive named workflow from .goopspec/<workflowId>/", async () => {
      const manager = createArchiveManager(TEST_DIR, undefined, "feat-auth");

      // Create workflow docs at .goopspec/feat-auth/
      const workflowDir = join(TEST_DIR, ".goopspec", "feat-auth");
      mkdirSync(workflowDir, { recursive: true });

      writeFileSync(join(workflowDir, "SPEC.md"), "# Auth Spec");
      writeFileSync(join(workflowDir, "BLUEPRINT.md"), "# Auth Blueprint");
      writeFileSync(join(workflowDir, "CHRONICLE.md"), "## Wave 1\n\n- Auth task");

      const entry = await manager.archiveMilestone("auth-milestone", "# Retrospective");

      // Archive ID should be feat-auth-<timestamp>
      expect(entry.id).toMatch(/^feat-auth-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}$/);
      expect(entry.name).toBe("auth-milestone");
      expect(existsSync(entry.retrospectivePath)).toBe(true);
      expect(existsSync(entry.learningsPath)).toBe(true);

      // Verify archived docs exist at destination
      const archiveDir = join(TEST_DIR, ".goopspec", "archive");
      const archiveDirs = readdirSync(archiveDir).filter((d) => d.startsWith("feat-auth-"));
      expect(archiveDirs.length).toBe(1);

      const archivedSpecPath = join(archiveDir, archiveDirs[0], "SPEC.md");
      expect(existsSync(archivedSpecPath)).toBe(true);
      expect(readFileSync(archivedSpecPath, "utf-8")).toBe("# Auth Spec");
    });

    it("should use archiveWorkflowId parameter to override constructor default", async () => {
      const manager = createArchiveManager(TEST_DIR, undefined, "default-wf");

      // Create workflow docs for the override workflow
      const workflowDir = join(TEST_DIR, ".goopspec", "override-wf");
      mkdirSync(workflowDir, { recursive: true });
      writeFileSync(join(workflowDir, "SPEC.md"), "# Override Spec");

      const entry = await manager.archiveMilestone("test", "# Retro", "override-wf");

      // Should use override-wf, not default-wf
      expect(entry.id).toMatch(/^override-wf-/);
    });

    it("should clean up non-default workflow directory after archive", async () => {
      const manager = createArchiveManager(TEST_DIR, undefined, "feat-cleanup");

      const workflowDir = join(TEST_DIR, ".goopspec", "feat-cleanup");
      mkdirSync(workflowDir, { recursive: true });
      writeFileSync(join(workflowDir, "SPEC.md"), "# Cleanup Spec");

      await manager.archiveMilestone("cleanup-test", "# Retro");

      // Workflow directory should be removed
      expect(existsSync(workflowDir)).toBe(false);
    });

    it("should NOT clean up default workflow directory after archive", async () => {
      const manager = createArchiveManager(TEST_DIR);

      const goopspecDir = join(TEST_DIR, ".goopspec");
      mkdirSync(goopspecDir, { recursive: true });
      writeFileSync(join(goopspecDir, "SPEC.md"), "# Default Spec");

      await manager.archiveMilestone("default-test", "# Retro");

      // .goopspec/ root should still exist
      expect(existsSync(goopspecDir)).toBe(true);
    });

    it("should archive checkpoints/ and history/ directories", async () => {
      const manager = createArchiveManager(TEST_DIR, undefined, "feat-dirs");

      const workflowDir = join(TEST_DIR, ".goopspec", "feat-dirs");
      mkdirSync(workflowDir, { recursive: true });
      writeFileSync(join(workflowDir, "SPEC.md"), "# Spec");

      // Create checkpoints and history dirs
      const checkpointsDir = join(workflowDir, "checkpoints");
      const historyDir = join(workflowDir, "history");
      mkdirSync(checkpointsDir, { recursive: true });
      mkdirSync(historyDir, { recursive: true });
      writeFileSync(join(checkpointsDir, "cp1.json"), '{"id":"cp1"}');
      writeFileSync(join(historyDir, "h1.json"), '{"id":"h1"}');

      const entry = await manager.archiveMilestone("dirs-test", "# Retro");

      // Verify directories were moved to archive
      const archiveBase = join(TEST_DIR, ".goopspec", "archive", entry.id);
      expect(existsSync(join(archiveBase, "checkpoints", "cp1.json"))).toBe(true);
      expect(existsSync(join(archiveBase, "history", "h1.json"))).toBe(true);
    });

    it("should succeed with empty workflow dir (no doc files)", async () => {
      const manager = createArchiveManager(TEST_DIR);

      // Create empty .goopspec/ dir (default workflow, no docs)
      const goopspecDir = join(TEST_DIR, ".goopspec");
      mkdirSync(goopspecDir, { recursive: true });

      // Should succeed with empty learnings
      const entry = await manager.archiveMilestone("empty-test", "# Retro");

      expect(entry.id).toMatch(/^default-/);
      expect(existsSync(entry.retrospectivePath)).toBe(true);
      expect(existsSync(entry.learningsPath)).toBe(true);
    });

    it("should throw when workflow directory does not exist and has no docs", async () => {
      const manager = createArchiveManager(TEST_DIR, undefined, "nonexistent");

      await expect(
        manager.archiveMilestone("test", "# Retro"),
      ).rejects.toThrow("Workflow directory not found: nonexistent");
    });

    it("should use milestoneId as name, falling back to workflowId", async () => {
      const manager = createArchiveManager(TEST_DIR);

      const goopspecDir = join(TEST_DIR, ".goopspec");
      mkdirSync(goopspecDir, { recursive: true });
      writeFileSync(join(goopspecDir, "SPEC.md"), "# Spec");

      // With milestoneId
      const entry1 = await manager.archiveMilestone("my-milestone", "# Retro");
      expect(entry1.name).toBe("my-milestone");

      // Without milestoneId (empty string)
      const entry2 = await manager.archiveMilestone("", "# Retro");
      expect(entry2.name).toBe("default");
    });

    it("should move all workflow doc files to archive", async () => {
      const manager = createArchiveManager(TEST_DIR, undefined, "feat-docs");

      const workflowDir = join(TEST_DIR, ".goopspec", "feat-docs");
      mkdirSync(workflowDir, { recursive: true });

      const docFiles = ["SPEC.md", "BLUEPRINT.md", "CHRONICLE.md", "REQUIREMENTS.md", "HANDOFF.md", "RESEARCH.md", "ADL.md"];
      for (const file of docFiles) {
        writeFileSync(join(workflowDir, file), `# ${file}`);
      }

      const entry = await manager.archiveMilestone("docs-test", "# Retro");

      // All doc files should be in archive
      const archiveBase = join(TEST_DIR, ".goopspec", "archive", entry.id);
      for (const file of docFiles) {
        expect(existsSync(join(archiveBase, file))).toBe(true);
      }

      // Source workflow dir should be cleaned up
      expect(existsSync(workflowDir)).toBe(false);
    });

    it("should generate archive ID with workflowId-timestamp format", async () => {
      const manager = createArchiveManager(TEST_DIR, undefined, "feat-format");

      const workflowDir = join(TEST_DIR, ".goopspec", "feat-format");
      mkdirSync(workflowDir, { recursive: true });
      writeFileSync(join(workflowDir, "SPEC.md"), "# Spec");

      const entry = await manager.archiveMilestone("test", "# Retro");

      // Format: <workflowId>-YYYY-MM-DDTHH-MM-SS
      expect(entry.id).toMatch(/^feat-format-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}$/);
    });
  });

  describe("listArchived", () => {
    it("should return empty array when no archives exist", () => {
      const manager = createArchiveManager(TEST_DIR);
      const archived = manager.listArchived();

      expect(archived).toEqual([]);
    });

    it("should list archived workflows", async () => {
      const manager = createArchiveManager(TEST_DIR);

      // Create workflow docs at .goopspec/ root
      const goopspecDir = join(TEST_DIR, ".goopspec");
      mkdirSync(goopspecDir, { recursive: true });
      writeFileSync(join(goopspecDir, "SPEC.md"), "# Test");
      writeFileSync(join(goopspecDir, "CHRONICLE.md"), "# Chronicle");

      await manager.archiveMilestone("v1.0-test", "# Retrospective");

      const archived = manager.listArchived();

      expect(archived.length).toBe(1);
      expect(archived[0].id).toMatch(/^default-/);
    });
  });

  describe("generateArchiveIndex", () => {
    it("should generate an index file", () => {
      const manager = createArchiveManager(TEST_DIR);
      const index = manager.generateArchiveIndex();

      expect(index).toContain("# Archive Index");
      expect(index).toContain("No archived milestones yet");
    });
  });

  describe("persistLearnings", () => {
    it("should return false when memory manager is not provided", async () => {
      const manager = createArchiveManager(TEST_DIR);

      // Create and archive a workflow
      const goopspecDir = join(TEST_DIR, ".goopspec");
      mkdirSync(goopspecDir, { recursive: true });
      writeFileSync(join(goopspecDir, "SPEC.md"), "# Test Spec");
      writeFileSync(join(goopspecDir, "CHRONICLE.md"), "# Chronicle");

      const entry = await manager.archiveMilestone("v1.0-test", "# Retrospective");

      const learnings = extractLearnings("", "", "");
      const result = await manager.persistLearnings(entry.id, learnings);

      expect(result).toBe(false);
    });

    it("should persist learnings to memory when memory manager is provided", async () => {
      const savedMemories: MemoryInput[] = [];

      // Mock memory manager
      const mockMemoryManager: MemoryManager = {
        save: async (input: MemoryInput) => {
          savedMemories.push(input);
          return {
            id: savedMemories.length,
            type: input.type,
            title: input.title,
            content: input.content,
            facts: input.facts || [],
            concepts: input.concepts || [],
            sourceFiles: input.sourceFiles || [],
            importance: input.importance || 0.5,
            visibility: input.visibility || "public",
            phase: input.phase,
            sessionId: input.sessionId,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            accessedAt: Date.now(),
            accessCount: 0,
          };
        },
        search: async () => [],
        getById: async () => null,
        getRecent: async () => [],
        update: async () => null,
        delete: async () => false,
      };

      const manager = createArchiveManager(TEST_DIR, mockMemoryManager);

      // Create and archive a workflow
      const goopspecDir = join(TEST_DIR, ".goopspec");
      mkdirSync(goopspecDir, { recursive: true });
      writeFileSync(join(goopspecDir, "SPEC.md"), "# Test Spec\n\nDecision: Use TypeScript");
      writeFileSync(join(goopspecDir, "CHRONICLE.md"), "## Wave 1\n\n- Task 1");

      const retrospective = "# Retrospective\n\nPattern: TDD worked well\nGotcha: Type errors";
      const entry = await manager.archiveMilestone("v1.0-test", retrospective);

      const learnings = extractLearnings(
        "# Test Spec\n\nDecision: Use TypeScript",
        "## Wave 1\n\n- Task 1",
        retrospective,
      );

      const result = await manager.persistLearnings(entry.id, learnings);

      expect(result).toBe(true);
      expect(savedMemories.length).toBeGreaterThan(0);

      // Check main learnings entry
      const mainEntry = savedMemories.find((m) => m.title.includes("Milestone Complete"));
      expect(mainEntry).toBeTruthy();
      expect(mainEntry?.type).toBe("observation");
      expect(mainEntry?.importance).toBe(0.8);
      expect(mainEntry?.concepts).toContain("milestone");
      expect(mainEntry?.concepts).toContain("learnings");
    });

    it("should return false for non-existent milestone", async () => {
      const mockMemoryManager: MemoryManager = {
        save: async () => ({
          id: 1,
          type: "observation",
          title: "",
          content: "",
          facts: [],
          concepts: [],
          sourceFiles: [],
          importance: 0.5,
          visibility: "public",
          createdAt: Date.now(),
          updatedAt: Date.now(),
          accessedAt: Date.now(),
          accessCount: 0,
        }),
        search: async () => [],
        getById: async () => null,
        getRecent: async () => [],
        update: async () => null,
        delete: async () => false,
      };

      const manager = createArchiveManager(TEST_DIR, mockMemoryManager);
      const learnings = extractLearnings("", "", "");

      const result = await manager.persistLearnings("nonexistent", learnings);

      expect(result).toBe(false);
    });
  });

  describe("archiveMilestone removes workflow entry from state", () => {
    function createMockStateManager(): StateManager & { removedWorkflows: string[] } {
      const workflows: Record<string, { workflowId: string }> = {};
      const removedWorkflows: string[] = [];

      return {
        removedWorkflows,
        removeWorkflow: (id: string): boolean => {
          if (id === "default" || !workflows[id]) {
            return false;
          }
          delete workflows[id];
          removedWorkflows.push(id);
          return true;
        },
        createWorkflow: (id: string) => {
          const entry = { workflowId: id, phase: "idle" as const, mode: "standard" as const, depth: "standard" as const, researchOptIn: false, specLocked: false, acceptanceConfirmed: false, interviewComplete: false, interviewCompletedAt: null, currentWave: 0, totalWaves: 0, lastActivity: new Date().toISOString(), currentPhase: null, status: "idle" as const };
          workflows[id] = entry;
          return entry;
        },
        // Stubs for remaining StateManager interface methods (unused by archive)
        getState: () => ({ version: 2, project: { name: "test", initialized: "" }, workflow: { currentPhase: null, phase: "idle" as const, mode: "standard" as const, depth: "standard" as const, researchOptIn: false, specLocked: false, acceptanceConfirmed: false, interviewComplete: false, interviewCompletedAt: null, currentWave: 0, totalWaves: 0, lastActivity: "" }, execution: { activeCheckpointId: null, completedPhases: [], pendingTasks: [] }, workflows: {} }),
        setState: () => {},
        updateWorkflow: () => {},
        getWorkflow: (id: string) => workflows[id] as ReturnType<StateManager["getWorkflow"]> ?? null,
        listWorkflows: () => [],
        setActiveWorkflow: () => false,
        getActiveWorkflowId: () => "default",
        transitionPhase: () => false,
        lockSpec: () => {},
        unlockSpec: () => {},
        confirmAcceptance: () => {},
        resetAcceptance: () => {},
        completeInterview: () => {},
        resetInterview: () => {},
        setMode: () => {},
        updateWaveProgress: () => {},
        resetWorkflow: () => {},
        getADL: () => "",
        appendADL: () => {},
        saveCheckpoint: () => {},
        loadCheckpoint: () => null,
        listCheckpoints: () => [],
        appendHistory: () => {},
      };
    }

    it("should call removeWorkflow for non-default workflow after archive", async () => {
      const mockState = createMockStateManager();
      mockState.createWorkflow("feat-auth");

      const manager = createArchiveManager(TEST_DIR, undefined, "feat-auth", mockState);

      // Create workflow docs
      const workflowDir = join(TEST_DIR, ".goopspec", "feat-auth");
      mkdirSync(workflowDir, { recursive: true });
      writeFileSync(join(workflowDir, "SPEC.md"), "# Auth Spec");

      await manager.archiveMilestone("auth-milestone", "# Retrospective");

      expect(mockState.removedWorkflows).toEqual(["feat-auth"]);
    });

    it("should NOT call removeWorkflow for default workflow", async () => {
      const mockState = createMockStateManager();

      const manager = createArchiveManager(TEST_DIR, undefined, undefined, mockState);

      // Create workflow docs at .goopspec/ root (default workflow)
      const goopspecDir = join(TEST_DIR, ".goopspec");
      mkdirSync(goopspecDir, { recursive: true });
      writeFileSync(join(goopspecDir, "SPEC.md"), "# Default Spec");

      await manager.archiveMilestone("default-test", "# Retrospective");

      expect(mockState.removedWorkflows).toEqual([]);
    });

    it("should call removeWorkflow with archiveWorkflowId override", async () => {
      const mockState = createMockStateManager();
      mockState.createWorkflow("override-wf");

      const manager = createArchiveManager(TEST_DIR, undefined, "default-wf", mockState);

      // Create workflow docs for the override workflow
      const workflowDir = join(TEST_DIR, ".goopspec", "override-wf");
      mkdirSync(workflowDir, { recursive: true });
      writeFileSync(join(workflowDir, "SPEC.md"), "# Override Spec");

      await manager.archiveMilestone("test", "# Retro", "override-wf");

      expect(mockState.removedWorkflows).toEqual(["override-wf"]);
    });

    it("should still succeed if stateManager is not provided", async () => {
      // No stateManager passed — should not throw
      const manager = createArchiveManager(TEST_DIR, undefined, "feat-no-state");

      const workflowDir = join(TEST_DIR, ".goopspec", "feat-no-state");
      mkdirSync(workflowDir, { recursive: true });
      writeFileSync(join(workflowDir, "SPEC.md"), "# Spec");

      const entry = await manager.archiveMilestone("test", "# Retro");
      expect(entry.id).toMatch(/^feat-no-state-/);
    });
  });
});
