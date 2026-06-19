import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { AGENT_ROLES, EXECUTOR_TIERS } from "../../core/constants.js";
import type { AgentRole } from "../../core/constants.js";
import { DEFAULT_MODEL_MAP } from "../setup/index.js";
import {
  buildModelPreferenceMap,
  resolveModelForRole,
  resolveModelForTier,
  withFallback,
} from "./model-routing.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createTempDir(prefix = "model-routing-test"): string {
  const dir = join(tmpdir(), `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(join(dir, ".goopspec"), { recursive: true });
  return dir;
}

function writeConfig(projectDir: string, config: Record<string, unknown>): void {
  writeFileSync(join(projectDir, ".goopspec", "config.json"), JSON.stringify(config), "utf-8");
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe("resolveModelForRole", () => {
  let testDir: string;
  let origGlobalConfigPath: string | undefined;

  beforeEach(() => {
    testDir = createTempDir();
    // Isolate from real global config
    origGlobalConfigPath = process.env.GOOPSPEC_GLOBAL_CONFIG_PATH;
    process.env.GOOPSPEC_GLOBAL_CONFIG_PATH = join(testDir, "nonexistent-global.json");
  });

  afterEach(() => {
    if (origGlobalConfigPath === undefined) {
      Reflect.deleteProperty(process.env, "GOOPSPEC_GLOBAL_CONFIG_PATH");
    } else {
      process.env.GOOPSPEC_GLOBAL_CONFIG_PATH = origGlobalConfigPath;
    }
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it("returns built-in default when no projectDir is provided", () => {
    for (const role of AGENT_ROLES) {
      const model = resolveModelForRole(role);
      expect(model).toBe(DEFAULT_MODEL_MAP[role]);
    }
  });

  it("returns built-in default when no config exists", () => {
    // testDir has .goopspec/ but no config.json
    for (const role of AGENT_ROLES) {
      const model = resolveModelForRole(role, testDir);
      expect(model).toBe(DEFAULT_MODEL_MAP[role]);
    }
  });

  it("applies defaultModel override to all roles", () => {
    writeConfig(testDir, { defaultModel: "openai/gpt-4o" });

    for (const role of AGENT_ROLES) {
      const model = resolveModelForRole(role, testDir);
      expect(model).toBe("openai/gpt-4o");
    }
  });

  it("applies per-role override over defaultModel", () => {
    writeConfig(testDir, {
      defaultModel: "openai/gpt-4o",
      agentModels: { orchestrator: "anthropic/claude-opus-4-6" },
    });

    expect(resolveModelForRole("orchestrator", testDir)).toBe("anthropic/claude-opus-4-6");
    expect(resolveModelForRole("executor-low", testDir)).toBe("openai/gpt-4o");
  });

  it("applies per-role override over built-in default (no defaultModel)", () => {
    writeConfig(testDir, {
      agentModels: { tester: "google/gemini-2.5-pro" },
    });

    expect(resolveModelForRole("tester", testDir)).toBe("google/gemini-2.5-pro");
    // Other roles keep built-in defaults
    expect(resolveModelForRole("orchestrator", testDir)).toBe(DEFAULT_MODEL_MAP.orchestrator);
  });

  it("accepts goop-prefixed explorer agent IDs from config-driven dispatch", () => {
    writeConfig(testDir, {
      agents: {
        "goop-explorer": { model: "google/gemini-2.5-flash" },
      },
    });

    expect(resolveModelForRole("goop-explorer", testDir)).toBe("google/gemini-2.5-flash");
  });

  it("falls back from explorer model routing to researcher when explorer is unavailable", () => {
    writeConfig(testDir, {
      agents: {
        "goop-explorer": { model: "google/gemini-2.5-flash" },
        "goop-researcher": { model: "anthropic/claude-sonnet-4-6" },
      },
    });

    expect(resolveModelForRole("goop-explorer", testDir, ["goop-researcher"])).toBe(
      "anthropic/claude-sonnet-4-6",
    );
  });

  it("covers all 13 agent roles", () => {
    expect(AGENT_ROLES.length).toBe(13);
    for (const role of AGENT_ROLES) {
      const model = resolveModelForRole(role);
      expect(typeof model).toBe("string");
      expect(model.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// resolveModelForTier
// ---------------------------------------------------------------------------

describe("resolveModelForTier", () => {
  let testDir: string;
  let origGlobalConfigPath: string | undefined;

  beforeEach(() => {
    testDir = createTempDir();
    origGlobalConfigPath = process.env.GOOPSPEC_GLOBAL_CONFIG_PATH;
    process.env.GOOPSPEC_GLOBAL_CONFIG_PATH = join(testDir, "nonexistent-global.json");
  });

  afterEach(() => {
    if (origGlobalConfigPath === undefined) {
      Reflect.deleteProperty(process.env, "GOOPSPEC_GLOBAL_CONFIG_PATH");
    } else {
      process.env.GOOPSPEC_GLOBAL_CONFIG_PATH = origGlobalConfigPath;
    }
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it("maps each executor tier to its corresponding role model", () => {
    for (const tier of EXECUTOR_TIERS) {
      const model = resolveModelForTier(tier);
      const expectedRole = `executor-${tier}` as AgentRole;
      expect(model).toBe(DEFAULT_MODEL_MAP[expectedRole]);
    }
  });

  it("respects config overrides via projectDir", () => {
    writeConfig(testDir, {
      agentModels: { "executor-low": "openai/gpt-4o-mini" },
    });

    expect(resolveModelForTier("low", testDir)).toBe("openai/gpt-4o-mini");
    expect(resolveModelForTier("high", testDir)).toBe(DEFAULT_MODEL_MAP["executor-high"]);
  });

  it("respects defaultModel override", () => {
    writeConfig(testDir, { defaultModel: "google/gemini-2.5-flash" });

    for (const tier of EXECUTOR_TIERS) {
      expect(resolveModelForTier(tier, testDir)).toBe("google/gemini-2.5-flash");
    }
  });

  it("covers all 5 executor tiers", () => {
    expect(EXECUTOR_TIERS.length).toBe(5);
    for (const tier of EXECUTOR_TIERS) {
      const model = resolveModelForTier(tier);
      expect(typeof model).toBe("string");
      expect(model.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// withFallback
// ---------------------------------------------------------------------------

describe("withFallback", () => {
  it("returns preferred when it is in the available list", () => {
    const result = withFallback("anthropic/claude-opus-4-6", [
      "anthropic/claude-sonnet-4-6",
      "anthropic/claude-opus-4-6",
      "openai/gpt-4o",
    ]);
    expect(result).toBe("anthropic/claude-opus-4-6");
  });

  it("returns first available when preferred is not in the list", () => {
    const result = withFallback("anthropic/claude-opus-4-6", [
      "openai/gpt-4o",
      "google/gemini-2.5-pro",
    ]);
    expect(result).toBe("openai/gpt-4o");
  });

  it("returns preferred when available list is empty", () => {
    const result = withFallback("anthropic/claude-opus-4-6", []);
    expect(result).toBe("anthropic/claude-opus-4-6");
  });

  it("returns preferred when it is the only available model", () => {
    const result = withFallback("anthropic/claude-opus-4-6", ["anthropic/claude-opus-4-6"]);
    expect(result).toBe("anthropic/claude-opus-4-6");
  });

  it("returns first available when preferred is absent from a single-item list", () => {
    const result = withFallback("anthropic/claude-opus-4-6", ["openai/gpt-4o"]);
    expect(result).toBe("openai/gpt-4o");
  });
});

// ---------------------------------------------------------------------------
// buildModelPreferenceMap
// ---------------------------------------------------------------------------

describe("buildModelPreferenceMap", () => {
  let testDir: string;
  let origGlobalConfigPath: string | undefined;

  beforeEach(() => {
    testDir = createTempDir();
    origGlobalConfigPath = process.env.GOOPSPEC_GLOBAL_CONFIG_PATH;
    process.env.GOOPSPEC_GLOBAL_CONFIG_PATH = join(testDir, "nonexistent-global.json");
  });

  afterEach(() => {
    if (origGlobalConfigPath === undefined) {
      Reflect.deleteProperty(process.env, "GOOPSPEC_GLOBAL_CONFIG_PATH");
    } else {
      process.env.GOOPSPEC_GLOBAL_CONFIG_PATH = origGlobalConfigPath;
    }
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it("returns preferences for all 13 roles", () => {
    const map = buildModelPreferenceMap();
    expect(Object.keys(map).length).toBe(13);
    for (const role of AGENT_ROLES) {
      expect(map[role]).toBeDefined();
      expect(map[role].preferred).toBe(DEFAULT_MODEL_MAP[role]);
    }
  });

  it("sets fallback to undefined when preferred matches built-in", () => {
    const map = buildModelPreferenceMap();
    for (const role of AGENT_ROLES) {
      expect(map[role].fallback).toBeUndefined();
    }
  });

  it("sets fallback to built-in when config overrides the preferred model", () => {
    writeConfig(testDir, {
      agentModels: { orchestrator: "openai/gpt-4o" },
    });

    const map = buildModelPreferenceMap(testDir);
    expect(map.orchestrator.preferred).toBe("openai/gpt-4o");
    expect(map.orchestrator.fallback).toBe(DEFAULT_MODEL_MAP.orchestrator);
  });

  it("sets fallback for all roles when defaultModel overrides", () => {
    writeConfig(testDir, { defaultModel: "openai/gpt-4o" });

    const map = buildModelPreferenceMap(testDir);
    for (const role of AGENT_ROLES) {
      expect(map[role].preferred).toBe("openai/gpt-4o");
      // Fallback is the built-in default (which differs from the override)
      expect(map[role].fallback).toBe(DEFAULT_MODEL_MAP[role]);
    }
  });
});

// ---------------------------------------------------------------------------
// Resolution chain integration
// ---------------------------------------------------------------------------

describe("resolution chain (integration)", () => {
  let testDir: string;
  let origGlobalConfigPath: string | undefined;

  beforeEach(() => {
    testDir = createTempDir();
    origGlobalConfigPath = process.env.GOOPSPEC_GLOBAL_CONFIG_PATH;
    process.env.GOOPSPEC_GLOBAL_CONFIG_PATH = join(testDir, "nonexistent-global.json");
  });

  afterEach(() => {
    if (origGlobalConfigPath === undefined) {
      Reflect.deleteProperty(process.env, "GOOPSPEC_GLOBAL_CONFIG_PATH");
    } else {
      process.env.GOOPSPEC_GLOBAL_CONFIG_PATH = origGlobalConfigPath;
    }
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it("per-role > defaultModel > built-in (full chain)", () => {
    writeConfig(testDir, {
      defaultModel: "openai/gpt-4o",
      agentModels: {
        planner: "anthropic/claude-opus-4-6",
      },
    });

    // Per-role override wins
    expect(resolveModelForRole("planner", testDir)).toBe("anthropic/claude-opus-4-6");
    // defaultModel wins over built-in
    expect(resolveModelForRole("tester", testDir)).toBe("openai/gpt-4o");
    // Without projectDir, built-in wins
    expect(resolveModelForRole("tester")).toBe(DEFAULT_MODEL_MAP.tester);
  });

  it("tier resolution chains through role resolution", () => {
    writeConfig(testDir, {
      agentModels: { "executor-medium": "google/gemini-2.5-pro" },
    });

    expect(resolveModelForTier("medium", testDir)).toBe("google/gemini-2.5-pro");
    expect(resolveModelForTier("low", testDir)).toBe(DEFAULT_MODEL_MAP["executor-low"]);
  });

  it("withFallback integrates with resolved models", () => {
    const preferred = resolveModelForRole("orchestrator");
    const available = ["anthropic/claude-sonnet-4-6", "openai/gpt-4o"];

    // Orchestrator defaults to opus, which isn't in available
    const result = withFallback(preferred, available);
    expect(result).toBe("anthropic/claude-sonnet-4-6");
  });
});
