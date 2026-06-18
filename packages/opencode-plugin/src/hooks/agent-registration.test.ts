import { describe, expect, it } from "bun:test";

import type { SdkConfig } from "../core/sdk-compat.js";
import { createMockPluginContext, setupTestEnvironment } from "../test-utils.js";
import { createAgentRegistrationHook } from "./agent-registration.js";

describe("createAgentRegistrationHook", () => {
  it("exposes a config hook", () => {
    const { testDir, cleanup } = setupTestEnvironment("agent-reg");
    try {
      const ctx = createMockPluginContext({ testDir });
      const hooks = createAgentRegistrationHook(ctx);
      expect(typeof hooks.config).toBe("function");
    } finally {
      cleanup();
    }
  });

  it("registers the bundled GoopSpec agents into config.agent", async () => {
    const { testDir, cleanup } = setupTestEnvironment("agent-reg-load");
    try {
      const ctx = createMockPluginContext({ testDir });
      const hooks = createAgentRegistrationHook(ctx);

      const config: SdkConfig = {};
      await hooks.config?.(config);

      expect(config.agent).toBeDefined();
      expect(config.agent?.["goop-orchestrator"]).toBeDefined();
      expect(config.agent?.["goop-orchestrator"]?.mode).toBe("primary");
    } finally {
      cleanup();
    }
  });

  it("does not overwrite an existing agent entry", async () => {
    const { testDir, cleanup } = setupTestEnvironment("agent-reg-override");
    try {
      const ctx = createMockPluginContext({ testDir });
      const hooks = createAgentRegistrationHook(ctx);

      const config: SdkConfig = {
        agent: { "goop-orchestrator": { model: "user/custom-model" } },
      };
      await hooks.config?.(config);

      expect(config.agent?.["goop-orchestrator"]?.model).toBe("user/custom-model");
    } finally {
      cleanup();
    }
  });
});
