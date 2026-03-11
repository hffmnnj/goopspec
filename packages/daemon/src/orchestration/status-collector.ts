import { existsSync, readFileSync, watch, type FSWatcher } from "fs";
import { join } from "path";
import { EventEmitter } from "events";
import type { WorkflowPhase } from "@goopspec/core";

export interface CollectorOptions {
  projectPath: string;
  workflowId: string;
  /** Polling interval in milliseconds. Used as fallback when file watching is unavailable. */
  pollInterval?: number;
}

const DEFAULT_POLL_INTERVAL = 5000;

export interface WorkflowStateSnapshot {
  phase: WorkflowPhase;
  currentWave: number;
  totalWaves: number;
  specLocked: boolean;
  interviewComplete: boolean;
  activeAgent?: string;
}

/**
 * Monitors a project's `.goopspec/state.json` for phase and wave changes,
 * emitting events that the lifecycle manager can consume.
 *
 * Prefers native file watching for efficiency, falling back to interval-based
 * polling when the watcher cannot be established (e.g. network filesystems).
 */
export class StatusCollector extends EventEmitter {
  private timer: ReturnType<typeof setInterval> | null = null;
  private watcher: FSWatcher | null = null;
  private lastSnapshot: WorkflowStateSnapshot | null = null;
  private running = false;

  constructor(private options: CollectorOptions) {
    super();
  }

  start(): void {
    if (this.running) return;
    this.running = true;

    const statePath = this.statePath();

    // Try native file watching first — more efficient than polling
    try {
      this.watcher = watch(statePath, { persistent: false }, () => {
        this.checkState();
      });

      // Watcher may emit 'error' if the file disappears after watch starts
      this.watcher.on("error", () => {
        // Silently degrade — the file may not exist yet
      });
    } catch {
      // File doesn't exist or watching not supported — fall back to polling
    }

    // Always set up polling as a safety net. File watchers can miss events
    // on some platforms (e.g. rename-based atomic writes).
    const interval = this.options.pollInterval ?? DEFAULT_POLL_INTERVAL;
    this.timer = setInterval(() => this.checkState(), interval);

    // Initial read
    this.checkState();
  }

  stop(): void {
    this.running = false;

    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
  }

  getLastSnapshot(): WorkflowStateSnapshot | null {
    return this.lastSnapshot;
  }

  /** Exposed for testing — allows triggering a state check on demand. */
  checkState(): void {
    try {
      const path = this.statePath();

      if (!existsSync(path)) {
        return;
      }

      const raw = readFileSync(path, "utf-8");
      const state = JSON.parse(raw) as Record<string, unknown>;

      const entry = this.extractWorkflowEntry(state);
      if (!entry) return;

      const snapshot: WorkflowStateSnapshot = {
        phase: (entry.phase as WorkflowPhase) ?? "idle",
        currentWave: (entry.currentWave as number) ?? 0,
        totalWaves: (entry.totalWaves as number) ?? 0,
        specLocked: (entry.specLocked as boolean) ?? false,
        interviewComplete: (entry.interviewComplete as boolean) ?? false,
        activeAgent: (entry.activeAgent as string) ?? undefined,
      };

      if (this.hasChanged(snapshot)) {
        const previous = this.lastSnapshot;
        this.lastSnapshot = snapshot;
        this.emit("status:changed", snapshot, previous);

        if (snapshot.phase === "accept" || snapshot.phase === "complete") {
          this.emit("status:complete", snapshot);
        }
      }
    } catch {
      // Corrupt or partially-written state.json — ignore, don't crash
    }
  }

  private statePath(): string {
    return join(this.options.projectPath, ".goopspec", "state.json");
  }

  private extractWorkflowEntry(
    state: Record<string, unknown>,
  ): Record<string, unknown> | null {
    // v2 schema: { version: 2, workflows: { [workflowId]: { ... } } }
    if (state.version === 2 && state.workflows) {
      const workflows = state.workflows as Record<string, Record<string, unknown>>;
      return workflows[this.options.workflowId] ?? workflows["default"] ?? null;
    }

    // v1 schema (backward compat): flat object with phase at top level
    if (typeof state.phase === "string") {
      return state;
    }

    return null;
  }

  private hasChanged(snapshot: WorkflowStateSnapshot): boolean {
    if (!this.lastSnapshot) return true;

    return (
      snapshot.phase !== this.lastSnapshot.phase ||
      snapshot.currentWave !== this.lastSnapshot.currentWave ||
      snapshot.totalWaves !== this.lastSnapshot.totalWaves ||
      snapshot.specLocked !== this.lastSnapshot.specLocked
    );
  }
}
