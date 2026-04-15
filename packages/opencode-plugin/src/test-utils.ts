/**
 * Shared Test Utilities for GoopSpec
 * 
 * This module provides common test fixtures, factories, and helpers
 * for consistent, isolated testing across the codebase.
 * 
 * @module test-utils
 */

import { mkdirSync, rmSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import type {
  PluginContext,
  MinimalPluginInput,
  GoopSpecConfig,
  GoopState,
  StateManager,
  ResourceResolver,
  ResolvedResource,
  ResourceType,
  ADLEntry,
  CheckpointData,
  HistoryEntry,
  MemoryManager,
  Memory,
  MemoryInput,
  MemoryUpdate,
  SearchResult,
  SearchOptions,
  MemoryType,
  WorkflowPhase,
  TaskMode,
  ToolContext,
} from "./core/types.js";

// ============================================================================
// Test Directory Management
// ============================================================================

/**
 * Create a unique temporary test directory
 * @param prefix - Optional prefix for the directory name
 * @returns Path to the created test directory
 */
export function createTestDir(prefix: string = "goopspec-test"): string {
  const testDir = join(tmpdir(), `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(testDir, { recursive: true });
  return testDir;
}

/**
 * Clean up a test directory
 * @param testDir - Path to the test directory to remove
 */
export function cleanupTestDir(testDir: string): void {
  if (existsSync(testDir)) {
    rmSync(testDir, { recursive: true, force: true });
  }
}

/**
 * Create a test directory with common GoopSpec structure
 * @param prefix - Optional prefix for the directory name
 * @returns Object with test directory path and cleanup function
 */
export function setupTestEnvironment(prefix: string = "goopspec-test"): {
  testDir: string;
  goopspecDir: string;
  cleanup: () => void;
} {
  const testDir = createTestDir(prefix);
  const goopspecDir = join(testDir, ".goopspec");
  
  // Create standard directories
  mkdirSync(goopspecDir, { recursive: true });
  mkdirSync(join(goopspecDir, "checkpoints"), { recursive: true });
  mkdirSync(join(goopspecDir, "history"), { recursive: true });
  mkdirSync(join(goopspecDir, "phases"), { recursive: true });
  
  return {
    testDir,
    goopspecDir,
    cleanup: () => cleanupTestDir(testDir),
  };
}

// ============================================================================
// Mock Factories - Tool Context
// ============================================================================

/**
 * Create a mock ToolContext (from @opencode-ai/plugin/tool)
 * @param overrides - Optional overrides for specific fields
 */
export function createMockToolContext(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    sessionID: "test-session-123",
    messageID: "test-message-456",
    agent: "test-agent",
    directory: join(tmpdir(), "test"),
    worktree: join(tmpdir(), "test"),
    abort: new AbortController().signal,
    metadata: (_input: { title?: string; metadata?: Record<string, unknown> }) => {},
    ask: async (_input: { permission: string; patterns: string[]; always: string[]; metadata: Record<string, unknown> }) => {},
    ...overrides,
  };
}

// ============================================================================
// Mock Factories - State Manager
// ============================================================================

/**
 * Default GoopState for testing
 */
export const DEFAULT_TEST_STATE: GoopState = {
  version: 2,
  project: {
    name: "test-project",
    initialized: new Date().toISOString(),
  },
  workflow: {
    phase: "idle",
    mode: "standard",
    depth: "standard",
    researchOptIn: false,
    specLocked: false,
    acceptanceConfirmed: false,
    interviewComplete: false,
    interviewCompletedAt: null,
    currentPhase: null,
    currentWave: 0,
    totalWaves: 0,
    lastActivity: new Date().toISOString(),
  },
  workflows: {
    default: {
      workflowId: "default",
      phase: "idle",
      mode: "standard",
      depth: "standard",
      researchOptIn: false,
      specLocked: false,
      acceptanceConfirmed: false,
      interviewComplete: false,
      interviewCompletedAt: null,
      currentPhase: null,
      currentWave: 0,
      totalWaves: 0,
      lastActivity: new Date().toISOString(),
    },
  },
  execution: {
    activeCheckpointId: null,
    completedPhases: [],
    pendingTasks: [],
  },
};

/**
 * Create a mock StateManager
 * @param initialState - Optional initial state
 */
export function createMockStateManager(initialState: Partial<GoopState> = {}): StateManager {
  let state: GoopState = {
    ...DEFAULT_TEST_STATE,
    ...initialState,
    workflow: { ...DEFAULT_TEST_STATE.workflow, ...initialState.workflow },
    execution: { ...DEFAULT_TEST_STATE.execution, ...initialState.execution },
    project: { ...DEFAULT_TEST_STATE.project, ...initialState.project },
  };
  
  let adlContent = "# Automated Decision Log\n\n";
  const checkpoints = new Map<string, CheckpointData>();
  const history: HistoryEntry[] = [];
  let activeWorkflowId = "default";

  function syncActiveWorkflow(): void {
    state.workflows = {
      ...(state.workflows ?? {}),
      [activeWorkflowId]: {
        workflowId: activeWorkflowId,
        ...state.workflow,
      },
    };
  }

  syncActiveWorkflow();
  
  return {
    getState: () => state,
    
    setState: (updates: Partial<GoopState>) => {
      state = {
        ...state,
        ...updates,
        workflow: { ...state.workflow, ...updates.workflow },
        workflows: { ...state.workflows, ...updates.workflows },
        execution: { ...state.execution, ...updates.execution },
        project: { ...state.project, ...updates.project },
      };
      syncActiveWorkflow();
    },
    
    updateWorkflow: (updates: Partial<GoopState["workflow"]>) => {
      state = {
        ...state,
        workflow: { ...state.workflow, ...updates },
      };
      syncActiveWorkflow();
    },

    getWorkflow: (id: string) => state.workflows?.[id] ?? null,

    listWorkflows: () => {
      const workflows = state.workflows ?? {
        default: {
          workflowId: "default",
          ...state.workflow,
        },
      };

      return Object.entries(workflows).map(([workflowId, workflow]) => ({
        workflowId,
        phase: workflow.phase,
        currentWave: workflow.currentWave,
        totalWaves: workflow.totalWaves,
        specLocked: workflow.specLocked,
        lastActivity: workflow.lastActivity,
        isActive: workflowId === activeWorkflowId,
      }));
    },

    setActiveWorkflow: (id: string) => {
      if (!state.workflows?.[id]) {
        return false;
      }

      activeWorkflowId = id;
      state = {
        ...state,
        workflow: {
          ...state.workflows[id],
        },
      };
      return true;
    },

    createWorkflow: (id: string) => {
      const existing = state.workflows?.[id];
      if (existing) {
        return existing;
      }

      const now = new Date().toISOString();
      const workflow: NonNullable<GoopState["workflows"]>[string] = {
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
      };

      state = {
        ...state,
        workflows: {
          ...(state.workflows ?? {}),
          [id]: workflow,
        },
      };
      return workflow;
    },

    removeWorkflow: (id: string): boolean => {
      if (id === "default") {
        return false;
      }
      if (!state.workflows?.[id]) {
        return false;
      }
      const { [id]: _removed, ...remaining } = state.workflows;
      state = { ...state, workflows: remaining };
      if (activeWorkflowId === id) {
        activeWorkflowId = "default";
      }
      return true;
    },

    getActiveWorkflowId: () => activeWorkflowId,
    
    transitionPhase: (to: WorkflowPhase, force = false): boolean => {
      const validTransitions: Record<WorkflowPhase, WorkflowPhase[]> = {
        idle: ["plan"],
        plan: ["research", "specify", "execute"],
        research: ["specify", "plan"],
        specify: ["execute", "plan"],
        execute: ["accept", "plan"],
        accept: ["idle"],
      };
      
      const currentPhase = state.workflow.phase;
      const isValid = force || validTransitions[currentPhase]?.includes(to);
      
      if (isValid) {
        if (state.workflow.phase !== "idle") {
          state.execution.completedPhases = [...state.execution.completedPhases, state.workflow.phase];
        }
        state.workflow.phase = to;
        state.workflow.lastActivity = new Date().toISOString();
        syncActiveWorkflow();
        return true;
      }
      return false;
    },
    
    lockSpec: () => {
      state.workflow.specLocked = true;
      syncActiveWorkflow();
    },
    
    unlockSpec: () => {
      state.workflow.specLocked = false;
      syncActiveWorkflow();
    },
    
    confirmAcceptance: () => {
      state.workflow.acceptanceConfirmed = true;
      syncActiveWorkflow();
    },
    
    resetAcceptance: () => {
      state.workflow.acceptanceConfirmed = false;
      syncActiveWorkflow();
    },
    
    completeInterview: () => {
      state.workflow.interviewComplete = true;
      state.workflow.interviewCompletedAt = new Date().toISOString();
      syncActiveWorkflow();
    },
    
    resetInterview: () => {
      state.workflow.interviewComplete = false;
      state.workflow.interviewCompletedAt = null;
      syncActiveWorkflow();
    },
    
    setMode: (mode: TaskMode) => {
      state.workflow.mode = mode;
      syncActiveWorkflow();
    },
    
    updateWaveProgress: (current: number, total: number) => {
      state.workflow.currentWave = current;
      state.workflow.totalWaves = total;
      syncActiveWorkflow();
    },
    
    resetWorkflow: () => {
      state.workflow = {
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
      };
      syncActiveWorkflow();
    },
    
    getADL: () => adlContent,
    
    appendADL: (entry: ADLEntry) => {
      adlContent += `\n## [${entry.type.toUpperCase()}] ${entry.timestamp}\n`;
      adlContent += `**Description:** ${entry.description}\n`;
      adlContent += `**Action:** ${entry.action}\n`;
      if (entry.rule) adlContent += `**Rule:** ${entry.rule}\n`;
      if (entry.files?.length) adlContent += `**Files:** ${entry.files.join(", ")}\n`;
    },
    
    saveCheckpoint: (id: string, data: Omit<CheckpointData, "id">) => {
      checkpoints.set(id, { id, ...data });
    },
    
    loadCheckpoint: (id: string) => checkpoints.get(id) || null,
    
    listCheckpoints: () => Array.from(checkpoints.keys()),
    
    appendHistory: (entry: HistoryEntry) => {
      history.push(entry);
    },
  };
}

