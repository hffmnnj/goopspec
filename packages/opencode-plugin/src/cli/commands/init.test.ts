import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { applyInit, detectEnvironment, planInit, resetSetup } from "../../features/setup/index.js";
import { setupTestEnvironment } from "../../test-utils.js";
import type { SetupInput } from "../../features/setup/types.js";
import { DaemonClient, DaemonUnavailableError } from "../../features/daemon/client.js";

describe("init wizard - setup pipeline", () => {
  let testDir = "";
  let homeDir = "";
  let originalHome = "";

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), "goopspec-init-test-"));
    homeDir = mkdtempSync(join(tmpdir(), "goopspec-home-"));
    originalHome = process.env.HOME ?? "";
    process.env.HOME = homeDir;
  });

  afterEach(() => {
    process.env.HOME = originalHome;
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
    if (existsSync(homeDir)) {
      rmSync(homeDir, { recursive: true, force: true });
    }
  });

  it("detects uninitialized environment from a bare directory", async () => {
    const env = await detectEnvironment(testDir);

    expect(env.hasGoopspecDir).toBe(false);
    expect(env.hasStateFile).toBe(false);
    expect(env.hasADLFile).toBe(false);
    expect(env.hasProjectGoopSpecConfig).toBe(false);
    expect(env.goopspecDir).toBe(join(testDir, ".goopspec"));
  });

  it("detects pre-created .goopspec directories from test utilities", async () => {
    const env = setupTestEnvironment("init-pipeline");
    const utilityDir = env.testDir;

    try {
      const detected = await detectEnvironment(utilityDir);
      expect(detected.hasGoopspecDir).toBe(true);
      expect(detected.hasStateFile).toBe(false);
      expect(detected.hasADLFile).toBe(false);
    } finally {
      env.cleanup();
    }
  });

  it("creates an init plan for project scope", async () => {
    const env = await detectEnvironment(testDir);
    const input: SetupInput = {
      scope: "project",
      projectName: "test-project",
      models: {},
      mcpPreset: "none",
      memory: { enabled: false },
    };

    const plan = await planInit(testDir, input, env);

    expect(plan.isInit).toBe(true);
    expect(plan.projectName).toBe("test-project");
    expect(plan.actions.some((action) => action.type === "init_state")).toBe(true);
    expect(plan.configsToWrite).toHaveLength(1);
    expect(plan.configsToWrite[0]?.scope).toBe("project");
    expect(plan.configsToWrite[0]?.path).toBe(join(testDir, ".goopspec", "config.json"));
    expect(plan.mcpsToInstall).toHaveLength(0);
  });

  it("creates an init plan with global and project configs plus memory", async () => {
    const env = await detectEnvironment(testDir);
    const input: SetupInput = {
      scope: "both",
      projectName: "team-workspace",
      models: {
        orchestrator: "anthropic/claude-opus-4-6",
        default: "openai/gpt-5.3-codex",
      },
      mcpPreset: "none",
      enableOrchestrator: true,
      agentModels: {
        "goop-executor": "openai/gpt-5.3-codex",
      },
      memory: {
        enabled: true,
        workerPort: 38888,
        embeddings: { provider: "openai" },
      },
    };

    const plan = await planInit(testDir, input, env);

    const globalWrite = plan.configsToWrite.find((cfg) => cfg.scope === "global");
    const projectWrite = plan.configsToWrite.find((cfg) => cfg.scope === "project");

    expect(globalWrite).toBeDefined();
    expect(projectWrite).toBeDefined();
    expect(globalWrite?.path).toBe(join(homeDir, ".config", "opencode", "goopspec.json"));
    expect(projectWrite?.path).toBe(join(testDir, ".goopspec", "config.json"));
    expect((projectWrite?.content.orchestrator as { enableAsDefault: boolean }).enableAsDefault).toBe(true);
    expect((projectWrite?.content.memory as { workerPort: number }).workerPort).toBe(38888);
    expect((projectWrite?.content.agents as Record<string, { model: string }>)["goop-executor"]?.model).toBe(
      "openai/gpt-5.3-codex",
    );
  });

  it("applies init plan and creates expected state and config files", async () => {
    const env = await detectEnvironment(testDir);
    const input: SetupInput = {
      scope: "project",
      projectName: "test-project",
      models: {},
      mcpPreset: "none",
      agentModels: {
        "goop-executor": "openai/gpt-5.3-codex",
      },
      memory: { enabled: false },
    };

    const plan = await planInit(testDir, input, env);
    const result = await applyInit(testDir, plan);
    const goopspecDir = join(testDir, ".goopspec");
    const projectConfigPath = join(goopspecDir, "config.json");
    const projectConfig = JSON.parse(readFileSync(projectConfigPath, "utf-8")) as {
      projectName: string;
      agents: Record<string, { model: string }>;
    };

    expect(result.success).toBe(true);
    expect(result.projectName).toBe("test-project");
    expect(result.created).toContain(join(goopspecDir, "state.json"));
    expect(result.created).toContain(join(goopspecDir, "ADL.md"));
    expect(existsSync(goopspecDir)).toBe(true);
    expect(existsSync(join(goopspecDir, "state.json"))).toBe(true);
    expect(existsSync(join(goopspecDir, "ADL.md"))).toBe(true);
    expect(existsSync(projectConfigPath)).toBe(true);
    expect(result.configsWritten).toContain(projectConfigPath);
    expect(projectConfig.projectName).toBe("test-project");
    expect(projectConfig.agents["goop-executor"]?.model).toBe("openai/gpt-5.3-codex");
  });

  it("applies both-scope init and writes global + project config locations", async () => {
    const env = await detectEnvironment(testDir);
    const input: SetupInput = {
      scope: "both",
      projectName: "multi-scope",
      models: {
        orchestrator: "anthropic/claude-opus-4-6",
      },
      mcpPreset: "none",
      memory: { enabled: false },
    };

    const plan = await planInit(testDir, input, env);
    const result = await applyInit(testDir, plan);

    const globalConfigPath = join(homeDir, ".config", "opencode", "goopspec.json");
    const projectConfigPath = join(testDir, ".goopspec", "config.json");

    expect(result.success).toBe(true);
    expect(existsSync(globalConfigPath)).toBe(true);
    expect(existsSync(projectConfigPath)).toBe(true);
    expect(result.configsWritten).toContain(globalConfigPath);
    expect(result.configsWritten).toContain(projectConfigPath);
  });

  it("reports write failures from applyInit", async () => {
    const env = await detectEnvironment(testDir);
    const input: SetupInput = {
      scope: "project",
      projectName: "broken-write",
      models: {},
      mcpPreset: "none",
      memory: { enabled: false },
    };

    const plan = await planInit(testDir, input, env);

    const blocker = join(testDir, "not-a-directory");
    writeFileSync(blocker, "blocks directory creation");

    plan.configsToWrite = [
      {
        path: join(blocker, "subdir", "config.json"),
        scope: "project",
        content: { projectName: "broken-write" },
      },
    ];

    const result = await applyInit(testDir, plan);

    expect(result.success).toBe(false);
    expect(result.errors.some((error) => error.includes("Failed to write project config"))).toBe(true);
  });

  it("requires confirmation before resetSetup runs", async () => {
    const result = await resetSetup(testDir, {
      scope: "project",
      confirmed: false,
    });

    expect(result.success).toBe(false);
    expect(result.errors).toContain("Reset requires confirmation. Set confirmed: true to proceed.");
  });
});

describe("init wizard - password step", () => {
  it("DaemonClient.post accepts path and body arguments", () => {
    const client = new DaemonClient("http://localhost:7331");
    // Verify the client has the expected API shape
    expect(typeof client.post).toBe("function");
    expect(typeof client.get).toBe("function");
    expect(typeof client.isAvailable).toBe("function");
    expect(client.getBaseUrl()).toBe("http://localhost:7331");
  });

  it("DaemonUnavailableError is a proper Error subclass", () => {
    const error = new DaemonUnavailableError("No daemon");
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(DaemonUnavailableError);
    expect(error.name).toBe("DaemonUnavailableError");
    expect(error.message).toBe("No daemon");
  });

  it("DaemonClient constructor strips trailing slashes from base URL", () => {
    const client = new DaemonClient("http://localhost:7331/");
    // getBaseUrl should not end with a slash
    expect(client.getBaseUrl().endsWith("/")).toBe(false);
  });

  it("runResetPassword is exported and callable", async () => {
    const { runResetPassword } = await import("./init.js");
    expect(typeof runResetPassword).toBe("function");
  });
});
