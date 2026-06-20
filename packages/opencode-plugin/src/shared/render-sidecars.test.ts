import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  createMockPluginContext,
  setupTestEnvironment,
  type PluginContext,
} from "../test-utils.js";
import { renderSidecars } from "./render-sidecars.js";

describe("renderSidecars()", () => {
  let ctx: PluginContext;
  let cleanup: () => void;

  beforeEach(() => {
    const env = setupTestEnvironment("render-sidecars");
    cleanup = env.cleanup;
    ctx = createMockPluginContext({ testDir: env.testDir, db: env.db });
  });

  afterEach(() => cleanup());

  it("renders workflow docs, active root copies, and status", () => {
    ctx.db.upsertDocument("default", "spec", "# Test Spec\n\nBody");
    ctx.stateManager.transitionPhase("plan", true);
    ctx.stateManager.transitionPhase("execute", true);

    renderSidecars(ctx, "default");

    const workflowSpecPath = join(ctx.sdk.directory, ".goopspec", "default", "SPEC.md");
    const activeSpecPath = join(ctx.sdk.directory, ".goopspec", "ACTIVE_SPEC.md");
    const statusPath = join(ctx.sdk.directory, ".goopspec", "STATUS.md");

    expect(existsSync(workflowSpecPath)).toBe(true);
    expect(readFileSync(workflowSpecPath, "utf-8")).toBe("# Test Spec\n\nBody");
    expect(existsSync(activeSpecPath)).toBe(true);
    expect(readFileSync(activeSpecPath, "utf-8")).toBe("# Test Spec\n\nBody");
    expect(lstatSync(activeSpecPath).isSymbolicLink()).toBe(false);
    expect(existsSync(statusPath)).toBe(true);
    expect(readFileSync(statusPath, "utf-8")).toContain("execute");
  });

  it("prunes stale active root copies when the active workflow has no content", () => {
    const stalePath = join(ctx.sdk.directory, ".goopspec", "ACTIVE_BLUEPRINT.md");
    mkdirSync(join(ctx.sdk.directory, ".goopspec"), { recursive: true });
    writeFileSync(stalePath, "stale", "utf-8");
    ctx.db.upsertDocument("default", "spec", "# Current Spec");

    renderSidecars(ctx, "default");

    expect(existsSync(stalePath)).toBe(false);
    expect(existsSync(join(ctx.sdk.directory, ".goopspec", "ACTIVE_SPEC.md"))).toBe(true);
  });

  it("does not throw when file rendering fails", () => {
    expect(() => renderSidecars(ctx, "bad\0workflow")).not.toThrow();
  });

  it("renders TRACEABILITY.md as a sorted requirement matrix", () => {
    ctx.db.upsertTraceability("default", {
      requirement_key: "MH15",
      wave_number: 4,
      task_index: 2,
      status: "done",
    });
    ctx.db.upsertTraceability("default", {
      requirement_key: "MH5",
      wave_number: 4,
      task_index: 2,
      status: "pending",
    });

    renderSidecars(ctx, "default");

    const traceabilityPath = join(ctx.sdk.directory, ".goopspec", "default", "TRACEABILITY.md");
    expect(existsSync(traceabilityPath)).toBe(true);

    const content = readFileSync(traceabilityPath, "utf-8");
    expect(content).toContain("| Requirement | Wave | Task | Status |");
    expect(content).toContain("| MH15 | 4 | 2 | done |");
    expect(content).toContain("| MH5 | 4 | 2 | pending |");
    expect(content.indexOf("MH15")).toBeLessThan(content.indexOf("MH5"));
  });

  it("renders TIMELINE.md when audit entries exist", () => {
    ctx.db.appendEvent("default", "doc_write", { doc_type: "spec" });

    renderSidecars(ctx, "default");

    const timelinePath = join(ctx.sdk.directory, ".goopspec", "default", "TIMELINE.md");
    expect(existsSync(timelinePath)).toBe(true);

    const content = readFileSync(timelinePath, "utf-8");
    expect(content).toContain("# Timeline");
    expect(content).toContain("[event] doc_write");
  });
});