// ============================================================================
// Mock Factories - Resource Resolver
// ============================================================================

/**
 * Create a mock resource
 */
export function createMockResource(overrides: Partial<ResolvedResource> = {}): ResolvedResource {
  return {
    name: "test-resource",
    path: "/test/path/resource.md",
    type: "skill",
    frontmatter: {
      name: "test-resource",
      description: "A test resource",
    },
    body: "Test resource body content",
    content: "---\nname: test-resource\n---\nTest resource body content",
    ...overrides,
  };
}

/**
 * Create a mock ResourceResolver
 */
export function createMockResourceResolver(resources: ResolvedResource[] = []): ResourceResolver {
  const resourceMap = new Map<string, ResolvedResource>();
  resources.forEach(r => resourceMap.set(`${r.type}:${r.name}`, r));
  
  return {
    resolve: (type: ResourceType, name: string) => {
      const key = `${type}:${name}`;
      return resourceMap.get(key) || null;
    },
    
    resolveAll: (type: ResourceType) => {
      return resources.filter(r => r.type === type);
    },
    
    getDirectory: (type: ResourceType) => {
      const dirs: Record<ResourceType, string> = {
        agent: "/test/agents",
        command: "/test/commands",
        skill: "/test/skills",
        reference: "/test/references",
        template: "/test/templates",
      };
      return dirs[type] || null;
    },
    
    clearCache: () => {},
  };
}

