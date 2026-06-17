import { describe, it, expect } from "bun:test";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { createStateManager } from "./features/state-manager/manager.js";
import { getProjectGoopspecDir, getSessionGoopspecPath } from "./shared/paths.js";
import {
  setupTestEnvironment,
  createMockPluginContext,
  createMockSessionContext,
} from "./test-utils.js";

describe("test-utils backward compatibility", () => {
  it("does not create sessions directory by default", () => {
    const env = setupTestEnvironment("compat-env");

    expect(existsSync(join(env.goopspecDir, "sessions"))).toBe(false);

    env.cleanup();
  });

  it("uses root state.json when state manager has no sessionId", () => {
    const env = setupTestEnvironment("compat-state");
    const manager = createStateManager(env.testDir, "compat-project");

    manager.updateWorkflow({ phase: "plan" });

    const rootStatePath = join(env.goopspecDir, "state.json");
    const sessionsStatePath = join(env.goopspecDir, "sessions", "compat", "state.json");

    expect(existsSync(rootStatePath)).toBe(true);
    expect(existsSync(sessionsStatePath)).toBe(false);

    const rootState = JSON.parse(readFileSync(rootStatePath, "utf-8")) as {
      workflow: { phase: string };
    };
    expect(rootState.workflow.phase).toBe("plan");

    env.cleanup();
  });

  it("resolves root .goopspec paths without sessionId", () => {
    const env = setupTestEnvironment("compat-paths");

    const expected = join(getProjectGoopspecDir(env.testDir), "state.json");
    const actual = getSessionGoopspecPath(env.testDir, "state.json");

    expect(actual).toBe(expected);
    expect(actual.includes("/sessions/")).toBe(false);

    env.cleanup();
  });

  it("initializes plugin context without session by default", () => {
    const env = setupTestEnvironment("compat-plugin");
    const ctx = createMockPluginContext({ testDir: env.testDir });

    expect(ctx.sessionId).toBeUndefined();
    expect(ctx.stateManager.getState().workflow.phase).toBe("idle");

    env.cleanup();
  });

  it("creates a session-bound mock context when requested", () => {
    const env = setupTestEnvironment("compat-session");
    const ctx = createMockSessionContext({
      testDir: env.testDir,
      sessionId: "feature-auth",
    });

    expect(ctx.sessionId).toBe("feature-auth");

    env.cleanup();
  });
});
