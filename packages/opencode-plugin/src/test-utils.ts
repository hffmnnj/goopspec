/**
 * Shared test utilities for GoopSpec 1.0.0 plugin.
 *
 * Provides mock factories for PluginContext, ToolContext, StateManager,
 * MemoryManager, and ResourceResolver — all aligned with the interfaces
 * in core/types.ts and the verified @opencode-ai/plugin SDK (v1.1.x).
 *
 * @module test-utils
 */

import { existsSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { STATE_SCHEMA_VERSION } from "./core/constants.js";
import type { TaskMode, WorkflowDepth, WorkflowPhase } from "./core/constants.js";
import type { ToolContext } from "./core/sdk-compat.js";
import type {
  ADLEntry,
  CheckpointData,
  GoopState,
  MemoryEntry,
  MemoryManager,
  MemorySaveInput,
  MemorySearchOptions,
  MemorySearchResult,
  PluginContext,
  ResolvedResource,
  ResourceResolver,
  ResourceType,
  SdkEssentials,
  SessionInfo,
  StateManager,
  WorkflowState,
} from "./core/types.js";
import { GoopSpecDB } from "./features/db/index.js";
import { createSessionManager } from "./features/session/index.js";

// Re-export types that tests commonly need alongside the factories.
export type { GoopState, MemoryEntry, PluginContext, StateManager, ToolContext, WorkflowState };

// ============================================================================
// Test Directory Management
// ============================================================================

/**
 * Create a unique temporary test directory with a `.goopspec/` scaffold.
 *
 * Returns the directory path and a cleanup function that removes it.
 */
export function setupTestEnvironment(prefix = "goopspec-test"): {
  testDir: string;
  db: GoopSpecDB;
  cleanup: () => void;
} {
  const testDir = join(tmpdir(), `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const goopspecDir = join(testDir, ".goopspec");

  mkdirSync(goopspecDir, { recursive: true });
  mkdirSync(join(goopspecDir, "default"), { recursive: true });

  // Create an in-memory DB for tests
  const db = new GoopSpecDB(":memory:");

  return {
    testDir,
    db,
    cleanup: () => {
      db.close();
      if (existsSync(testDir)) {
        rmSync(testDir, { recursive: true, force: true });
      }
    },
  };
}

// ============================================================================
// Mock Factories — ToolContext (SDK shape)
// ============================================================================

export interface MockToolContextOptions {
  sessionID?: string;
  messageID?: string;
  agent?: string;
  directory?: string;
  worktree?: string;
}

/**
 * Create a mock `ToolContext` matching the @opencode-ai/plugin SDK shape.
 */
export function createMockToolContext(opts: MockToolContextOptions = {}): ToolContext {
  const dir = opts.directory ?? join(tmpdir(), "mock-tool-ctx");
  return {
    sessionID: opts.sessionID ?? "test-session-001",
    messageID: opts.messageID ?? "test-message-001",
    agent: opts.agent ?? "test-agent",
    directory: dir,
    worktree: opts.worktree ?? dir,
    abort: new AbortController().signal,
    metadata: (_input: { title?: string; metadata?: Record<string, unknown> }) => {},
    ask: async (_input: {
      permission: string;
      patterns: string[];
      always: string[];
      metadata: Record<string, unknown>;
    }) => {},
  };
}

// ============================================================================
// Mock Factories — StateManager
// ============================================================================

/** Default WorkflowState for testing. */
export function createDefaultWorkflowState(overrides: Partial<WorkflowState> = {}): WorkflowState {
  return {
    phase: "idle",
    mode: "standard",
    depth: "standard",
    interviewComplete: false,
    specLocked: false,
    acceptanceConfirmed: false,
    currentWave: 0,
    totalWaves: 0,
    autopilot: false,
    lazyAutopilot: false,
    ...overrides,
  };
}

/** Valid phase transitions for the 5-phase workflow. */
const VALID_TRANSITIONS: Record<WorkflowPhase, readonly WorkflowPhase[]> = {
  idle: ["discuss", "plan"],
  discuss: ["plan", "idle"],
  plan: ["execute", "discuss", "idle"],
  execute: ["accept", "plan"],
  accept: ["idle"],
};

/**
 * Create an in-memory `StateManager` mock that implements the full interface.
 */
export function createMockStateManager(initialState?: Partial<GoopState>): StateManager {
  let state: GoopState = {
    version: STATE_SCHEMA_VERSION,
    activeWorkflowId: initialState?.activeWorkflowId ?? "default",
    workflows: initialState?.workflows ?? {
      default: createDefaultWorkflowState(),
    },
  };

  let adlContent = "# Automated Decision Log\n\n";
  const checkpoints = new Map<string, CheckpointData>();

  function active(): WorkflowState {
    const wf = state.workflows[state.activeWorkflowId];
    if (!wf) {
      throw new Error(`Active workflow "${state.activeWorkflowId}" not found`);
    }
    return wf;
  }

  function mutateActive(fn: (wf: WorkflowState) => void): void {
    const wf = active();
    fn(wf);
  }

  const mgr: StateManager = {
    getState: () => state,
    setState: (next: GoopState) => {
      state = next;
    },

    // Workflow CRUD
    getWorkflow: (id: string) => state.workflows[id],
    getActiveWorkflow: () => active(),
    getActiveWorkflowId: () => state.activeWorkflowId,
    setActiveWorkflow: (id: string) => {
      if (!state.workflows[id]) {
        throw new Error(`Workflow "${id}" does not exist`);
      }
      state.activeWorkflowId = id;
    },
    createWorkflow: (id: string) => {
      if (state.workflows[id]) {
        return state.workflows[id];
      }
      const wf = createDefaultWorkflowState();
      state.workflows[id] = wf;
      return wf;
    },
    removeWorkflow: (id: string) => {
      if (!state.workflows[id]) return;
      const { [id]: _removed, ...rest } = state.workflows;
      state.workflows = rest;
      if (state.activeWorkflowId === id) {
        state.activeWorkflowId = Object.keys(state.workflows)[0] ?? "default";
      }
    },
    listWorkflowIds: () => Object.keys(state.workflows),

    // Workflow mutations (active)
    updateWorkflow: (updates: Partial<WorkflowState>) => {
      mutateActive((wf) => Object.assign(wf, updates));
    },
    transitionPhase: (to: WorkflowPhase, force = false) => {
      const current = active().phase;
      const allowed = VALID_TRANSITIONS[current];
      if (!force && !allowed?.includes(to)) {
        throw new Error(`Invalid phase transition: ${current} → ${to}`);
      }
      mutateActive((wf) => {
        wf.phase = to;
      });
    },
    lockSpec: () =>
      mutateActive((wf) => {
        wf.specLocked = true;
      }),
    unlockSpec: () =>
      mutateActive((wf) => {
        wf.specLocked = false;
      }),
    confirmAcceptance: () =>
      mutateActive((wf) => {
        wf.acceptanceConfirmed = true;
      }),
    resetAcceptance: () =>
      mutateActive((wf) => {
        wf.acceptanceConfirmed = false;
      }),
    completeInterview: () =>
      mutateActive((wf) => {
        wf.interviewComplete = true;
      }),
    resetInterview: () =>
      mutateActive((wf) => {
        wf.interviewComplete = false;
      }),
    setMode: (mode: TaskMode) =>
      mutateActive((wf) => {
        wf.mode = mode;
      }),
    setDepth: (depth: WorkflowDepth) =>
      mutateActive((wf) => {
        wf.depth = depth;
      }),
    updateWaveProgress: (current: number, total: number) => {
      mutateActive((wf) => {
        wf.currentWave = current;
        wf.totalWaves = total;
      });
    },
    resetWorkflow: () => {
      state.workflows[state.activeWorkflowId] = createDefaultWorkflowState();
    },

    // ADL
    getADL: () => adlContent,
    appendADL: (entry: ADLEntry) => {
      adlContent += `\n## [${entry.type.toUpperCase()}] ${entry.timestamp}\n`;
      adlContent += `**Description:** ${entry.description}\n`;
      adlContent += `**Action:** ${entry.action}\n`;
      if (entry.rule != null) adlContent += `**Rule:** ${entry.rule}\n`;
      if (entry.files?.length) adlContent += `**Files:** ${entry.files.join(", ")}\n`;
    },

    // Checkpoints
    saveCheckpoint: (id: string, data: CheckpointData) => {
      checkpoints.set(id, data);
    },
    loadCheckpoint: (id: string) => checkpoints.get(id) ?? null,
    listCheckpoints: () => Array.from(checkpoints.keys()),
  };

  return mgr;
}