// ============================================================================
// Mock Factories - Memory Manager
// ============================================================================

/**
 * Create a mock memory
 */
export function createMockMemory(overrides: Partial<Memory> = {}): Memory {
  const now = Date.now();
  return {
    id: 1,
    type: "observation",
    title: "Test Memory",
    content: "Test memory content",
    facts: [],
    concepts: [],
    sourceFiles: [],
    importance: 0.5,
    visibility: "public",
    createdAt: now,
    updatedAt: now,
    accessedAt: now,
    accessCount: 0,
    ...overrides,
  };
}

/**
 * Create a mock MemoryManager
 */
export function createMockMemoryManager(initialMemories: Memory[] = []): MemoryManager {
  const memories = new Map<number, Memory>();
  let nextId = 1;
  
  initialMemories.forEach(m => {
    memories.set(m.id, m);
    if (m.id >= nextId) nextId = m.id + 1;
  });
  
  return {
    save: async (input: MemoryInput): Promise<Memory> => {
      const now = Date.now();
      const memory: Memory = {
        id: nextId++,
        type: input.type,
        title: input.title,
        content: input.content,
        facts: input.facts || [],
        concepts: input.concepts || [],
        sourceFiles: input.sourceFiles || [],
        importance: input.importance ?? 0.5,
        visibility: input.visibility || "public",
        phase: input.phase,
        sessionId: input.sessionId,
        createdAt: now,
        updatedAt: now,
        accessedAt: now,
        accessCount: 0,
      };
      memories.set(memory.id, memory);
      return memory;
    },
    
    search: async (options: SearchOptions): Promise<SearchResult[]> => {
      const results: SearchResult[] = [];
      const query = options.query.toLowerCase();
      
      for (const memory of memories.values()) {
        if (options.types && !options.types.includes(memory.type)) continue;
        if (options.minImportance && memory.importance < options.minImportance) continue;
        if (!options.includePrivate && memory.visibility === "private") continue;
        
        const matchTitle = memory.title.toLowerCase().includes(query);
        const matchContent = memory.content.toLowerCase().includes(query);
        
        if (matchTitle || matchContent) {
          results.push({
            memory,
            score: matchTitle ? 1.0 : 0.8,
            matchType: "fts",
          });
        }
      }
      
      return results.slice(0, options.limit || 10);
    },
    
    getById: async (id: number): Promise<Memory | null> => {
      return memories.get(id) || null;
    },
    
    getRecent: async (limit: number, types?: MemoryType[]): Promise<Memory[]> => {
      let result = Array.from(memories.values());
      if (types) {
        result = result.filter(m => types.includes(m.type));
      }
      return result
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, limit);
    },
    
    update: async (id: number, updates: MemoryUpdate): Promise<Memory | null> => {
      const memory = memories.get(id);
      if (!memory) return null;
      
      const updated = {
        ...memory,
        ...updates,
        updatedAt: Date.now(),
      };
      memories.set(id, updated);
      return updated;
    },
    
    delete: async (id: number): Promise<boolean> => {
      return memories.delete(id);
    },
  };
}

