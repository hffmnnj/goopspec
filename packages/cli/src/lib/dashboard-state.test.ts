import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getDashboardState } from "./dashboard-state.js";

describe("dashboard-state", () => {
  let originalCwd: string;
  let testDir: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    testDir = mkdtempSync(join(tmpdir(), "goopspec-dashboard-test-"));
    process.chdir(testDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(testDir, { recursive: true, force: true });
  });

  it("returns stopped when pid file is absent", async () => {
    const state = await getDashboardState();
    expect(state).toEqual({ running: false, port: 5173 });
  });

  it("returns stopped for an invalid pid", async () => {
    const goopspecDir = join(testDir, ".goopspec");
    const { mkdirSync } = await import("node:fs");
    mkdirSync(goopspecDir, { recursive: true });
    writeFileSync(join(goopspecDir, "dashboard.pid"), "not-a-number");

    const state = await getDashboardState();
    expect(state).toEqual({ running: false, port: 5173 });
  });

  it("returns running when pid file points to a live process", async () => {
    const goopspecDir = join(testDir, ".goopspec");
    const { mkdirSync } = await import("node:fs");
    mkdirSync(goopspecDir, { recursive: true });

    const startedAt = new Date(Date.now() - 1000).toISOString();
    writeFileSync(join(goopspecDir, "dashboard.pid"), JSON.stringify({ pid: process.pid, startedAt }));

    const state = await getDashboardState();
    expect(state.running).toBe(true);
    expect(state.pid).toBe(process.pid);
    expect(state.port).toBe(5173);
    expect(state.startedAt?.toISOString()).toBe(startedAt);
    expect(state.uptimeMs).toBeGreaterThanOrEqual(0);
  });

  it("returns stopped and clears stale pid when pid file points to a dead process", async () => {
    const goopspecDir = join(testDir, ".goopspec");
    const { mkdirSync } = await import("node:fs");
    mkdirSync(goopspecDir, { recursive: true });
    const pidPath = join(goopspecDir, "dashboard.pid");
    writeFileSync(pidPath, JSON.stringify({ pid: 999999, startedAt: new Date().toISOString() }));

    const state = await getDashboardState();
    expect(state).toEqual({ running: false, port: 5173 });
    expect(existsSync(pidPath)).toBe(false);
  });
});
