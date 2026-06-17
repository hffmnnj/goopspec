/**
 * v2 multi-workflow state manager.
 *
 * All state mutations flow through this module. Tools and hooks never
 * edit `state.json` directly — they call methods on the StateManager
 * interface defined in `core/types.ts`.
 *
 * Persistence uses atomic writes (write to temp file, then rename) to
 * prevent corruption from partial writes or crashes.
 *
 * @module features/state-manager
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";

import { GOOPSPEC_DIR } from "../../core/constants.js";
import type { WorkflowPhase } from "../../core/constants.js";
import type {
  ADLEntry,
  CheckpointData,
  GoopState,
  StateManager,
  WorkflowState,
} from "../../core/types.js";
import type { TaskMode, WorkflowDepth } from "../../core/types.js";
import { migrateToV2, needsMigration, writeBackup } from "./migrations.js";
import {
  allowedTransitions,
  createDefaultState,
  createDefaultWorkflowState,
  isValidTransition,
} from "./schema.js";

// Re-export schema utilities for external consumers.
export { createDefaultState, createDefaultWorkflowState } from "./schema.js";
export { needsMigration } from "./migrations.js";

// ---------------------------------------------------------------------------
// File I/O helpers
// ---------------------------------------------------------------------------

const STATE_FILENAME = "state.json";
const ADL_FILENAME = "ADL.md";
const CHECKPOINTS_DIR = "checkpoints";

function atomicWriteFile(filePath: string, content: string): void {
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  const tmp = `${filePath}.tmp.${Date.now()}`;
  writeFileSync(tmp, content, "utf-8");
  renameSync(tmp, filePath);
}

function safeReadFile(filePath: string): string | null {
  try {
    if (!existsSync(filePath)) return null;
    return readFileSync(filePath, "utf-8");
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export interface CreateStateManagerOptions {
  projectDir: string;
  workflowId?: string;
}

/**
 * Create a StateManager bound to a project directory.
 *
 * The manager lazily loads `state.json` on first access, migrates v1 files
 * automatically, and persists every mutation via atomic writes.
 */