// ============================================================================
// Mock Factories - Plugin Context
// ============================================================================

/**
 * Default GoopSpecConfig for testing
 */
export const DEFAULT_TEST_CONFIG: GoopSpecConfig = {
  enforcement: "assist",
  constitution: true,
  adlEnabled: true,
  defaultModel: "anthropic/claude-sonnet-4-6",
};

export interface MockPluginContextOptions {
  testDir?: string;
  config?: Partial<GoopSpecConfig>;
  state?: Partial<GoopState>;
  resources?: ResolvedResource[];
  memories?: Memory[];
  includeMemory?: boolean;
  sessionId?: string;
}

/**
 * Create a mock PluginContext
 * @param overrides - Optional overrides for specific parts of the context
 */
export function createMockPluginContext(overrides: MockPluginContextOptions = {}): PluginContext {
  const testDir = overrides.testDir || createTestDir();
  
  const input: MinimalPluginInput = {
    client: {},
    project: { name: "test-project" },
    directory: testDir,
    worktree: testDir,
    serverUrl: new URL("http://localhost:3000"),
  };
  
  const config: GoopSpecConfig = {
    ...DEFAULT_TEST_CONFIG,
    ...overrides.config,
  };
  
  const ctx: PluginContext = {
    input,
    config,
    resolver: createMockResourceResolver(overrides.resources || []),
    stateManager: createMockStateManager(overrides.state || {}),
    sessionId: overrides.sessionId,
  };
  
  if (overrides.includeMemory) {
    ctx.memoryManager = createMockMemoryManager(overrides.memories || []);
  }
  
  return ctx;
}

export function createMockSessionContext(options: MockPluginContextOptions = {}): PluginContext {
  const sessionId = options.sessionId || "test-session";
  return createMockPluginContext({
    ...options,
    sessionId,
  });
}

// ============================================================================
// Test Fixtures - Agents
// ============================================================================

export const TEST_AGENT_RESOURCE: ResolvedResource = {
  name: "goop-planner",
  path: "/test/agents/goop-planner.md",
  type: "agent",
  frontmatter: {
    name: "goop-planner",
    description: "Creates detailed execution plans",
    model: "anthropic/claude-sonnet-4-6",
    temperature: 0.3,
    tools: ["read", "write", "glob"],
    skills: ["planning", "decomposition"],
    references: ["deviation-rules"],
  },
  body: "You are the Planner agent. Create detailed plans.",
  content: "---\nname: goop-planner\n---\nYou are the Planner agent.",
};

