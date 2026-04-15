/**
 * State Manager for GoopSpec
 * File-based state persistence with atomic writes
 * 
 * @module features/state-manager/manager
 */

import { existsSync, readFileSync, writeFileSync, readdirSync, renameSync, mkdirSync } from "fs";
import { join, dirname, basename } from "path";
import type { 
  GoopState, 
  StateManager, 
  ADLEntry, 
  CheckpointData, 
  HistoryEntry,
  WorkflowPhase,
  TaskMode,
  TaskInfo,
  GoopSpecConfig,
  WorkflowEntry,
  WorkflowSummary,
  WorkflowState,
} from "../../core/types.js";
import { listSessions, updateSessionIndex } from "../session/manager.js";
import { getProjectGoopspecDir, getWorkflowDocPath } from "../../shared/paths.js";
import { log, logError } from "../../shared/logger.js";

// ============================================================================
// Constants
// ============================================================================

const STATE_VERSION = 2;
const STATE_FILENAME = "state.json";
const ADL_FILENAME = "ADL.md";
const CHECKPOINTS_DIR = "checkpoints";
const HISTORY_DIR = "history";

// ============================================================================
// Default State
// ============================================================================

function toWorkflowState(entry: WorkflowEntry): WorkflowState {
  return {
    workflowId: entry.workflowId,
    currentPhase: entry.currentPhase,
    phase: entry.phase,
    mode: entry.mode,
    depth: entry.depth,
    researchOptIn: entry.researchOptIn,
    specLocked: entry.specLocked,
    acceptanceConfirmed: entry.acceptanceConfirmed,
    interviewComplete: entry.interviewComplete,
    interviewCompletedAt: entry.interviewCompletedAt,
    currentWave: entry.currentWave,
    totalWaves: entry.totalWaves,
    lastActivity: entry.lastActivity,
    gitignoreGoopspec: entry.gitignoreGoopspec,
    autopilot: entry.autopilot,
    lazyAutopilot: entry.lazyAutopilot,
    status: entry.status,
  };
}

function toWorkflowEntry(workflowId: string, workflow: WorkflowState): WorkflowEntry {
  return {
    workflowId,
    currentPhase: workflow.currentPhase,
    phase: workflow.phase,
    mode: workflow.mode,
    depth: workflow.depth,
    researchOptIn: workflow.researchOptIn,
    specLocked: workflow.specLocked,
    acceptanceConfirmed: workflow.acceptanceConfirmed,
    interviewComplete: workflow.interviewComplete,
    interviewCompletedAt: workflow.interviewCompletedAt,
    currentWave: workflow.currentWave,
    totalWaves: workflow.totalWaves,
    lastActivity: workflow.lastActivity,
    gitignoreGoopspec: workflow.gitignoreGoopspec,
    autopilot: workflow.autopilot,
    lazyAutopilot: workflow.lazyAutopilot,
    status: workflow.status,
  };
}

function isWorkflowStateEqual(workflow: WorkflowState, entry: WorkflowEntry): boolean {
  return (
    workflow.workflowId === entry.workflowId
    &&
    workflow.currentPhase === entry.currentPhase
    && workflow.phase === entry.phase
    && workflow.mode === entry.mode
    && workflow.depth === entry.depth
    && workflow.researchOptIn === entry.researchOptIn
    && workflow.specLocked === entry.specLocked
    && workflow.acceptanceConfirmed === entry.acceptanceConfirmed
    && workflow.interviewComplete === entry.interviewComplete
    && workflow.interviewCompletedAt === entry.interviewCompletedAt
    && workflow.currentWave === entry.currentWave
    && workflow.totalWaves === entry.totalWaves
    && workflow.lastActivity === entry.lastActivity
    && workflow.gitignoreGoopspec === entry.gitignoreGoopspec
    && workflow.autopilot === entry.autopilot
    && workflow.lazyAutopilot === entry.lazyAutopilot
    && workflow.status === entry.status
  );
}

