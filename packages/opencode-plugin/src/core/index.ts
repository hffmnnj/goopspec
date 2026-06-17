/**
 * Core module barrel — re-exports all types and constants.
 */

export {
  AGENT_ROLES,
  DEFAULT_MEMORY_TOKEN_BUDGET,
  EXECUTOR_TIERS,
  GOOPSPEC_DIR,
  MEMORY_TYPES,
  RESOURCE_TYPES,
  STATE_SCHEMA_VERSION,
  TASK_MODES,
  WORKFLOW_DEPTHS,
  WORKFLOW_PHASES,
} from "./constants.js";

export type {
  AgentRole,
  ExecutorTier,
  MemoryType,
  ResourceType,
  TaskMode,
  WorkflowDepth,
  WorkflowPhase,
} from "./constants.js";

export type {
  ADLEntry,
  CheckpointData,
  GoopState,
  MemoryEntry,
  MemoryManager,
  MemorySearchOptions,
  MemorySearchResult,
  MemorySaveInput,
  PluginContext,
  ResolvedResource,
  ResourceResolver,
  SdkEssentials,
  SessionInfo,
  StateManager,
  WorkflowState,
} from "./types.js";
