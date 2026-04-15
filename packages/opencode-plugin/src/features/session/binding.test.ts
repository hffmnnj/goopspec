import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync } from "fs";
import { join } from "path";

import { createStateManager } from "../state-manager/manager.js";
import {
  createMockPluginContext,
  setupTestEnvironment,
  type PluginContext,
  waitFor,
} from "../../test-utils.js";

import { clearSession, getActiveWorkflowId, setSession, setWorkflow } from "./binding.js";

describe("session binding", () => {
  let testDir: string;
  let cleanup: () => void;
  let ctx: PluginContext;

  beforeEach(() => {
    const env = setupTestEnvironment("session-binding");
    testDir = env.testDir;
    cleanup = env.cleanup;

    ctx = createMockPluginContext({ testDir });
    ctx.stateManager = createStateManager(testDir, "test-project", ctx.config);
    ctx.sessionId = undefined;
  });

  afterEach(() => {
    cleanup();
  });

  it("sets a session while keeping state at root scope", async () => {
    setSession(ctx, "feature-alpha");

    expect(ctx.sessionId).toBe("feature-alpha");

    await waitFor(() => existsSync(join(testDir, ".goopspec", "sessions", "feature-alpha")));
    expect(existsSync(join(testDir, ".goopspec", "sessions", "feature-alpha", "checkpoints"))).toBe(true);
    expect(existsSync(join(testDir, ".goopspec", "sessions", "feature-alpha", "history"))).toBe(true);

    ctx.stateManager.setState({
      project: {
        name: "feature-alpha-project",
        initialized: new Date().toISOString(),
      },
    });

    expect(existsSync(join(testDir, ".goopspec", "sessions", "feature-alpha", "state.json"))).toBe(false);
    expect(existsSync(join(testDir, ".goopspec", "state.json"))).toBe(true);
  });

  it("clears a session and reverts state manager to root scope", () => {
    setSession(ctx, "feature-clear");

    ctx.stateManager.setState({
      project: {
        name: "feature-clear-project",
        initialized: new Date().toISOString(),
      },
    });
    expect(existsSync(join(testDir, ".goopspec", "state.json"))).toBe(true);

    clearSession(ctx);
    expect(ctx.sessionId).toBeUndefined();

    ctx.stateManager.setState({
      project: {
        name: "root-project",
        initialized: new Date().toISOString(),
      },
    });

    expect(existsSync(join(testDir, ".goopspec", "state.json"))).toBe(true);
  });

  it("supports multiple session rebinds while writing to shared root state", () => {
    setSession(ctx, "feature-one");
    ctx.stateManager.setState({
      project: {
        name: "feature-one",
        initialized: new Date().toISOString(),
      },
    });

    setSession(ctx, "feature-two");
    ctx.stateManager.setState({
      project: {
        name: "feature-two",
        initialized: new Date().toISOString(),
      },
    });

    const rootStatePath = join(testDir, ".goopspec", "state.json");

    expect(ctx.sessionId).toBe("feature-two");
    expect(existsSync(rootStatePath)).toBe(true);
    expect(existsSync(join(testDir, ".goopspec", "sessions", "feature-one", "state.json"))).toBe(false);
    expect(existsSync(join(testDir, ".goopspec", "sessions", "feature-two", "state.json"))).toBe(false);
    expect(ctx.stateManager.getState().project.name).toBe("feature-two");
  });

  it("setSession with workflowId populates ctx.workflowId", () => {
    setSession(ctx, "test-session", "feat-x");

    expect(ctx.sessionId).toBe("test-session");
    expect(ctx.workflowId).toBe("feat-x");
  });

  it("setWorkflow updates ctx.workflowId without clearing sessionId", () => {
    setSession(ctx, "test-session");

    setWorkflow(ctx, "feat-x");

    expect(ctx.sessionId).toBe("test-session");
    expect(ctx.workflowId).toBe("feat-x");
  });

  it("getActiveWorkflowId returns default when no workflow set", () => {
    expect(getActiveWorkflowId(ctx)).toBe("default");
  });

  it("getActiveWorkflowId returns bound workflow", () => {
    setSession(ctx, "test-session");
    setWorkflow(ctx, "feat-x");

    expect(getActiveWorkflowId(ctx)).toBe("feat-x");
  });

  it("clearSession clears workflowId", () => {
    setSession(ctx, "test-session", "feat-x");

    clearSession(ctx);

    expect(ctx.sessionId).toBeUndefined();
    expect(ctx.workflowId).toBeUndefined();
  });
});