export function createStateManager(opts: CreateStateManagerOptions): StateManager {
  const { projectDir } = opts;
  const goopspecDir = join(projectDir, GOOPSPEC_DIR);
  const statePath = join(goopspecDir, STATE_FILENAME);

  let cached: GoopState | null = null;

  // -----------------------------------------------------------------------
  // Internal persistence
  // -----------------------------------------------------------------------

  function ensureDir(dir: string): void {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  }

  function load(): GoopState {
    if (cached) return cached;

    const raw = safeReadFile(statePath);
    if (!raw) {
      cached = createDefaultState(opts.workflowId ?? "default");
      persist(cached);
      return cached;
    }

    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;

      if (needsMigration(parsed)) {
        writeBackup(statePath);
        cached = migrateToV2(parsed);
        persist(cached);
        return cached;
      }

      cached = parsed as unknown as GoopState;
      return cached;
    } catch {
      cached = createDefaultState(opts.workflowId ?? "default");
      persist(cached);
      return cached;
    }
  }

  function persist(state: GoopState): void {
    ensureDir(goopspecDir);
    atomicWriteFile(statePath, JSON.stringify(state, null, 2));
    cached = state;
  }

  // -----------------------------------------------------------------------
  // Active workflow helpers
  // -----------------------------------------------------------------------

  function active(): WorkflowState {
    const state = load();
    const wf = state.workflows[state.activeWorkflowId];
    if (!wf) {
      throw new Error(`Active workflow "${state.activeWorkflowId}" not found`);
    }
    return wf;
  }

  function mutateActive(fn: (wf: WorkflowState) => void): void {
    const state = load();
    const wf = state.workflows[state.activeWorkflowId];
    if (!wf) {
      throw new Error(`Active workflow "${state.activeWorkflowId}" not found`);
    }
    fn(wf);
    persist(state);
  }

  // -----------------------------------------------------------------------
  // ADL helpers
  // -----------------------------------------------------------------------

  function adlPath(): string {
    const state = load();
    const wfId = state.activeWorkflowId;
    if (wfId === "default") return join(goopspecDir, ADL_FILENAME);
    return join(goopspecDir, wfId, ADL_FILENAME);
  }

  // -----------------------------------------------------------------------
  // Checkpoint helpers
  // -----------------------------------------------------------------------

  function checkpointsPath(): string {
    const state = load();
    const wfId = state.activeWorkflowId;
    if (wfId === "default") return join(goopspecDir, CHECKPOINTS_DIR);
    return join(goopspecDir, wfId, CHECKPOINTS_DIR);
  }

  // -----------------------------------------------------------------------
  // StateManager implementation
  // -----------------------------------------------------------------------

  const manager: StateManager = {
    getState(): GoopState {
      return load();
    },

    setState(next: GoopState): void {
      persist(next);
    },

    // -- Workflow CRUD ---------------------------------------------------

    getWorkflow(id: string): WorkflowState | undefined {
      return load().workflows[id];
    },

    getActiveWorkflow(): WorkflowState {
      return active();
    },

    getActiveWorkflowId(): string {
      return load().activeWorkflowId;
    },

    setActiveWorkflow(id: string): void {
      const state = load();
      if (!state.workflows[id]) {
        throw new Error(`Workflow "${id}" does not exist`);
      }
      state.activeWorkflowId = id;
      persist(state);
    },

    createWorkflow(id: string): WorkflowState {
      const state = load();
      if (state.workflows[id]) return state.workflows[id];

      const wf = createDefaultWorkflowState();
      state.workflows[id] = wf;

      // Ensure the workflow doc directory exists for non-default workflows
      if (id !== "default") {
        ensureDir(join(goopspecDir, id));
      }

      persist(state);
      return wf;
    },

    removeWorkflow(id: string): void {
      const state = load();
      if (!state.workflows[id]) return;

      const { [id]: _removed, ...rest } = state.workflows;
      state.workflows = rest;

      if (state.activeWorkflowId === id) {
        state.activeWorkflowId = Object.keys(state.workflows)[0] ?? "default";
      }
      persist(state);
    },

    listWorkflowIds(): string[] {
      return Object.keys(load().workflows);
    },

    // -- Workflow mutations (active) -------------------------------------

    updateWorkflow(updates: Partial<WorkflowState>): void {
      mutateActive((wf) => {
        Object.assign(wf, updates);
      });
    },

    transitionPhase(to: WorkflowPhase, force = false): void {
      const current = active().phase;

      if (!force && !isValidTransition(current, to)) {
        const allowed = allowedTransitions(current);
        throw new Error(
          `Invalid phase transition: ${current} -> ${to}. ` + `Allowed: [${allowed.join(", ")}]`,
        );
      }

      mutateActive((wf) => {
        wf.phase = to;
      });
    },

    lockSpec(): void {
      mutateActive((wf) => {
        wf.specLocked = true;
      });
    },

    unlockSpec(): void {
      mutateActive((wf) => {
        wf.specLocked = false;
      });
    },

    confirmAcceptance(): void {
      mutateActive((wf) => {
        wf.acceptanceConfirmed = true;
      });
    },

    resetAcceptance(): void {
      mutateActive((wf) => {
        wf.acceptanceConfirmed = false;
      });
    },

    completeInterview(): void {
      mutateActive((wf) => {
        wf.interviewComplete = true;
      });
    },

    resetInterview(): void {
      mutateActive((wf) => {
        wf.interviewComplete = false;
      });
    },

    setMode(mode: TaskMode): void {
      mutateActive((wf) => {
        wf.mode = mode;
      });
    },

    setDepth(depth: WorkflowDepth): void {
      mutateActive((wf) => {
        wf.depth = depth;
      });
    },

    updateWaveProgress(current: number, total: number): void {
      mutateActive((wf) => {
        wf.currentWave = current;
        wf.totalWaves = total;
      });
    },

    resetWorkflow(): void {
      const state = load();
      state.workflows[state.activeWorkflowId] = createDefaultWorkflowState();
      persist(state);
    },

    // -- ADL -------------------------------------------------------------

    getADL(): string {
      const content = safeReadFile(adlPath());
      if (content) return content;

      const header =
        "# Automated Decision Log (ADL)\n\nTracks decisions, deviations, and observations.\n\n---\n\n";
      ensureDir(dirname(adlPath()));
      atomicWriteFile(adlPath(), header);
      return header;
    },

    appendADL(entry: ADLEntry): void {
      // Ensure ADL file exists
      manager.getADL();

      const ruleText = entry.rule != null ? ` (Rule ${entry.rule})` : "";
      const filesText = entry.files?.length ? `\n**Files:** ${entry.files.join(", ")}` : "";

      const block = `\n## [${entry.type.toUpperCase()}]${ruleText} - ${entry.timestamp}\n\n**Description:** ${entry.description}\n\n**Action:** ${entry.action}${filesText}\n\n---\n`;

      const current = safeReadFile(adlPath()) ?? "";
      atomicWriteFile(adlPath(), current + block);
    },

    // -- Checkpoints -----------------------------------------------------

    saveCheckpoint(id: string, data: CheckpointData): void {
      const dir = checkpointsPath();
      ensureDir(dir);
      atomicWriteFile(join(dir, `${id}.json`), JSON.stringify(data, null, 2));

      mutateActive((wf) => {
        wf.checkpoint = id;
      });
    },

    loadCheckpoint(id: string): CheckpointData | null {
      const content = safeReadFile(join(checkpointsPath(), `${id}.json`));
      if (!content) return null;
      try {
        return JSON.parse(content) as CheckpointData;
      } catch {
        return null;
      }
    },

    listCheckpoints(): string[] {
      const dir = checkpointsPath();
      if (!existsSync(dir)) return [];
      try {
        return readdirSync(dir)
          .filter((f) => f.endsWith(".json"))
          .map((f) => f.replace(".json", ""));
      } catch {
        return [];
      }
    },
  };

  return manager;
}
