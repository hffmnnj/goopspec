/**
 * Core type definitions for GoopSpec 1.0.0 plugin.
 *
 * Design principles:
 * - No `any` — use `unknown` with narrowing where needed.
 * - Derive union types from `as const` arrays in constants.ts.
 * - Manager interfaces are abstract; concrete implementations land in Wave 3.
 * - Aligned with the verified @opencode-ai/plugin SDK (v1.1.x).
 */

import type { PluginInput } from "@opencode-ai/plugin";
import type { GoopSpecDB } from "../features/db/index.js";
import type { SessionManager } from "../features/session/index.js";
import type {
  AgentRole,
  ExecutorTier,
  MemoryType,
  ResourceType,
  TaskMode,
  WorkflowDepth,
  WorkflowPhase,
} from "./constants.js";

// Re-export the derived union types so consumers can import from either file.
export type {
  AgentRole,
  ExecutorTier,
  MemoryType,
  ResourceType,
  TaskMode,
  WorkflowDepth,
  WorkflowPhase,
};

// ---------------------------------------------------------------------------
// SDK-aligned essentials
// ---------------------------------------------------------------------------

/**
 * Minimal subset of the SDK's PluginInput that GoopSpec tools/hooks need.
 * Avoids coupling the entire SDK surface into every consumer.
 */
export interface SdkEssentials {
  client: PluginInput["client"];
  directory: string;
  worktree: string;
  $: PluginInput["$"];
}

// ---------------------------------------------------------------------------
// Plugin context (GoopSpec-internal)
// ---------------------------------------------------------------------------

/**
 * Central context object threaded through every GoopSpec tool and hook.
 *
 * Created once during plugin initialisation; individual fields are populated
 * as subsystems come online (state → memory → resolver → session).
 */
export interface PluginContext {
  readonly sdk: SdkEssentials;
  readonly db: GoopSpecDB;
  readonly stateManager: StateManager;
  readonly memory: MemoryManager;
  readonly resolver: ResourceResolver;
  readonly session: SessionInfo;
  readonly sessionManager: SessionManager;
}

// ---------------------------------------------------------------------------
// State types (v2 multi-workflow)
// ---------------------------------------------------------------------------

/**
 * Top-level persisted state shape (`state.json`).
 *
 * Version 2 introduced the `workflows` map for concurrent workflow support.
 */
export interface GoopState {
  version: number;
  activeWorkflowId: string;
  workflows: Record<string, WorkflowState>;
}

/**
 * Per-workflow state. Each workflow tracks its own phase, progress, and flags.
 */
export interface WorkflowState {
  phase: WorkflowPhase;
  mode: TaskMode;
  depth: WorkflowDepth;
  interviewComplete: boolean;
  specLocked: boolean;
  acceptanceConfirmed: boolean;
  currentWave: number;
  totalWaves: number;
  autopilot: boolean;
  lazyAutopilot: boolean;
  gitignoreGoopspec?: boolean;
  checkpoint?: string;
}

// ---------------------------------------------------------------------------
// State manager interface
// ---------------------------------------------------------------------------

export interface StateManager {
  getState(): GoopState;
  setState(state: GoopState): void;

  // Workflow CRUD
  getWorkflow(id: string): WorkflowState | undefined;
  getActiveWorkflow(): WorkflowState;
  getActiveWorkflowId(): string;
  setActiveWorkflow(id: string): void;
  createWorkflow(id: string): WorkflowState;
  removeWorkflow(id: string): void;
  listWorkflowIds(): string[];

  // Workflow mutations (operate on the active workflow)
  updateWorkflow(updates: Partial<WorkflowState>): void;
  transitionPhase(to: WorkflowPhase, force?: boolean): void;
  lockSpec(): void;
  unlockSpec(): void;
  confirmAcceptance(): void;
  resetAcceptance(): void;
  completeInterview(): void;
  resetInterview(): void;
  setMode(mode: TaskMode): void;
  setDepth(depth: WorkflowDepth): void;
  updateWaveProgress(current: number, total: number): void;
  resetWorkflow(): void;

  // ADL (Automated Decision Log)
  getADL(): string;
  appendADL(entry: ADLEntry): void;

  // Checkpoints
  saveCheckpoint(id: string, data: CheckpointData): void;
  loadCheckpoint(id: string): CheckpointData | null;
  listCheckpoints(): string[];
}