function createDefaultState(projectName: string = "unnamed", workflowId: string = "default"): GoopState {
  const now = new Date().toISOString();
  const defaultWorkflow: WorkflowEntry = {
    workflowId,
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
    lastActivity: now,
    status: "idle",
  };

  return {
    version: STATE_VERSION,
    project: {
      name: projectName,
      initialized: now,
    },
    workflow: toWorkflowState(defaultWorkflow),
    workflows: { [workflowId]: defaultWorkflow },
    execution: {
      activeCheckpointId: null,
      completedPhases: [],
      pendingTasks: [],
    },
  };
}

/**
 * Migrate old state format to new format
 * Old format had: active, project_state, continuation_prompt_count, memory_notes
 * New format has: version, project, workflow, execution
 * 
 * Also handles hybrid states where partial new format exists but no version
 */
function migrateOldState(oldState: Record<string, unknown>, projectName?: string): GoopState {
  log("Migrating state to new format (version " + STATE_VERSION + ")");
  
  // Extract data from old format if present
  const projectState = oldState.project_state as Record<string, unknown> | undefined;
  
  // Extract any existing new format data (hybrid case)
  const existingWorkflow = oldState.workflow as Record<string, unknown> | undefined;
  const existingExecution = oldState.execution as Record<string, unknown> | undefined;
  const existingProject = oldState.project as Record<string, unknown> | undefined;
  
  // Determine project name from various sources
  const resolvedProjectName = 
    projectName || 
    (existingProject?.name as string) ||
    (projectState?.name as string) || 
    (projectState?.project_path
      ? basename(projectState.project_path as string)
      : undefined) ||
    "unnamed";
  
  // Determine initialized date
  const initializedDate = 
    (existingProject?.initialized as string) ||
    (typeof projectState?.initialized === 'string' ? projectState.initialized : null) ||
    new Date().toISOString();
  
  // Parse depth with validation
  const rawDepth = existingWorkflow?.depth as string | undefined;
  const validDepths = ["shallow", "standard", "deep"] as const;
  const depth = (rawDepth && validDepths.includes(rawDepth as typeof validDepths[number])) 
    ? rawDepth as typeof validDepths[number]
    : "standard";
  
  // Parse pendingTasks - ensure it's an array of TaskInfo, not strings
  const rawPendingTasks = existingExecution?.pendingTasks;
  const pendingTasks: TaskInfo[] = Array.isArray(rawPendingTasks) 
    ? rawPendingTasks.filter((t): t is TaskInfo => 
        typeof t === 'object' && t !== null && 'id' in t && 'name' in t)
    : [];
  
  const result: GoopState = {
    version: STATE_VERSION,
    project: {
      name: resolvedProjectName,
      initialized: initializedDate,
    },
    workflow: {
      currentPhase: (existingWorkflow?.currentPhase as string | null) || null,
      phase: (existingWorkflow?.phase as WorkflowPhase) || "idle",
      mode: (existingWorkflow?.mode as TaskMode) || "standard",
      depth,
      researchOptIn: (existingWorkflow?.researchOptIn as boolean) || false,
      specLocked: (existingWorkflow?.specLocked as boolean) || false,
      acceptanceConfirmed: (existingWorkflow?.acceptanceConfirmed as boolean) || false,
      interviewComplete: (existingWorkflow?.interviewComplete as boolean) || 
        // Support legacy root-level interview_complete
        (oldState.interview_complete as boolean) || false,
      interviewCompletedAt: (existingWorkflow?.interviewCompletedAt as string | null) ||
        (oldState.interview_completed_at as string | null) || null,
      currentWave: (existingWorkflow?.currentWave as number) || 0,
      totalWaves: (existingWorkflow?.totalWaves as number) || 0,
      lastActivity: (existingWorkflow?.lastActivity as string) || new Date().toISOString(),
      status: (existingWorkflow?.status as WorkflowPhase) || (existingWorkflow?.phase as WorkflowPhase) || "idle",
    },
    execution: {
      activeCheckpointId: (existingExecution?.activeCheckpointId as string) || null,
      completedPhases: (existingExecution?.completedPhases as WorkflowPhase[]) || [],
      pendingTasks,
    },
  };

  const workflowEntry = toWorkflowEntry("default", result.workflow);
  return {
    ...result,
    version: STATE_VERSION,
    workflows: { default: workflowEntry },
    workflow: toWorkflowState(workflowEntry),
  };
}

