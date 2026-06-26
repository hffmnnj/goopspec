import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getConfigPath, readConfig } from "./config.js";

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
});
