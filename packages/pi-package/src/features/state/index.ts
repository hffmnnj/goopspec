/**
 * StateManager — typed workflow state reads/writes backed by GoopSpecDB.
 *
 * Wraps the GoopSpecDB `workflows` table to provide typed access to
 * workflow state, phase transitions, and active workflow tracking.
 */

import type { WorkflowPhase, WorkflowState } from "../../core/types.js";
import { logError } from "../../shared/logger.js";
import { getDbPath } from "../../shared/paths.js";
import { GoopSpecDB } from "../db/index.js";

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_STATE: Omit<WorkflowState, "workflowId"> = {
	phase: "discuss",
	mode: "standard",
	specLocked: false,
	interviewComplete: false,
	acceptanceConfirmed: false,
	currentWave: 0,
	totalWaves: 0,
	autopilot: false,
	lazyAutopilot: false,
	createdAt: "",
	updatedAt: "",
};

const ACTIVE_WORKFLOW_KEY = "active_workflow";
const META_WORKFLOW_ID = "__meta__";

// ---------------------------------------------------------------------------
// StateManager
// ---------------------------------------------------------------------------

export class StateManager {
	private readonly db: GoopSpecDB;

	constructor(projectDir: string) {
		const dbPath = getDbPath(projectDir);
		this.db = new GoopSpecDB(dbPath);
	}

	close(): void {
		this.db.close();
	}

	// -------------------------------------------------------------------------
	// Active workflow
	// -------------------------------------------------------------------------

	getActiveWorkflowId(): string {
		try {
			const row = this.db.getWorkflow(META_WORKFLOW_ID);
			if (!row) return "default";
			const meta = JSON.parse(row.state) as Record<string, string>;
			return meta[ACTIVE_WORKFLOW_KEY] ?? "default";
		} catch (error) {
			logError("getActiveWorkflowId failed", error);
			return "default";
		}
	}

	setActiveWorkflowId(workflowId: string): void {
		try {
			const row = this.db.getWorkflow(META_WORKFLOW_ID);
			const meta = row ? (JSON.parse(row.state) as Record<string, string>) : {};
			meta[ACTIVE_WORKFLOW_KEY] = workflowId;
			this.db.upsertWorkflow(META_WORKFLOW_ID, meta);
		} catch (error) {
			logError("setActiveWorkflowId failed", error);
		}
	}

	// -------------------------------------------------------------------------
	// Workflow state
	// -------------------------------------------------------------------------

	getState(workflowId?: string): WorkflowState {
		const id = workflowId ?? this.getActiveWorkflowId();
		try {
			const row = this.db.getWorkflow(id);
			if (!row) {
				return { ...DEFAULT_STATE, workflowId: id };
			}
			const stored = JSON.parse(row.state) as Partial<WorkflowState>;
			return { ...DEFAULT_STATE, ...stored, workflowId: id };
		} catch (error) {
			logError("getState failed", error);
			return { ...DEFAULT_STATE, workflowId: id };
		}
	}

	setState(workflowId: string, state: Partial<WorkflowState>): void {
		try {
			const current = this.getState(workflowId);
			const now = new Date().toISOString();
			const updated = { ...current, ...state, workflowId, updatedAt: now };
			this.db.upsertWorkflow(workflowId, updated);
		} catch (error) {
			logError("setState failed", error);
		}
	}

	createWorkflow(workflowId: string): WorkflowState {
		const now = new Date().toISOString();
		const state: WorkflowState = {
			...DEFAULT_STATE,
			workflowId,
			createdAt: now,
			updatedAt: now,
		};
		this.db.upsertWorkflow(workflowId, state);
		return state;
	}

	listWorkflows(): string[] {
		return this.db
			.getAllWorkflows()
			.map((row) => row.id)
			.filter((id) => id !== META_WORKFLOW_ID);
	}

	// -------------------------------------------------------------------------
	// Phase transitions
	// -------------------------------------------------------------------------

	readonly VALID_TRANSITIONS: Record<WorkflowPhase, WorkflowPhase[]> = {
		discuss: ["plan"],
		plan: ["execute", "discuss"],
		execute: ["accept", "plan"],
		accept: ["confirm", "execute"],
		confirm: ["discuss"],
	};

	transitionPhase(
		workflowId: string,
		toPhase: WorkflowPhase,
	): { ok: boolean; error?: string } {
		const state = this.getState(workflowId);
		const allowed = this.VALID_TRANSITIONS[state.phase];
		if (!allowed.includes(toPhase)) {
			return {
				ok: false,
				error: `Cannot transition from '${state.phase}' to '${toPhase}'. Allowed: ${allowed.join(", ")}`,
			};
		}
		this.setState(workflowId, { phase: toPhase });
		return { ok: true };
	}

	// -------------------------------------------------------------------------
	// Convenience mutators
	// -------------------------------------------------------------------------

	lockSpec(workflowId: string): void {
		this.setState(workflowId, { specLocked: true });
	}

	unlockSpec(workflowId: string): void {
		this.setState(workflowId, { specLocked: false });
	}

	completeInterview(workflowId: string): void {
		this.setState(workflowId, { interviewComplete: true });
	}

	confirmAcceptance(workflowId: string): void {
		this.setState(workflowId, { acceptanceConfirmed: true });
	}

	updateWave(
		workflowId: string,
		currentWave: number,
		totalWaves: number,
	): void {
		this.setState(workflowId, { currentWave, totalWaves });
	}

	setAutopilot(workflowId: string, autopilot: boolean, lazy: boolean): void {
		this.setState(workflowId, { autopilot, lazyAutopilot: lazy });
	}
}
