/**
 * State file migrations.
 *
 * Detects v1 (or unversioned) state.json files and upgrades them to the
 * v2 multi-workflow format. A `.backup` copy is written before any
 * destructive transformation.
 *
 * @module features/state-manager/migrations
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { STATE_SCHEMA_VERSION } from "../../core/constants.js";
import type { GoopState, WorkflowState } from "../../core/types.js";
import { createDefaultWorkflowState } from "./schema.js";

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

/**
 * Returns `true` when the parsed JSON looks like a v1 (or pre-v1) state file.
 *
 * v1 indicators:
 * - Missing `version` field entirely
 * - `version` < STATE_SCHEMA_VERSION
 * - Missing `workflows` map
 */
export function needsMigration(parsed: Record<string, unknown>): boolean {
  if (!("version" in parsed)) return true;
  if (typeof parsed.version !== "number") return true;
  if (parsed.version < STATE_SCHEMA_VERSION) return true;
  if (!("workflows" in parsed) || typeof parsed.workflows !== "object") return true;
  return false;
}

// ---------------------------------------------------------------------------
// v1 -> v2 migration
// ---------------------------------------------------------------------------

/**
 * Migrate a v1 state object into the v2 multi-workflow format.
 *
 * Strategy:
 * 1. Extract whatever workflow-level fields exist at the root.
 * 2. Wrap them into a single "default" workflow entry.
 * 3. Set `version` to STATE_SCHEMA_VERSION.
 */
export function migrateToV2(raw: Record<string, unknown>): GoopState {
  const workflow = extractWorkflowFromV1(raw);

  return {
    version: STATE_SCHEMA_VERSION,
    activeWorkflowId: "default",
    workflows: {
      default: workflow,
    },
  };
}

/**
 * Write a `.backup` copy of the state file before migration.
 * No-ops if the backup already exists or the source doesn't exist.
 */
export function writeBackup(statePath: string): void {
  if (!existsSync(statePath)) return;

  const backupPath = `${statePath}.backup`;
  if (existsSync(backupPath)) return;

  const content = readFileSync(statePath, "utf-8");
  writeFileSync(backupPath, content, "utf-8");
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function extractWorkflowFromV1(raw: Record<string, unknown>): WorkflowState {
  // v1 may have a top-level `workflow` object with the fields we need
  const wf = (
    typeof raw.workflow === "object" && raw.workflow !== null ? raw.workflow : raw
  ) as Record<string, unknown>;

  return createDefaultWorkflowState({
    phase: asPhase(wf.phase),
    mode: asMode(wf.mode),
    depth: asDepth(wf.depth),
    interviewComplete: asBool(wf.interviewComplete) || asBool(raw.interview_complete),
    specLocked: asBool(wf.specLocked),
    acceptanceConfirmed: asBool(wf.acceptanceConfirmed),
    currentWave: asNum(wf.currentWave),
    totalWaves: asNum(wf.totalWaves),
    autopilot: asBool(wf.autopilot),
    lazyAutopilot: asBool(wf.lazyAutopilot),
    checkpoint: typeof wf.checkpoint === "string" ? wf.checkpoint : undefined,
  });
}

function asBool(v: unknown): boolean {
  return v === true;
}

function asNum(v: unknown): number {
  return typeof v === "number" ? v : 0;
}

type Phase = WorkflowState["phase"];
type Mode = WorkflowState["mode"];
type Depth = WorkflowState["depth"];

const PHASES = new Set(["idle", "discuss", "plan", "execute", "accept"]);
const MODES = new Set(["quick", "standard", "comprehensive", "milestone"]);
const DEPTHS = new Set(["shallow", "standard", "deep"]);

function asPhase(v: unknown): Phase {
  return typeof v === "string" && PHASES.has(v) ? (v as Phase) : "idle";
}

function asMode(v: unknown): Mode {
  return typeof v === "string" && MODES.has(v) ? (v as Mode) : "standard";
}

function asDepth(v: unknown): Depth {
  return typeof v === "string" && DEPTHS.has(v) ? (v as Depth) : "standard";
}