export const TEST_ORCHESTRATOR_RESOURCE: ResolvedResource = {
  name: "goop-orchestrator",
  path: "/test/agents/goop-orchestrator.md",
  type: "agent",
  frontmatter: {
    name: "goop-orchestrator",
    description: "Coordinates GoopSpec workflows",
    model: "anthropic/claude-opus-4-6",
    temperature: 0.7,
    tools: ["read", "write", "glob", "task"],
    skills: ["goop-core"],
    references: ["deviation-rules", "constitution"],
  },
  body: "You are the Orchestrator. Coordinate all work.",
  content: "---\nname: goop-orchestrator\n---\nYou are the Orchestrator.",
};

// ============================================================================
// Test Fixtures - Commands
// ============================================================================

export const TEST_COMMAND_RESOURCE: ResolvedResource = {
  name: "goop-plan",
  path: "/test/commands/goop-plan.md",
  type: "command",
  frontmatter: {
    name: "goop-plan",
    description: "Start planning a new feature",
    "argument-hint": "[feature description]",
  },
  body: "Capture user intent and create a plan.",
  content: "---\nname: goop-plan\n---\nCapture user intent.",
};

// ============================================================================
// Test Fixtures - Skills
// ============================================================================

export const TEST_SKILL_RESOURCE: ResolvedResource = {
  name: "goop-core/skill",
  path: "/test/skills/goop-core/skill.md",
  type: "skill",
  frontmatter: {
    name: "goop-core",
    description: "Core GoopSpec workflow knowledge",
    category: "workflow",
    triggers: ["plan", "execute", "verify"],
  },
  body: "# GoopSpec Core\n\nThe 5-phase workflow...",
  content: "---\nname: goop-core\n---\n# GoopSpec Core",
};

// ============================================================================
// Multi-Workflow Test Fixtures
// ============================================================================

/**
 * Create a v1 (pre-multi-workflow) state JSON object for migration testing
 */
export function createMockV1State(overrides: {
  projectName?: string;
  phase?: WorkflowPhase;
  specLocked?: boolean;
} = {}): Record<string, unknown> {
  return {
    version: 1,
    project: {
      name: overrides.projectName ?? "legacy-project",
      initialized: new Date().toISOString(),
    },
    workflow: {
      currentPhase: null,
      phase: overrides.phase ?? "idle",
      mode: "standard",
      depth: "standard",
      researchOptIn: false,
      specLocked: overrides.specLocked ?? false,
      acceptanceConfirmed: false,
      interviewComplete: false,
      interviewCompletedAt: null,
      currentWave: 0,
      totalWaves: 0,
      lastActivity: new Date().toISOString(),
      status: overrides.phase ?? "idle",
    },
    execution: {
      activeCheckpointId: null,
      completedPhases: [],
      pendingTasks: [],
    },
  };
}

/**
 * Create a v2 (multi-workflow) state JSON object for testing
 */
export function createMockV2State(overrides: {
  projectName?: string;
  workflows?: Record<string, {
    phase?: WorkflowPhase;
    specLocked?: boolean;
    currentWave?: number;
    totalWaves?: number;
  }>;
  activeWorkflowId?: string;
} = {}): Record<string, unknown> {
  const workflowDefs = overrides.workflows ?? { default: {} };
  const now = new Date().toISOString();

  const workflows: Record<string, unknown> = {};
  for (const [id, def] of Object.entries(workflowDefs)) {
    workflows[id] = {
      workflowId: id,
      currentPhase: null,
      phase: def.phase ?? "idle",
      mode: "standard",
      depth: "standard",
      researchOptIn: false,
      specLocked: def.specLocked ?? false,
      acceptanceConfirmed: false,
      interviewComplete: false,
      interviewCompletedAt: null,
      currentWave: def.currentWave ?? 0,
      totalWaves: def.totalWaves ?? 0,
      lastActivity: now,
      status: def.phase ?? "idle",
    };
  }

  const activeId = overrides.activeWorkflowId ?? Object.keys(workflows)[0] ?? "default";
  const activeEntry = workflows[activeId] as Record<string, unknown>;

  return {
    version: 2,
    project: {
      name: overrides.projectName ?? "test-project",
      initialized: now,
    },
    workflow: { ...activeEntry },
    workflows,
    execution: {
      activeCheckpointId: null,
      completedPhases: [],
      pendingTasks: [],
    },
  };
}

/**
 * Set up a test environment with multiple workflows pre-created on disk.
 * Returns a temp dir with a valid .goopspec/state.json containing multiple workflows.
 */
