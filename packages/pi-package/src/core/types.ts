/**
 * Core type definitions for @goopspec/pi-package.
 *
 * Pi-specific types for the GoopSpec five-phase workflow extension.
 * Mirrors the opencode-plugin type structure but adapted for Pi's
 * TypeBox/in-process TypeScript extension API.
 */

import type { DocType, TaskMode, WorkflowPhase } from "./constants.js";

// Re-export derived union types for convenience.
export type { DocType, TaskMode, WorkflowPhase };

// ---------------------------------------------------------------------------
// Runtime detection
// ---------------------------------------------------------------------------

/** Which Pi-compatible runtime is hosting the extension. */
export type PiRuntime = "pi" | "omp";

// ---------------------------------------------------------------------------
// Workflow state
// ---------------------------------------------------------------------------

/** Per-workflow state persisted in the GoopSpec DB. */
export type WorkflowState = {
  workflowId: string;
  phase: WorkflowPhase;
  mode: TaskMode;
  specLocked: boolean;
  interviewComplete: boolean;
  acceptanceConfirmed: boolean;
  currentWave: number;
  totalWaves: number;
  autopilot: boolean;
  lazyAutopilot: boolean;
  createdAt: string;
  updatedAt: string;
};

// ---------------------------------------------------------------------------
// Field Notes
// ---------------------------------------------------------------------------

/** A Field Note persisted in the global knowledge base. */
export type FieldNote = {
  id: string;
  title: string;
  body: string;
  tags: string[];
  sourceAgent: string;
  importance: number;
  projectId: string | null;
  workflowId: string | null;
  createdAt: string;
};

// ---------------------------------------------------------------------------
// Workflow documents
// ---------------------------------------------------------------------------

/** A workflow document (spec, blueprint, chronicle, etc.) stored in the DB. */
export type WorkflowDocument = {
  id: string;
  workflowId: string;
  docType: DocType;
  content: string;
  createdAt: string;
  updatedAt: string;
};

// ---------------------------------------------------------------------------
// Pi Extension API types
// ---------------------------------------------------------------------------

/** The API surface Pi passes to extension factories. */
export type PiExtensionAPI = {
  registerTool: (tool: PiTool) => void;
  registerCommand: (name: string, def: PiCommand) => void;
  on: (event: string, handler: (ctx: PiEventContext) => Promise<unknown>) => void;
  events: PiEventBus;
};

/** A tool registered with Pi via `pi.registerTool()`. */
export type PiTool = {
  name: string;
  description: string;
  parameters: unknown; // TypeBox schema
  execute: (
    toolCallId: string,
    params: unknown,
    signal: AbortSignal,
    onUpdate: (text: string) => void,
    ctx: PiEventContext,
  ) => Promise<string>;
};

/** A slash command registered with Pi via `pi.registerCommand()`. */
export type PiCommand = {
  description: string;
  handler: (args: string[], ctx: PiEventContext) => Promise<void>;
};

/** Context passed to tool execute functions and event handlers by Pi. */
export type PiEventContext = {
  projectDir: string;
  systemPromptAddition?: string;
  [key: string]: unknown;
};

/** Pi's event bus for emitting and subscribing to lifecycle events. */
export type PiEventBus = {
  emit: (event: string, data: unknown) => void;
  on: (event: string, handler: (data: unknown) => void) => void;
};

// ---------------------------------------------------------------------------
// GoopSpec Pi context
// ---------------------------------------------------------------------------

/**
 * Internal context threaded through all GoopSpec tool factories.
 * Created once during extension initialization.
 */
export type GoopPiContext = {
  projectDir: string;
  runtime: PiRuntime;
  dbPath: string; // .goopspec/goopspec.db
  goopspecDir: string; // .goopspec/
};