function migrateV1ToV2(v1State: GoopState, projectName?: string): GoopState {
  log("Migrating state from v1 to v2 (multi-workflow format)");
  const workflowEntry = toWorkflowEntry("default", v1State.workflow);
  return {
    ...v1State,
    version: STATE_VERSION,
    workflows: { default: workflowEntry },
    workflow: toWorkflowState(workflowEntry),
    project: { ...v1State.project, ...(projectName ? { name: projectName } : {}) },
  };
}

function normalizeState(state: GoopState | Record<string, unknown>, projectName?: string): GoopState {
  const hasOldFormat = 'project_state' in state;
  const hasVersion = 'version' in state;
  const version = ('version' in state ? (state as Record<string, unknown>).version : 0) as number;

  if (hasOldFormat || !hasVersion) {
    return migrateOldState(state as Record<string, unknown>, projectName);
  }

  if (version === 1) {
    return migrateV1ToV2(state as GoopState, projectName);
  }

  const defaults = createDefaultState(projectName);
  const typedState = state as GoopState;
  const normalizedWorkflow = {
    ...defaults.workflow,
    ...typedState.workflow,
  };
  const normalizedWorkflows = typedState.workflows ?? {
    default: toWorkflowEntry("default", normalizedWorkflow),
  };
  
  return {
    ...defaults,
    ...typedState,
    project: {
      ...defaults.project,
      ...typedState.project,
    },
    workflow: {
      ...normalizedWorkflow,
    },
    workflows: {
      ...normalizedWorkflows,
    },
    execution: {
      ...defaults.execution,
      ...typedState.execution,
    },
  };
}

// ============================================================================
// Phase Transition Validation
// ============================================================================

const VALID_TRANSITIONS: Record<WorkflowPhase, WorkflowPhase[]> = {
  idle: ["plan"],
  plan: ["research", "execute"],  // execute for quick mode
  research: ["specify"],
  specify: ["execute"],
  execute: ["accept"],
  accept: ["idle"],  // cycle complete
};

function canTransition(from: WorkflowPhase, to: WorkflowPhase): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

// ============================================================================
// File Utilities
// ============================================================================

/**
 * Atomic write: write to temp file, then rename
 */
function atomicWriteFile(path: string, content: string): void {
  const dir = dirname(path);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  
  const tempPath = `${path}.tmp.${Date.now()}`;
  writeFileSync(tempPath, content, "utf-8");
  renameSync(tempPath, path);
}

/**
 * Safe read file
 */
function safeReadFile(path: string): string | null {
  try {
    if (!existsSync(path)) {
      return null;
    }
    return readFileSync(path, "utf-8");
  } catch (error) {
    logError(`Failed to read file: ${path}`, error);
    return null;
  }
}

/**
 * Get today's date string for history files
 */
function getTodayDateString(): string {
  return new Date().toISOString().split("T")[0];
}

// ============================================================================
// State Manager Implementation
// ============================================================================

/**
 * Create a state manager for a project
 * 
 * @param projectDir - The project directory
 * @param projectName - Optional project name for default state
 */