// ============================================================================
// Mock Factories — MemoryManager
// ============================================================================

/**
 * Create an in-memory `MemoryManager` mock backed by a plain array.
 */
export function createMockMemory(seed: MemoryEntry[] = []): MemoryManager {
  const store = new Map<number, MemoryEntry>();
  let nextId = 1;

  for (const entry of seed) {
    store.set(entry.id, entry);
    if (entry.id >= nextId) nextId = entry.id + 1;
  }

  return {
    save: async (input: MemorySaveInput): Promise<MemoryEntry> => {
      const entry: MemoryEntry = {
        id: nextId++,
        type: input.type,
        title: input.title,
        content: input.content,
        facts: input.facts,
        concepts: input.concepts,
        sourceFiles: input.sourceFiles,
        importance: input.importance ?? 5,
        createdAt: Date.now(),
      };
      store.set(entry.id, entry);
      return entry;
    },

    search: async (options: MemorySearchOptions): Promise<MemorySearchResult[]> => {
      const query = options.query.toLowerCase();
      const results: MemorySearchResult[] = [];

      for (const entry of store.values()) {
        // Type filter
        if (options.types && !options.types.includes(entry.type)) continue;
        // Importance filter
        if (options.minImportance != null && entry.importance < options.minImportance) continue;
        // Concept filter
        if (
          options.concepts?.length &&
          !options.concepts.some((c) => entry.concepts?.includes(c))
        ) {
          continue;
        }

        const titleMatch = entry.title.toLowerCase().includes(query);
        const contentMatch = entry.content.toLowerCase().includes(query);

        if (titleMatch || contentMatch) {
          results.push({
            memory: entry,
            score: titleMatch ? 1.0 : 0.7,
            matchType: "fts",
          });
        }
      }

      // Sort by score descending, then limit
      results.sort((a, b) => b.score - a.score);
      return results.slice(0, options.limit ?? 10);
    },

    getById: async (id: number): Promise<MemoryEntry | null> => {
      return store.get(id) ?? null;
    },

    forget: async (id: number): Promise<boolean> => {
      return store.delete(id);
    },

    forgetByQuery: async (query: string): Promise<number> => {
      const q = query.toLowerCase();
      let count = 0;
      for (const [id, entry] of store) {
        if (entry.title.toLowerCase().includes(q) || entry.content.toLowerCase().includes(q)) {
          store.delete(id);
          count++;
        }
      }
      return count;
    },
  };
}

