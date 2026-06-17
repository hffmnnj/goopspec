import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createSystemTransformHook } from "./system-transform.js";
import {
  createMockPluginContext,
  setupTestEnvironment,
  type PluginContext,
} from "../test-utils.js";

describe("system transform hook session context", () => {
  let cleanup: () => void;
  let testDir: string;

  beforeEach(() => {
    const env = setupTestEnvironment("system-transform-session");
    cleanup = env.cleanup;
    testDir = env.testDir;
  });

  afterEach(() => {
    cleanup();
  });

  function createContext(): PluginContext {
    return createMockPluginContext({
      testDir,
      state: {
        workflow: {
          phase: "execute",
          specLocked: true,
        },
      },
      config: {
        memory: {
          injection: {
            enabled: false,
          },
        },
      },
    });
  }

  it("injects session context when session is active", async () => {
    const ctx = createContext();
    ctx.sessionId = "feature-auth";
    ctx.stateManager.createWorkflow("workflow-auth");
    ctx.stateManager.setActiveWorkflow("workflow-auth");

    const hook = createSystemTransformHook(ctx);
    const result = await hook(
      {
        sessionID: "opencode-session",
        agent: "goop-orchestrator",
      },
      {
        system: "Base system prompt",
      },
    );

    expect(result.system).toContain("## Session Context");
    expect(result.system).toContain("<session>");
    expect(result.system).toContain("id: feature-auth");
    expect(result.system).toContain(".goopspec/workflow-auth/SPEC.md");
    expect(result.system).toContain(".goopspec/workflow-auth/BLUEPRINT.md");
    expect(result.system).toContain(".goopspec/workflow-auth/CHRONICLE.md");
    expect(result.system).toContain(".goopspec/workflow-auth/RESEARCH.md");
    expect(result.system).toContain(".goopspec/state.json");
  });

  it("does not inject session context when no session is active", async () => {
    const ctx = createContext();

    const hook = createSystemTransformHook(ctx);
    const result = await hook(
      {
        sessionID: "opencode-session",
        agent: "goop-orchestrator",
      },
      {
        system: "Base system prompt",
      },
    );

    expect(result.system).not.toContain("## Session Context");
    expect(result.system).not.toContain("<session>");
    expect(result.system).not.toContain(".goopspec/sessions/");
  });
});