export function createStateManager(
  projectDir: string, 
  projectName?: string,
  config?: GoopSpecConfig,
  sessionId?: string,
  workflowId?: string,
): StateManager {
  const goopspecDir = getProjectGoopspecDir(projectDir);
  const effectiveWorkflowId = workflowId ?? "default";
  const statePath = join(getProjectGoopspecDir(projectDir), STATE_FILENAME);
  const adlPath = getWorkflowDocPath(projectDir, effectiveWorkflowId, ADL_FILENAME);
  const checkpointsDir = getWorkflowDocPath(projectDir, effectiveWorkflowId, CHECKPOINTS_DIR);
  const historyDir = getWorkflowDocPath(projectDir, effectiveWorkflowId, HISTORY_DIR);
  let activeWorkflowId = effectiveWorkflowId;

  // In-memory cache of current state
  let cachedState: GoopState | null = null;

  /**
   * Ensure .goopspec directory exists
   */
  function ensureGoopspecDir(): void {
    if (!existsSync(goopspecDir)) {
      mkdirSync(goopspecDir, { recursive: true });
    }

    if (effectiveWorkflowId && effectiveWorkflowId !== "default") {
      const workflowDir = join(goopspecDir, effectiveWorkflowId);
      if (!existsSync(workflowDir)) {
        mkdirSync(workflowDir, { recursive: true });
      }
    }
  }

  /**
   * Keep active session index metadata in sync with state changes
   */
  function syncSessionMetadata(state: GoopState): void {
    if (!sessionId) {
      return;
    }

    try {
      const sessions = listSessions(projectDir);
      let hasChanges = false;

      const nextSessions = sessions.map((session) => {
        if (session.id !== sessionId) {
          return session;
        }

        const nextPhase = state.workflow.phase;
        const nextMode = state.workflow.mode;
        const nextLastActivity = state.workflow.lastActivity;

        if (
          session.phase === nextPhase
          && session.mode === nextMode
          && session.lastActivity === nextLastActivity
        ) {
          return session;
        }

        hasChanges = true;
        return {
          ...session,
          phase: nextPhase,
          mode: nextMode,
          lastActivity: nextLastActivity,
        };
      });

      if (hasChanges) {
        updateSessionIndex(projectDir, nextSessions);
      }
    } catch (error) {
      logError(`Failed to sync session metadata for ${sessionId}`, error);
    }
  }

  /**
   * Load state from disk
   */
  function loadState(): GoopState {
    if (cachedState) {
      return cachedState;
    }

    const content = safeReadFile(statePath);
    if (!content) {
      cachedState = createDefaultState(projectName, activeWorkflowId);
      return cachedState;
    }

    try {
      const parsed = JSON.parse(content) as Record<string, unknown>;

      const version = (parsed.version ?? 0) as number;
      const needsMigration = !('version' in parsed) || ('project_state' in parsed) || version < STATE_VERSION;

      if (needsMigration && existsSync(statePath)) {
        const backupPath = `${statePath}.v${version || "old"}-backup`;
        if (!existsSync(backupPath)) {
          try {
            writeFileSync(backupPath, content, "utf-8");
            log("Created state backup before migration", { backupPath });
          } catch (error) {
            logError("Failed to create state backup (continuing anyway)", error);
          }
        }
      }

      cachedState = normalizeState(parsed, projectName);

      if (needsMigration) {
        log("Persisting migrated state to disk");
        saveState(cachedState);
      }

      return cachedState;
    } catch (error) {
      logError("Failed to parse state.json, using default", error);
      cachedState = createDefaultState(projectName, activeWorkflowId);
      return cachedState;
    }
  }

  /**
   * Save state to disk
   */
  function saveState(state: GoopState): void {
    ensureGoopspecDir();
    const activeEntry = toWorkflowEntry(activeWorkflowId, state.workflow);
    const workflows = {
      ...(state.workflows ?? {}),
      [activeWorkflowId]: activeEntry,
    };
    const synced: GoopState = {
      ...state,
      workflow: toWorkflowState(workflows[activeWorkflowId]),
      workflows,
    };
    atomicWriteFile(statePath, JSON.stringify(synced, null, 2));
    cachedState = synced;
    syncSessionMetadata(synced);
  }

  // -------------------------------------------------------------------------
  // StateManager Interface Implementation
  // -------------------------------------------------------------------------

  function getState(): GoopState {
    const state = loadState();
    const active = state.workflows?.[activeWorkflowId];
    if (active && !isWorkflowStateEqual(state.workflow, active)) {
      const nextState: GoopState = {
        ...state,
        workflow: toWorkflowState(active),
      };
      cachedState = nextState;
      return nextState;
    }
    return state;
  }

  function setState(updates: Partial<GoopState>): void {
    const current = getState();
    const newState: GoopState = {
      ...current,
      ...updates,
      workflow: {
        ...current.workflow,
        ...(updates.workflow || {}),
        lastActivity: new Date().toISOString(),
      },
      execution: {
        ...current.execution,
        ...(updates.execution || {}),
      },
    };
    saveState(newState);
  }

  function updateWorkflow(updates: Partial<WorkflowState>): void {
    const current = getState();
    const newState: GoopState = {
      ...current,
      workflow: {
        ...current.workflow,
        ...updates,
        lastActivity: new Date().toISOString(),
      },
    };
    saveState(newState);
  }

  function getADL(): string {
    ensureGoopspecDir();
    const content = safeReadFile(adlPath);
    if (!content) {
      // Create default ADL file
      const defaultADL = `# Automated Decision Log (ADL)

This file tracks architectural decisions, deviations, and observations made during development.

---

`;
      atomicWriteFile(adlPath, defaultADL);
      return defaultADL;
    }
    return content;
  }

  function appendADL(entry: ADLEntry): void {
    if (config?.adlEnabled === false) {
      return;
    }

    ensureGoopspecDir();
    
    // Ensure ADL exists
    getADL();

    // Format entry
    const ruleText = entry.rule ? ` (Rule ${entry.rule})` : "";
    const filesText = entry.files?.length 
      ? `\n- Files: ${entry.files.join(", ")}` 
      : "";
    
    const entryText = `
## [${entry.type.toUpperCase()}]${ruleText} - ${entry.timestamp}

**Description:** ${entry.description}

**Action:** ${entry.action}${filesText}

---
`;

    const current = safeReadFile(adlPath) || "";
    atomicWriteFile(adlPath, current + entryText);
    log("ADL entry added", { type: entry.type });
  }

  function saveCheckpoint(id: string, data: Omit<CheckpointData, "id">): void {
    ensureGoopspecDir();
    
    if (!existsSync(checkpointsDir)) {
      mkdirSync(checkpointsDir, { recursive: true });
    }

    const checkpoint: CheckpointData = {
      id,
      ...data,
    };

    const path = join(checkpointsDir, `${id}.json`);
    atomicWriteFile(path, JSON.stringify(checkpoint, null, 2));
    
    // Update state with active checkpoint
    updateWorkflow({});
    const current = loadState();
    saveState({
      ...current,
      execution: {
        ...current.execution,
        activeCheckpointId: id,
      },
    });
    
    log("Checkpoint saved", { id });
  }

  function loadCheckpoint(id: string): CheckpointData | null {
    const path = join(checkpointsDir, `${id}.json`);
    const content = safeReadFile(path);
    
    if (!content) {
      return null;
    }

    try {
      return JSON.parse(content) as CheckpointData;
    } catch (error) {
      logError(`Failed to parse checkpoint: ${id}`, error);
      return null;
    }
  }

  function listCheckpoints(): string[] {
    if (!existsSync(checkpointsDir)) {
      return [];
    }

    try {
      const files = readdirSync(checkpointsDir);
      return files
        .filter(f => f.endsWith(".json"))
        .map(f => f.replace(".json", ""));
    } catch (error) {
      logError("Failed to list checkpoints", error);
      return [];
    }
  }

  function appendHistory(entry: HistoryEntry): void {
    ensureGoopspecDir();
    
    if (!existsSync(historyDir)) {
      mkdirSync(historyDir, { recursive: true });
    }

    const dateStr = getTodayDateString();
    const historyPath = join(historyDir, `${dateStr}.json`);

    let entries: HistoryEntry[] = [];
    const existing = safeReadFile(historyPath);
    
    if (existing) {
      try {
        entries = JSON.parse(existing);
      } catch {
        entries = [];
      }
    }

    entries.push(entry);
    atomicWriteFile(historyPath, JSON.stringify(entries, null, 2));
    log("History entry added", { type: entry.type });
  }

  function transitionPhase(to: WorkflowPhase, force: boolean = false): boolean {
    const current = getState();
    const from = current.workflow.phase;
    const validTransitions = VALID_TRANSITIONS[from] ?? [];
    
    if (!force && !canTransition(from, to)) {
      const validList = validTransitions.length > 0
        ? validTransitions.join(", ")
        : "none";
      logError(
        `Invalid phase transition: ${from} -> ${to}. ` +
        `Valid transitions: ${validList}. Use force=true to override.`
      );
      return false;
    }
    
    if (force && !canTransition(from, to)) {
      log("Forcing phase transition (bypassing validation)", { from, to });
      appendADL({
        timestamp: new Date().toISOString(),
        type: "decision",
        description: `Forced phase transition: ${from} -> ${to}`,
        action: "Bypassed transition validation using force=true",
      });
    }
    
    const newState: GoopState = {
      ...current,
      workflow: {
        ...current.workflow,
        phase: to,
        status: to, // Keep legacy field in sync
        lastActivity: new Date().toISOString(),
      },
      execution: {
        ...current.execution,
        completedPhases: from !== "idle" && to !== from
          ? [...current.execution.completedPhases, from]
          : current.execution.completedPhases,
      },
    };
    
    saveState(newState);
    log("Phase transition", { from, to, forced: force });
    
    // Log to history
    appendHistory({
      timestamp: new Date().toISOString(),
      type: "phase_change",
      data: { from, to, forced: force },
    });
    
    return true;
  }

  function lockSpec(): void {
    const current = getState();
    const newState: GoopState = {
      ...current,
      workflow: {
        ...current.workflow,
        specLocked: true,
        lastActivity: new Date().toISOString(),
      },
    };
    saveState(newState);
    log("Spec locked");
  }

  function unlockSpec(): void {
    const current = getState();
    const newState: GoopState = {
      ...current,
      workflow: {
        ...current.workflow,
        specLocked: false,
        lastActivity: new Date().toISOString(),
      },
    };
    saveState(newState);
    log("Spec unlocked");
  }

  function confirmAcceptance(): void {
    const current = getState();
    const newState: GoopState = {
      ...current,
      workflow: {
        ...current.workflow,
        acceptanceConfirmed: true,
        lastActivity: new Date().toISOString(),
      },
    };
    saveState(newState);
    log("Acceptance confirmed");
  }

  function resetAcceptance(): void {
    const current = getState();
    const newState: GoopState = {
      ...current,
      workflow: {
        ...current.workflow,
        acceptanceConfirmed: false,
        lastActivity: new Date().toISOString(),
      },
    };
    saveState(newState);
    log("Acceptance reset");
  }

  function completeInterview(): void {
    const current = getState();
    const now = new Date().toISOString();
    const newState: GoopState = {
      ...current,
      workflow: {
        ...current.workflow,
        interviewComplete: true,
        interviewCompletedAt: now,
        lastActivity: now,
      },
    };
    saveState(newState);
    log("Interview completed");
  }

  function resetInterview(): void {
    const current = getState();
    const newState: GoopState = {
      ...current,
      workflow: {
        ...current.workflow,
        interviewComplete: false,
        interviewCompletedAt: null,
        lastActivity: new Date().toISOString(),
      },
    };
    saveState(newState);
    log("Interview reset");
  }

  function setMode(mode: TaskMode): void {
    const current = getState();
    const newState: GoopState = {
      ...current,
      workflow: {
        ...current.workflow,
        mode,
        lastActivity: new Date().toISOString(),
      },
    };
    saveState(newState);
    log("Task mode set", { mode });
  }

  function updateWaveProgress(currentWave: number, totalWaves: number): void {
    const current = getState();
    const newState: GoopState = {
      ...current,
      workflow: {
        ...current.workflow,
        currentWave,
        totalWaves,
        lastActivity: new Date().toISOString(),
      },
    };
    saveState(newState);
    log("Wave progress updated", { currentWave, totalWaves });
  }

  function resetWorkflow(): void {
    const current = getState();
    const now = new Date().toISOString();
    const newState: GoopState = {
      ...current,
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
        lastActivity: now,
        status: "idle",
        autopilot: undefined,
      },
      execution: {
        ...current.execution,
        completedPhases: [],
        pendingTasks: [],
      },
    };
    saveState(newState);
    log("Workflow reset");
  }

  function getWorkflow(id: string): WorkflowEntry | null {
    const state = loadState();
    return state.workflows?.[id] ?? null;
  }

  function listWorkflows(): WorkflowSummary[] {
    const state = loadState();
    const workflows = state.workflows ?? { default: toWorkflowEntry("default", state.workflow) };

    return Object.entries(workflows).map(([id, workflow]) => ({
      workflowId: id,
      phase: workflow.phase,
      currentWave: workflow.currentWave,
      totalWaves: workflow.totalWaves,
      specLocked: workflow.specLocked,
      lastActivity: workflow.lastActivity,
      isActive: id === activeWorkflowId,
    }));
  }

  function setActiveWorkflow(id: string): boolean {
    const state = loadState();
    if (!state.workflows?.[id]) {
      return false;
    }

    activeWorkflowId = id;
    cachedState = null;
    return true;
  }

  function createWorkflow(id: string): WorkflowEntry {
    const state = getState();
    const existing = state.workflows?.[id];
    if (existing) {
      return existing;
    }

    const now = new Date().toISOString();
    const newWorkflow: WorkflowEntry = {
      workflowId: id,
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
      lastActivity: now,
      status: "idle",
    };

    saveState({
      ...state,
      workflows: { ...(state.workflows ?? {}), [id]: newWorkflow },
    });

    return newWorkflow;
  }

  function removeWorkflow(id: string): boolean {
    if (id === "default") {
      log("Cannot remove the default workflow");
      return false;
    }

    const state = getState();
    if (!state.workflows?.[id]) {
      return false;
    }

    const { [id]: _removed, ...remaining } = state.workflows;
    saveState({ ...state, workflows: remaining });

    // If the removed workflow was active, fall back to "default"
    if (activeWorkflowId === id) {
      activeWorkflowId = "default";
      cachedState = null;
    }

    log("Removed workflow from state", { workflowId: id });
    return true;
  }

  function getActiveWorkflowId(): string {
    return activeWorkflowId;
  }

  return {
    getState,
    setState,
    updateWorkflow,
    getWorkflow,
    listWorkflows,
    setActiveWorkflow,
    createWorkflow,
    removeWorkflow,
    getActiveWorkflowId,
    transitionPhase,
    lockSpec,
    unlockSpec,
    confirmAcceptance,
    resetAcceptance,
    completeInterview,
    resetInterview,
    setMode,
    updateWaveProgress,
    resetWorkflow,
    getADL,
    appendADL,
    saveCheckpoint,
    loadCheckpoint,
    listCheckpoints,
    appendHistory,
  };
}

/**
 * Initialize a new .goopspec directory with default state
 */
export async function initializeGoopspec(
  projectDir: string, 
  projectName: string
): Promise<void> {
  const manager = createStateManager(projectDir, projectName);
  
  // This will create the default state
  const state = manager.getState();
  manager.setState({ 
    project: { 
      ...state.project, 
      name: projectName 
    } 
  });
  
  // Initialize ADL
  manager.getADL();
  
  log("GoopSpec initialized", { projectDir, projectName });
}
