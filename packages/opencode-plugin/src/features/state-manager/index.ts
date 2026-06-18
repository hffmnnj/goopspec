/**
 * v2 multi-workflow state manager.
 *
 * All state mutations flow through this module. Tools and hooks never
 * edit state directly — they call methods on the StateManager interface
 * defined in `core/types.ts`.
 *
 * Persistence is backed by GoopSpecDB's `workflows` table. Each workflow
 * is stored as a row with its state serialised as JSON. A special `_meta`
 * row tracks the active workflow ID.
 *
 * On first access, if the DB is empty, the manager auto-imports from any
 * existing `state.json` file and renames it to `state.json.backup`.
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
import { log } from "../../shared/logger.js";
import type { GoopSpecDB } from "../db/index.js";
import { migrateToV2, needsMigration } from "./migrations.js";
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
// File I/O helpers (retained for ADL and checkpoints)
// ---------------------------------------------------------------------------

const STATE_FILENAME = "state.json";
const ADL_FILENAME = "ADL.md";
const CHECKPOINTS_DIR = "checkpoints";
const META_ROW_ID = "_meta";

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
// ADL formatting helpers
// ---------------------------------------------------------------------------

const ADL_HEADER =
  "# Automated Decision Log (ADL)\n\nTracks decisions, deviations, and observations.\n\n---\n";

/** Extract a rule number from text like "Rule 1: ..." or "(Rule 2)". */
function extractRuleNumber(text: string): number | null {
  const match = /Rule\s+(\d+)/i.exec(text);
  return match ? Number.parseInt(match[1], 10) : null;
}

/** Format a single ADL entry into a markdown block. */
function formatAdlEntry(entry: ADLEntry): string {
  const ruleText = entry.rule != null ? ` (Rule ${entry.rule})` : "";
  const filesText = entry.files?.length ? `\n**Files:** ${entry.files.join(", ")}` : "";
  return `\n## [${entry.type.toUpperCase()}]${ruleText} - ${entry.timestamp}\n\n**Description:** ${entry.description}\n\n**Action:** ${entry.action}${filesText}\n\n---\n`;
}

// ---------------------------------------------------------------------------
// DB <-> GoopState reconstruction
// ---------------------------------------------------------------------------

interface MetaState {
  activeWorkflowId: string;
}

function loadMetaFromDb(db: GoopSpecDB): MetaState | null {
  const row = db.getWorkflow(META_ROW_ID);
  if (!row) return null;
  try {
    return JSON.parse(row.state) as MetaState;
  } catch {
    return null;
  }
}

function persistMeta(db: GoopSpecDB, activeWorkflowId: string): void {
  db.upsertWorkflow(META_ROW_ID, { activeWorkflowId });
}

function reconstructState(db: GoopSpecDB): GoopState | null {
  const rows = db.getAllWorkflows();
  const workflowRows = rows.filter((r) => r.id !== META_ROW_ID);

  if (workflowRows.length === 0) return null;

  const meta = loadMetaFromDb(db);
  const workflows: Record<string, WorkflowState> = {};

  for (const row of workflowRows) {
    try {
      workflows[row.id] = JSON.parse(row.state) as WorkflowState;
    } catch {
      workflows[row.id] = createDefaultWorkflowState();
    }
  }

  const activeWorkflowId = meta?.activeWorkflowId ?? Object.keys(workflows)[0] ?? "default";

  return {
    version: 2,
    activeWorkflowId,
    workflows,
  };
}

