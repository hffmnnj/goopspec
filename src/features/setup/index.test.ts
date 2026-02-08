import { beforeAll, beforeEach, describe, expect, it, mock } from "bun:test";

import type { SetupPlan } from "./types.js";

const existsSyncMock = mock(() => false);
const mkdirSyncMock = mock(() => undefined);
const writeFileSyncMock = mock(() => undefined);

const dirnameMock = mock((input: string) => {
  if (input.includes("\\")) {
    const index = input.lastIndexOf("\\");
    return index > 0 ? input.slice(0, index) : "";
  }

  const index = input.lastIndexOf("/");
  return index > 0 ? input.slice(0, index) : "";
});

const installMcpsMock = mock(async () => [] as string[]);

mock.module("fs", () => ({
  existsSync: existsSyncMock,
  readFileSync: mock(() => "{}"),
  writeFileSync: writeFileSyncMock,
  mkdirSync: mkdirSyncMock,
  rmSync: mock(() => undefined),
}));

mock.module("path", () => ({
  dirname: dirnameMock,
}));

mock.module("../../shared/logger.js", () => ({
  log: mock(() => undefined),
  logError: mock(() => undefined),
}));

mock.module("./mcp-installer.js", () => ({
  installMcps: installMcpsMock,
}));

mock.module("../../core/opencode-config.js", () => ({
  hasOpenCodeConfig: mock(() => false),
  getOpenCodeConfigPath: mock(() => ""),
  readOpenCodeConfig: mock(() => ({})),
  getExistingMcps: mock(() => []),
}));

mock.module("../../core/config.js", () => ({
  DEFAULT_CONFIG: {
    enforcement: "assist",
    adlEnabled: true,
    defaultModel: "anthropic/claude-sonnet-4-5",
    mcp: {},
  },
  validateConfig: mock(() => ({ valid: true })),
}));

mock.module("../state-manager/manager.js", () => ({
  initializeGoopspec: mock(async () => undefined),
}));

mock.module("./dependencies.js", () => ({
  detectAllDependencies: mock(async () => ({
    platform: { packageSuffix: "linux-x64" },
    sqliteVec: { available: true },
    onnxRuntime: { available: true },
    transformers: { available: true },
  })),
}));

mock.module("./installer.js", () => ({
  installSqliteVec: mock(async () => ({ success: true })),
  installLocalEmbeddings: mock(async () => ({ allSucceeded: true, results: [], degradedFeatures: [] })),
}));

mock.module("./feature-catalog.js", () => ({
  getDefaultFeatures: mock(() => []),
  isFeatureAvailable: mock(() => true),
}));

mock.module("./distillation-config.js", () => ({
  createDistillationConfig: mock(() => ({ enabled: false })),
  getDistillationModel: mock(() => "anthropic/claude-sonnet-4-5"),
}));

let applySetup: (plan: SetupPlan) => Promise<{
  success: boolean;
  configsWritten: string[];
  mcpsInstalled: string[];
  errors: string[];
  warnings: string[];
}>;

describe("setup applySetup path handling", () => {
  beforeAll(async () => {
    ({ applySetup } = await import("./index.js"));
  });

  beforeEach(() => {
    existsSyncMock.mockReset();
    mkdirSyncMock.mockReset();
    writeFileSyncMock.mockReset();
    dirnameMock.mockReset();
    installMcpsMock.mockReset();

    existsSyncMock.mockReturnValue(false);
    mkdirSyncMock.mockReturnValue(undefined);
    writeFileSyncMock.mockReturnValue(undefined);
    installMcpsMock.mockResolvedValue([]);

    dirnameMock.mockImplementation((input: string) => {
      if (input.includes("\\")) {
        const index = input.lastIndexOf("\\");
        return index > 0 ? input.slice(0, index) : "";
      }

      const index = input.lastIndexOf("/");
      return index > 0 ? input.slice(0, index) : "";
    });
  });

  it("extracts config directory from Windows-style config path", async () => {
    const configPath = "C:\\Users\\test\\.config\\opencode\\goopspec.json";
    const expectedDir = "C:\\Users\\test\\.config\\opencode";
    const plan: SetupPlan = {
      actions: [],
      summary: "",
      mcpsToInstall: [],
      configsToWrite: [
        {
          path: configPath,
          scope: "global",
          content: { test: true },
        },
      ],
      dirsToCreate: [],
    };

    const result = await applySetup(plan);

    expect(result.success).toBe(true);
    expect(dirnameMock).toHaveBeenCalledWith(configPath);
    expect(mkdirSyncMock).toHaveBeenCalledWith(expectedDir, { recursive: true });
    expect(writeFileSyncMock).toHaveBeenCalledWith(configPath, JSON.stringify({ test: true }, null, 2));
    expect(mkdirSyncMock).not.toHaveBeenCalledWith("", { recursive: true });
  });

  it("extracts config directory from Unix-style config path", async () => {
    const configPath = "/home/user/.config/opencode/goopspec.json";
    const expectedDir = "/home/user/.config/opencode";
    const plan: SetupPlan = {
      actions: [],
      summary: "",
      mcpsToInstall: [],
      configsToWrite: [
        {
          path: configPath,
          scope: "global",
          content: { test: true },
        },
      ],
      dirsToCreate: [],
    };

    const result = await applySetup(plan);

    expect(result.success).toBe(true);
    expect(dirnameMock).toHaveBeenCalledWith(configPath);
    expect(mkdirSyncMock).toHaveBeenCalledWith(expectedDir, { recursive: true });
    expect(writeFileSyncMock).toHaveBeenCalledWith(configPath, JSON.stringify({ test: true }, null, 2));
  });
});
