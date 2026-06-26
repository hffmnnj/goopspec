import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getConfigPath, mergeConfig, readConfig, writeConfig } from "./config.js";

describe("config", () => {
  let originalCwd: string;
  let testDir: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    testDir = mkdtempSync(join(tmpdir(), "goopspec-config-test-"));
    process.chdir(testDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(testDir, { recursive: true, force: true });
  });

  it("returns the config path under .goopspec", () => {
    expect(getConfigPath()).toBe(join(testDir, ".goopspec", "config.json"));
  });

  it("reads config when present", async () => {
    const goopspecDir = join(testDir, ".goopspec");
    if (!existsSync(goopspecDir)) {
      // Bun does not expose mkdirSync directly; use node:fs.
      const { mkdirSync } = await import("node:fs");
      mkdirSync(goopspecDir, { recursive: true });
    }
    writeFileSync(
      join(goopspecDir, "config.json"),
      JSON.stringify({ projectName: "demo", memoryEnabled: true }),
    );

    const config = await readConfig();
    expect(config).toEqual({ projectName: "demo", memoryEnabled: true });
  });

  it("returns null when config is absent", async () => {
    const config = await readConfig();
    expect(config).toBeNull();
  });

  it("returns null when config is invalid json", async () => {
    const goopspecDir = join(testDir, ".goopspec");
    const { mkdirSync } = await import("node:fs");
    mkdirSync(goopspecDir, { recursive: true });
    writeFileSync(join(goopspecDir, "config.json"), "not json");

    const config = await readConfig();
    expect(config).toBeNull();
  });

  describe("mergeConfig", () => {
    it("does not overwrite fields when patch value is undefined", () => {
      const result = mergeConfig({ projectName: "old" }, { projectName: undefined });
      expect(result).toEqual({ projectName: "old" });
    });

    it("does not add fields absent from existing when patch value is undefined", () => {
      const result = mergeConfig({ projectName: "old" }, { memoryEnabled: undefined });
      expect(result).toEqual({ projectName: "old" });
    });

    it("clears a field when patch value is null", () => {
      const result = mergeConfig({ projectName: "old" }, { projectName: null as unknown as string });
      expect(result).not.toHaveProperty("projectName");
    });

    it("merges agentModels at the field level", () => {
      const result = mergeConfig(
        { agentModels: { planner: "a", orchestrator: "b" } },
        { agentModels: { planner: "x", researcher: "c" } },
      );
      expect(result.agentModels).toEqual({
        planner: "x",
        orchestrator: "b",
        researcher: "c",
      });
    });

    it("merges agentThinkingBudgets at the field level", () => {
      const result = mergeConfig(
        { agentThinkingBudgets: { planner: 100 } },
        { agentThinkingBudgets: { planner: 200, researcher: 50 } },
      );
      expect(result.agentThinkingBudgets).toEqual({
        planner: 200,
        researcher: 50,
      });
    });

    it("replaces scalar fields", () => {
      const result = mergeConfig(
        { projectName: "old", defaultModel: "m1" },
        { projectName: "new" },
      );
      expect(result).toEqual({ projectName: "new", defaultModel: "m1" });
    });

    it("does not mutate the existing config", () => {
      const existing = { projectName: "old", agentModels: { planner: "a" } };
      const result = mergeConfig(existing, { agentModels: { researcher: "b" } });
      expect(existing).toEqual({ projectName: "old", agentModels: { planner: "a" } });
      expect(result.agentModels).toEqual({ planner: "a", researcher: "b" });
    });
  });

  describe("writeConfig", () => {
    it("creates .goopspec and config.json and round-trips correctly", async () => {
      const result = await writeConfig({ projectName: "demo", memoryEnabled: true });

      expect(result).toEqual({ projectName: "demo", memoryEnabled: true });
      expect(existsSync(getConfigPath())).toBe(true);

      const contents = readFileSync(getConfigPath(), "utf8");
      expect(JSON.parse(contents)).toEqual({ projectName: "demo", memoryEnabled: true });

      const readBack = await readConfig();
      expect(readBack).toEqual({ projectName: "demo", memoryEnabled: true });
    });

    it("merges with existing config and preserves untouched fields", async () => {
      const goopspecDir = join(testDir, ".goopspec");
      const { mkdirSync } = await import("node:fs");
      mkdirSync(goopspecDir, { recursive: true });
      writeFileSync(
        join(goopspecDir, "config.json"),
        JSON.stringify({ projectName: "demo", defaultModel: "m1" }),
      );

      const result = await writeConfig({ memoryEnabled: true });
      expect(result).toEqual({
        projectName: "demo",
        defaultModel: "m1",
        memoryEnabled: true,
      });

      const readBack = await readConfig();
      expect(readBack).toEqual({
        projectName: "demo",
        defaultModel: "m1",
        memoryEnabled: true,
      });
    });

    it("does not write undefined fields to JSON", async () => {
      await writeConfig({ projectName: "demo" });
      const contents = readFileSync(getConfigPath(), "utf8");
      expect(JSON.parse(contents)).toEqual({ projectName: "demo" });
    });

    it("clears a field when patch value is null", async () => {
      await writeConfig({ projectName: "demo", memoryEnabled: true });
      const cleared = await writeConfig({ memoryEnabled: null as unknown as boolean });
      expect(cleared).toEqual({ projectName: "demo" });

      const readBack = await readConfig();
      expect(readBack).toEqual({ projectName: "demo" });
    });
  });
});