function persistStateToDb(db: GoopSpecDB, state: GoopState): void {
  for (const [id, wf] of Object.entries(state.workflows)) {
    db.upsertWorkflow(id, wf);
  }
  persistMeta(db, state.activeWorkflowId);
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export interface CreateStateManagerOptions {
  projectDir: string;
  workflowId?: string;
  db: GoopSpecDB;
}

/**
 * Create a StateManager backed by GoopSpecDB.
 *
 * On first access, if the DB has no workflow rows, the manager checks for
 * an existing `state.json` and imports it. After import, `state.json` is
 * renamed to `state.json.backup`.
 */
export function createStateManager(opts: CreateStateManagerOptions): StateManager {
  const { projectDir, db } = opts;
  const goopspecDir = join(projectDir, GOOPSPEC_DIR);
  const statePath = join(goopspecDir, STATE_FILENAME);

  let cached: GoopState | null = null;
  let migrationAttempted = false;

  /** Track which workflows have already had their ADL.md imported into the DB. */
  const adlImported = new Set<string>();

  // -----------------------------------------------------------------------
  // Internal persistence
  // -----------------------------------------------------------------------

  function ensureDir(dir: string): void {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  }

  function tryImportFromStateJson(): GoopState | null {
    const raw = safeReadFile(statePath);
    if (!raw) return null;

    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      let state: GoopState;

      if (needsMigration(parsed)) {
        state = migrateToV2(parsed);
      } else {
        state = parsed as unknown as GoopState;
      }

      persistStateToDb(db, state);

      // Rename state.json to state.json.backup
      try {
        renameSync(statePath, `${statePath}.backup`);
      } catch {
        // Best-effort rename; backup may already exist
      }

      log("Migrated state.json to GoopSpecDB", {
        workflows: Object.keys(state.workflows).length,
      });

      return state;
    } catch {
      return null;
    }
  }

  function load(): GoopState {
    if (cached) return cached;

    // Try to reconstruct from DB
    const fromDb = reconstructState(db);
    if (fromDb) {
      cached = fromDb;
      return cached;
    }

    // DB is empty — try importing from state.json (once)
    if (!migrationAttempted) {
      migrationAttempted = true;
      const imported = tryImportFromStateJson();
      if (imported) {
        cached = imported;
        return cached;
      }
    }

    // No DB data and no state.json — create fresh state
    cached = createDefaultState(opts.workflowId ?? "default");
    persistStateToDb(db, cached);
    return cached;
  }

  function persist(state: GoopState): void {
    persistStateToDb(db, state);
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
  // ADL path + migration helpers
  // -----------------------------------------------------------------------

  function adlSidecarPath(workflowId: string): string {
    if (workflowId === "default") return join(goopspecDir, ADL_FILENAME);
    return join(goopspecDir, workflowId, ADL_FILENAME);
  }

  /**
   * One-time migration: if an ADL.md exists on disk but no `adl` events
   * exist in the DB for this workflow, import the full content as a single
   * event with `imported: true`.
   */
  function maybeImportAdl(workflowId: string): void {
    if (adlImported.has(workflowId)) return;
    adlImported.add(workflowId);

    const existing = db.getEvents(workflowId, "adl");
    if (existing.length > 0) return;

    const filePath = adlSidecarPath(workflowId);
    const content = safeReadFile(filePath);
    if (!content || content.trim() === ADL_HEADER.trim()) return;

    db.appendEvent(workflowId, "adl", { text: content, imported: true });
  }

  function renderAdlSidecar(workflowId: string, markdown: string): void {
    const filePath = adlSidecarPath(workflowId);
    const dir = dirname(filePath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(filePath, markdown, "utf-8");
  }

  // -----------------------------------------------------------------------
  // Checkpoint helpers (file-based)
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

      // Also remove from DB
      db.deleteWorkflow(id);

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

    // -- ADL (DB-backed with sidecar rendering) --------------------------

    getADL(): string {
      const wfId = load().activeWorkflowId;
      maybeImportAdl(wfId);

      const events = db.getEvents(wfId, "adl");
      if (events.length === 0) return `${ADL_HEADER}\n`;

      let markdown = ADL_HEADER;
      for (const event of events) {
        const payload = JSON.parse(event.payload) as Record<string, unknown>;
        if (payload.imported && typeof payload.text === "string") {
          // Imported legacy content already contains the full ADL
          return payload.text as string;
        }
        markdown += payload.text as string;
      }

      return markdown;
    },

    appendADL(entry: ADLEntry): void {
      const wfId = load().activeWorkflowId;
      maybeImportAdl(wfId);

      const block = formatAdlEntry(entry);
      const rule = entry.rule ?? extractRuleNumber(entry.description);

      db.appendEvent(wfId, "adl", { text: block, rule });

      // Re-render the full sidecar ADL.md
      const fullMarkdown = manager.getADL();
      renderAdlSidecar(wfId, fullMarkdown);
    },

    // -- Checkpoints (file-based) ----------------------------------------

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