export function setupMultiWorkflowEnvironment(
  workflowIds: string[],
  options: {
    prefix?: string;
    phases?: Record<string, WorkflowPhase>;
    specLocked?: Record<string, boolean>;
  } = {},
): {
  testDir: string;
  goopspecDir: string;
  cleanup: () => void;
} {
  const env = setupTestEnvironment(options.prefix ?? "goopspec-multi-wf");
  const { testDir, goopspecDir } = env;

  const workflowDefs: Record<string, { phase?: WorkflowPhase; specLocked?: boolean }> = {};
  for (const id of workflowIds) {
    workflowDefs[id] = {
      phase: options.phases?.[id],
      specLocked: options.specLocked?.[id],
    };
  }

  const state = createMockV2State({
    projectName: "multi-wf-project",
    workflows: workflowDefs,
  });

  // Write state to disk
  writeFileSync(
    join(goopspecDir, "state.json"),
    JSON.stringify(state, null, 2),
    "utf-8",
  );

  // Create per-workflow subdirs for non-default workflows
  for (const id of workflowIds) {
    if (id !== "default") {
      mkdirSync(join(goopspecDir, id), { recursive: true });
    }
  }

  return { testDir, goopspecDir, cleanup: env.cleanup };
}

// ============================================================================
// Test Fixtures - Phase Files
// ============================================================================

/**
 * Create test phase files in the test directory
 */
export function createTestPhaseFiles(testDir: string, phase: string = "phase-1"): void {
  const phaseDir = join(testDir, ".goopspec", "phases", phase);
  mkdirSync(phaseDir, { recursive: true });
  
  writeFileSync(join(phaseDir, "SPEC.md"), `---
phase: 1
title: Test Phase
status: active
---

# Phase 1 Specification

## Requirements
- Must do X
- Must do Y

## Success Criteria
- Criterion 1
- Criterion 2
`);

  writeFileSync(join(phaseDir, "PLAN.md"), `---
phase: 1
plan: 1.1
type: auto
---

# Phase 1 Plan

## Wave 1: Foundation

<task type="auto">
  <name>Task 1</name>
  <action>Create foundation</action>
</task>

## Wave 2: Implementation

<task type="auto">
  <name>Task 2</name>
  <action>Implement feature</action>
</task>
`);
}

// ============================================================================
// Test Assertions Helpers
// ============================================================================

/**
 * Assert that a value matches the Memory interface structure
 */
export function assertIsMemory(value: unknown): asserts value is Memory {
  if (typeof value !== "object" || value === null) {
    throw new Error("Expected Memory object");
  }
  const mem = value as Record<string, unknown>;
  if (typeof mem.id !== "number") throw new Error("Memory.id must be number");
  if (typeof mem.type !== "string") throw new Error("Memory.type must be string");
  if (typeof mem.title !== "string") throw new Error("Memory.title must be string");
  if (typeof mem.content !== "string") throw new Error("Memory.content must be string");
}

/**
 * Assert that a value matches the GoopState interface structure
 */
export function assertIsGoopState(value: unknown): asserts value is GoopState {
  if (typeof value !== "object" || value === null) {
    throw new Error("Expected GoopState object");
  }
  const state = value as Record<string, unknown>;
  if (typeof state.version !== "number") throw new Error("GoopState.version must be number");
  if (typeof state.project !== "object") throw new Error("GoopState.project must be object");
  if (typeof state.workflow !== "object") throw new Error("GoopState.workflow must be object");
  if (typeof state.execution !== "object") throw new Error("GoopState.execution must be object");
}

// ============================================================================
// Async Test Helpers
// ============================================================================

/**
 * Wait for a specified number of milliseconds
 */
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Wait for a condition to be true
 * @param condition - Function that returns true when condition is met
 * @param timeoutMs - Maximum time to wait
 * @param intervalMs - Polling interval
 */
export async function waitFor(
  condition: () => boolean | Promise<boolean>,
  timeoutMs: number = 5000,
  intervalMs: number = 100
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await condition()) return;
    await delay(intervalMs);
  }
  throw new Error(`Timeout waiting for condition after ${timeoutMs}ms`);
}

// ============================================================================
// Export all for convenience
// ============================================================================

export {
  type PluginContext,
  type GoopState,
  type GoopSpecConfig,
  type StateManager,
  type ResourceResolver,
  type ResolvedResource,
  type Memory,
  type MemoryManager,
  type ToolContext,
  type WorkflowPhase,
  type TaskMode,
};