// ============================================================================
// Mock Factories — ResourceResolver
// ============================================================================

/**
 * Create a mock `ResourceResolver` backed by an in-memory resource list.
 */
export function createMockResolver(resources: ResolvedResource[] = []): ResourceResolver {
  const byKey = new Map<string, ResolvedResource>();
  for (const r of resources) {
    byKey.set(`${r.type}:${r.name}`, r);
  }

  return {
    resolve: (type: ResourceType, name: string) => {
      return byKey.get(`${type}:${name}`) ?? null;
    },

    resolveMany: (names: string[]): ResolvedResource[] => {
      const results: ResolvedResource[] = [];
      for (const name of names) {
        // Try reference first, then template
        const ref = byKey.get(`reference:${name}`) ?? byKey.get(`template:${name}`);
        if (ref) results.push(ref);
      }
      return results;
    },

    resolveAll: (type: ResourceType) => {
      return resources.filter((r) => r.type === type);
    },

    listNames: (type: ResourceType) => {
      return resources.filter((r) => r.type === type).map((r) => r.name);
    },
  };
}

// ============================================================================
// Mock Factories — PluginContext
// ============================================================================

export interface MockPluginContextOptions {
  testDir?: string;
  db?: GoopSpecDB;
  state?: Partial<GoopState>;
  memories?: MemoryEntry[];
  resources?: ResolvedResource[];
  sessionId?: string;
  agent?: string;
}

/**
 * Create a mock `PluginContext` with all subsystems wired up.
 *
 * If `testDir` is not provided, a temporary directory is created. Callers
 * should use `setupTestEnvironment` for proper lifecycle management.
 */
export function createMockPluginContext(opts: MockPluginContextOptions = {}): PluginContext {
  const dir = opts.testDir ?? join(tmpdir(), `mock-ctx-${Date.now()}`);
  const db = opts.db ?? new GoopSpecDB(":memory:");

  const sdk: SdkEssentials = {
    client: {} as SdkEssentials["client"],
    directory: dir,
    worktree: dir,
    $: (async (..._args: unknown[]) => ({
      stdout: Buffer.from(""),
      stderr: Buffer.from(""),
      exitCode: 0,
      text: () => "",
    })) as unknown as SdkEssentials["$"],
  };

  const session: SessionInfo = {
    id: opts.sessionId ?? "test-session-001",
    agent: opts.agent ?? "test-agent",
    startedAt: new Date().toISOString(),
  };

  return {
    sdk,
    db,
    stateManager: createMockStateManager(opts.state),
    memory: createMockMemory(opts.memories ?? []),
    resolver: createMockResolver(opts.resources ?? []),
    session,
    sessionManager: createSessionManager(),
    compactionHandoff: new Map<string, string>(),
    pendingCompactions: new Map(),
  };
}

// ============================================================================
// Async helpers
// ============================================================================

/** Wait for a specified number of milliseconds. */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