// ---------------------------------------------------------------------------
// ADL & checkpoint types
// ---------------------------------------------------------------------------

export interface ADLEntry {
  timestamp: string;
  rule?: number;
  type: "decision" | "deviation" | "observation";
  description: string;
  action: string;
  files?: string[];
}

export interface CheckpointData {
  id: string;
  timestamp: string;
  state: GoopState;
  context?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Memory types
// ---------------------------------------------------------------------------

export interface MemoryEntry {
  id: number;
  type: MemoryType;
  title: string;
  content: string;
  facts?: string[];
  concepts?: string[];
  importance: number;
  sourceFiles?: string[];
  createdAt: number;
}

export interface MemorySearchOptions {
  query: string;
  limit?: number;
  types?: MemoryType[];
  concepts?: string[];
  minImportance?: number;
  /** Include matching curated Field Notes in the tool-level result. */
  includeFieldNotes?: boolean;
}

export interface MemorySearchResult {
  memory: MemoryEntry;
  score: number;
  matchType: "fts" | "vector" | "hybrid";
}

/** A Field Note returned by the cross-store memory search bridge. */
export interface FieldNoteSearchResult {
  id: string;
  title: string;
  body: string;
  tags: string;
  source_agent: string;
  importance: number;
  workflow_id: string | null;
  project_id: string | null;
  created_at: number;
}

/** A memory result in a cross-store result set, ranked with RRF. */
export interface CrossStoreMemorySearchResult {
  origin: "memory";
  entry: MemoryEntry;
  score: number;
}

/** A Field Note result in a cross-store result set, ranked with RRF. */
export interface CrossStoreFieldNoteSearchResult {
  origin: "field_note";
  entry: FieldNoteSearchResult;
  score: number;
}

/** A cross-store result, tagged by its source store and ranked with RRF. */
export type CrossStoreSearchResult = CrossStoreMemorySearchResult | CrossStoreFieldNoteSearchResult;

export interface MemorySaveInput {
  type: MemoryType;
  title: string;
  content: string;
  facts?: string[];
  concepts?: string[];
  sourceFiles?: string[];
  importance?: number;
  reasoning?: string;
  alternatives?: string[];
  /** Opt in to FTS-backed near-duplicate consolidation before inserting. */
  deduplicate?: boolean;
}

// ---------------------------------------------------------------------------
// Memory manager interface
// ---------------------------------------------------------------------------

export interface MemoryManager {
  save(input: MemorySaveInput): Promise<MemoryEntry>;
  search(options: MemorySearchOptions): Promise<MemorySearchResult[]>;
  getById(id: number): Promise<MemoryEntry | null>;
  forget(id: number): Promise<boolean>;
  forgetByQuery(query: string): Promise<number>;
}

// ---------------------------------------------------------------------------
// Resource types
// ---------------------------------------------------------------------------

export interface ResolvedResource {
  name: string;
  type: ResourceType;
  content: string;
}

// ---------------------------------------------------------------------------
// Resource resolver interface
// ---------------------------------------------------------------------------

export interface ResourceResolver {
  resolve(type: ResourceType, name: string): ResolvedResource | null;
  resolveMany(names: string[]): ResolvedResource[];
  resolveAll(type: ResourceType): ResolvedResource[];
  listNames(type: ResourceType): string[];
}

// ---------------------------------------------------------------------------
// Agent model preferences (MH16)
// ---------------------------------------------------------------------------

/**
 * Per-role model preference. Describes which model an agent role prefers
 * and an optional fallback when the preferred model is unavailable.
 */
export interface AgentModelPreference {
  /** The preferred model identifier (e.g. "anthropic/claude-opus-4-6"). */
  readonly preferred: string;
  /** Optional fallback model when the preferred is unavailable. */
  readonly fallback?: string;
}

/**
 * Minimal agent definition carrying identity and model preference.
 *
 * Used by the routing subsystem to resolve the correct model for dispatch.
 * Full agent prompt definitions live in the `agents/` directory; this type
 * captures only the fields relevant to routing and model selection.
 */
export interface AgentDefinition {
  readonly role: AgentRole;
  readonly model?: string;
  readonly tier?: ExecutorTier;
}

// ---------------------------------------------------------------------------
// Session info
// ---------------------------------------------------------------------------

export interface SessionInfo {
  id: string;
  agent?: string;
  workflowId?: string;
  startedAt: string;
}
