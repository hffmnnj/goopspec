import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { StatusCollector, type WorkflowStateSnapshot } from "./status-collector.js";

function makeTempProject(): string {
  const dir = join(tmpdir(), `status-collector-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(join(dir, ".goopspec"), { recursive: true });
  return dir;
}

function writeState(projectPath: string, state: Record<string, unknown>): void {
  writeFileSync(join(projectPath, ".goopspec", "state.json"), JSON.stringify(state));
}

function makeV2State(
  workflowId: string,
  entry: Record<string, unknown>,
): Record<string, unknown> {
  return {
    version: 2,
    workflows: {
      [workflowId]: entry,
    },
  };
}

describe("status collector", () => {
  let projectPath: string;
  let collector: StatusCollector;

  beforeEach(() => {
    projectPath = makeTempProject();
  });

  afterEach(() => {
    collector?.stop();
    try {
      rmSync(projectPath, { recursive: true, force: true });
    } catch {
      // cleanup best-effort
    }
  });

  it("reads initial state on start and emits status:changed", async () => {
    writeState(
      projectPath,
      makeV2State("default", {
        phase: "execute",
        currentWave: 2,
        totalWaves: 5,
        specLocked: true,
        interviewComplete: true,
      }),
    );

    collector = new StatusCollector({
      projectPath,
      workflowId: "default",
      pollInterval: 50,
    });

    const changed = new Promise<WorkflowStateSnapshot>((resolve) => {
      collector.once("status:changed", (snapshot: WorkflowStateSnapshot) => resolve(snapshot));
    });

    collector.start();

    const snapshot = await changed;

    expect(snapshot.phase).toBe("execute");
    expect(snapshot.currentWave).toBe(2);
    expect(snapshot.totalWaves).toBe(5);
    expect(snapshot.specLocked).toBe(true);
    expect(snapshot.interviewComplete).toBe(true);
  });

  it("detects phase change and emits status:changed", async () => {
    writeState(
      projectPath,
      makeV2State("default", {
        phase: "plan",
        currentWave: 0,
        totalWaves: 0,
        specLocked: false,
      }),
    );

    collector = new StatusCollector({
      projectPath,
      workflowId: "default",
      pollInterval: 30,
    });

    collector.start();

    // Wait for initial read to settle
    await new Promise((r) => setTimeout(r, 50));

    expect(collector.getLastSnapshot()?.phase).toBe("plan");

    // Update phase
    const changed = new Promise<WorkflowStateSnapshot>((resolve) => {
      collector.once("status:changed", (snapshot: WorkflowStateSnapshot) => resolve(snapshot));
    });

    writeState(
      projectPath,
      makeV2State("default", {
        phase: "execute",
        currentWave: 1,
        totalWaves: 3,
        specLocked: true,
      }),
    );

    // Trigger a manual check since polling interval may not fire immediately
    collector.checkState();

    const snapshot = await changed;

    expect(snapshot.phase).toBe("execute");
    expect(snapshot.currentWave).toBe(1);
    expect(snapshot.totalWaves).toBe(3);
    expect(snapshot.specLocked).toBe(true);
  });

  it("detects wave progress and emits status:changed", async () => {
    writeState(
      projectPath,
      makeV2State("default", {
        phase: "execute",
        currentWave: 1,
        totalWaves: 5,
        specLocked: true,
      }),
    );

    collector = new StatusCollector({
      projectPath,
      workflowId: "default",
      pollInterval: 30,
    });

    collector.start();
    await new Promise((r) => setTimeout(r, 50));

    const changed = new Promise<WorkflowStateSnapshot>((resolve) => {
      collector.once("status:changed", (snapshot: WorkflowStateSnapshot) => resolve(snapshot));
    });

    writeState(
      projectPath,
      makeV2State("default", {
        phase: "execute",
        currentWave: 3,
        totalWaves: 5,
        specLocked: true,
      }),
    );

    collector.checkState();

    const snapshot = await changed;

    expect(snapshot.currentWave).toBe(3);
    expect(snapshot.phase).toBe("execute");
  });

  it("emits status:complete when phase reaches accept", async () => {
    writeState(
      projectPath,
      makeV2State("default", {
        phase: "execute",
        currentWave: 3,
        totalWaves: 3,
        specLocked: true,
      }),
    );

    collector = new StatusCollector({
      projectPath,
      workflowId: "default",
      pollInterval: 30,
    });

    collector.start();
    await new Promise((r) => setTimeout(r, 50));

    const complete = new Promise<WorkflowStateSnapshot>((resolve) => {
      collector.once("status:complete", (snapshot: WorkflowStateSnapshot) => resolve(snapshot));
    });

    writeState(
      projectPath,
      makeV2State("default", {
        phase: "accept",
        currentWave: 3,
        totalWaves: 3,
        specLocked: true,
      }),
    );

    collector.checkState();

    const snapshot = await complete;

    expect(snapshot.phase).toBe("accept");
  });

  it("emits status:complete when phase reaches complete", async () => {
    writeState(
      projectPath,
      makeV2State("default", {
        phase: "accept",
        currentWave: 3,
        totalWaves: 3,
        specLocked: true,
      }),
    );

    collector = new StatusCollector({
      projectPath,
      workflowId: "default",
      pollInterval: 30,
    });

    collector.start();
    await new Promise((r) => setTimeout(r, 50));

    const complete = new Promise<WorkflowStateSnapshot>((resolve) => {
      collector.once("status:complete", (snapshot: WorkflowStateSnapshot) => resolve(snapshot));
    });

    writeState(
      projectPath,
      makeV2State("default", {
        phase: "complete",
        currentWave: 3,
        totalWaves: 3,
        specLocked: true,
      }),
    );

    collector.checkState();

    const snapshot = await complete;

    expect(snapshot.phase).toBe("complete");
  });

  it("handles missing state.json without error or event", () => {
    // Don't write any state.json
    collector = new StatusCollector({
      projectPath,
      workflowId: "default",
      pollInterval: 50,
    });

    let eventFired = false;
    collector.on("status:changed", () => {
      eventFired = true;
    });

    collector.start();
    collector.checkState();

    expect(eventFired).toBe(false);
    expect(collector.getLastSnapshot()).toBeNull();
  });

  it("handles corrupt state.json without error or event", () => {
    writeFileSync(join(projectPath, ".goopspec", "state.json"), "{{not valid json!!");

    collector = new StatusCollector({
      projectPath,
      workflowId: "default",
      pollInterval: 50,
    });

    let eventFired = false;
    collector.on("status:changed", () => {
      eventFired = true;
    });

    collector.start();
    collector.checkState();

    expect(eventFired).toBe(false);
    expect(collector.getLastSnapshot()).toBeNull();
  });

  it("handles state.json with unknown schema (no phase, no workflows)", () => {
    writeState(projectPath, { version: 99, something: "else" });

    collector = new StatusCollector({
      projectPath,
      workflowId: "default",
      pollInterval: 50,
    });

    let eventFired = false;
    collector.on("status:changed", () => {
      eventFired = true;
    });

    collector.start();
    collector.checkState();

    expect(eventFired).toBe(false);
    expect(collector.getLastSnapshot()).toBeNull();
  });

  it("stops cleanly and emits no further events", async () => {
    writeState(
      projectPath,
      makeV2State("default", {
        phase: "plan",
        currentWave: 0,
        totalWaves: 0,
        specLocked: false,
      }),
    );

    collector = new StatusCollector({
      projectPath,
      workflowId: "default",
      pollInterval: 30,
    });

    collector.start();
    await new Promise((r) => setTimeout(r, 50));

    collector.stop();

    let eventFired = false;
    collector.on("status:changed", () => {
      eventFired = true;
    });

    // Update state after stop
    writeState(
      projectPath,
      makeV2State("default", {
        phase: "execute",
        currentWave: 1,
        totalWaves: 3,
        specLocked: true,
      }),
    );

    // Wait to ensure no polling fires
    await new Promise((r) => setTimeout(r, 100));

    expect(eventFired).toBe(false);
  });

  it("does not emit when state has not changed", () => {
    writeState(
      projectPath,
      makeV2State("default", {
        phase: "execute",
        currentWave: 2,
        totalWaves: 5,
        specLocked: true,
      }),
    );

    collector = new StatusCollector({
      projectPath,
      workflowId: "default",
      pollInterval: 50,
    });

    let changeCount = 0;
    collector.on("status:changed", () => {
      changeCount++;
    });

    collector.start();

    // Multiple checks with same state should only emit once (the initial)
    collector.checkState();
    collector.checkState();
    collector.checkState();

    expect(changeCount).toBe(1);
  });

  it("supports v1 flat state schema for backward compatibility", async () => {
    // v1 schema: flat object with phase at top level
    writeState(projectPath, {
      phase: "execute",
      currentWave: 2,
      totalWaves: 4,
      specLocked: true,
      interviewComplete: true,
    });

    collector = new StatusCollector({
      projectPath,
      workflowId: "default",
      pollInterval: 50,
    });

    const changed = new Promise<WorkflowStateSnapshot>((resolve) => {
      collector.once("status:changed", (snapshot: WorkflowStateSnapshot) => resolve(snapshot));
    });

    collector.start();

    const snapshot = await changed;

    expect(snapshot.phase).toBe("execute");
    expect(snapshot.currentWave).toBe(2);
    expect(snapshot.totalWaves).toBe(4);
    expect(snapshot.specLocked).toBe(true);
  });

  it("reads the correct workflow by workflowId from v2 state", async () => {
    const state = {
      version: 2,
      workflows: {
        default: {
          phase: "idle",
          currentWave: 0,
          totalWaves: 0,
          specLocked: false,
        },
        "feature-auth": {
          phase: "execute",
          currentWave: 3,
          totalWaves: 7,
          specLocked: true,
          interviewComplete: true,
        },
      },
    };

    writeState(projectPath, state);

    collector = new StatusCollector({
      projectPath,
      workflowId: "feature-auth",
      pollInterval: 50,
    });

    const changed = new Promise<WorkflowStateSnapshot>((resolve) => {
      collector.once("status:changed", (snapshot: WorkflowStateSnapshot) => resolve(snapshot));
    });

    collector.start();

    const snapshot = await changed;

    expect(snapshot.phase).toBe("execute");
    expect(snapshot.currentWave).toBe(3);
    expect(snapshot.totalWaves).toBe(7);
  });

  it("falls back to default workflow when workflowId not found in v2 state", async () => {
    writeState(
      projectPath,
      makeV2State("default", {
        phase: "plan",
        currentWave: 0,
        totalWaves: 0,
        specLocked: false,
      }),
    );

    collector = new StatusCollector({
      projectPath,
      workflowId: "nonexistent-workflow",
      pollInterval: 50,
    });

    const changed = new Promise<WorkflowStateSnapshot>((resolve) => {
      collector.once("status:changed", (snapshot: WorkflowStateSnapshot) => resolve(snapshot));
    });

    collector.start();

    const snapshot = await changed;

    expect(snapshot.phase).toBe("plan");
  });

  it("provides previous snapshot in status:changed event", async () => {
    writeState(
      projectPath,
      makeV2State("default", {
        phase: "plan",
        currentWave: 0,
        totalWaves: 0,
        specLocked: false,
      }),
    );

    collector = new StatusCollector({
      projectPath,
      workflowId: "default",
      pollInterval: 30,
    });

    collector.start();
    await new Promise((r) => setTimeout(r, 50));

    const changed = new Promise<{
      current: WorkflowStateSnapshot;
      previous: WorkflowStateSnapshot | null;
    }>((resolve) => {
      collector.once(
        "status:changed",
        (current: WorkflowStateSnapshot, previous: WorkflowStateSnapshot | null) => {
          resolve({ current, previous });
        },
      );
    });

    writeState(
      projectPath,
      makeV2State("default", {
        phase: "execute",
        currentWave: 1,
        totalWaves: 3,
        specLocked: true,
      }),
    );

    collector.checkState();

    const { current, previous } = await changed;

    expect(current.phase).toBe("execute");
    expect(previous).not.toBeNull();
    expect(previous!.phase).toBe("plan");
  });

  it("start is idempotent — calling twice does not double-subscribe", () => {
    writeState(
      projectPath,
      makeV2State("default", {
        phase: "execute",
        currentWave: 1,
        totalWaves: 3,
        specLocked: true,
      }),
    );

    collector = new StatusCollector({
      projectPath,
      workflowId: "default",
      pollInterval: 50,
    });

    let changeCount = 0;
    collector.on("status:changed", () => {
      changeCount++;
    });

    collector.start();
    collector.start(); // second call should be no-op

    expect(changeCount).toBe(1);
  });

  it("defaults missing fields to safe values", async () => {
    // Minimal v2 state — only phase present
    writeState(projectPath, makeV2State("default", { phase: "idle" }));

    collector = new StatusCollector({
      projectPath,
      workflowId: "default",
      pollInterval: 50,
    });

    const changed = new Promise<WorkflowStateSnapshot>((resolve) => {
      collector.once("status:changed", (snapshot: WorkflowStateSnapshot) => resolve(snapshot));
    });

    collector.start();

    const snapshot = await changed;

    expect(snapshot.phase).toBe("idle");
    expect(snapshot.currentWave).toBe(0);
    expect(snapshot.totalWaves).toBe(0);
    expect(snapshot.specLocked).toBe(false);
    expect(snapshot.interviewComplete).toBe(false);
    expect(snapshot.activeAgent).toBeUndefined();
  });
});
