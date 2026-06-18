import { afterEach, describe, expect, it } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";

import type { ToolContext } from "./core/sdk-compat.js";
import type {
  GoopState,
  MemoryManager,
  PluginContext,
  ResourceResolver,
  StateManager,
} from "./core/types.js";
import {
  createDefaultWorkflowState,
  createMockMemory,
  createMockPluginContext,
  createMockResolver,
  createMockStateManager,
  createMockToolContext,
  setupTestEnvironment,
} from "./test-utils.js";

// ============================================================================
// setupTestEnvironment
// ============================================================================

describe("setupTestEnvironment", () => {
  let cleanup: (() => void) | undefined;

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
  });

  it("creates a temp directory with .goopspec structure", () => {
    const env = setupTestEnvironment("self-test");
    cleanup = env.cleanup;

    expect(existsSync(env.testDir)).toBe(true);
    expect(existsSync(join(env.testDir, ".goopspec"))).toBe(true);
    expect(existsSync(join(env.testDir, ".goopspec", "default"))).toBe(true);
  });

  it("provides an in-memory GoopSpecDB instance", () => {
    const env = setupTestEnvironment("state-check");
    cleanup = env.cleanup;

    expect(env.db).toBeDefined();
    expect(typeof env.db.getAllWorkflows).toBe("function");
    expect(typeof env.db.upsertWorkflow).toBe("function");
  });

  it("cleanup removes the directory", () => {
    const env = setupTestEnvironment("cleanup-test");
    const dir = env.testDir;

    expect(existsSync(dir)).toBe(true);
    env.cleanup();
    expect(existsSync(dir)).toBe(false);

    // Prevent double-cleanup in afterEach
    cleanup = undefined;
  });
});

// ============================================================================
// createMockToolContext
// ============================================================================

describe("createMockToolContext", () => {
  it("returns an object satisfying the ToolContext shape", () => {
    const ctx: ToolContext = createMockToolContext();

    expect(typeof ctx.sessionID).toBe("string");
    expect(typeof ctx.messageID).toBe("string");
    expect(typeof ctx.agent).toBe("string");
    expect(typeof ctx.directory).toBe("string");
    expect(typeof ctx.worktree).toBe("string");
    expect(ctx.abort).toBeInstanceOf(AbortSignal);
    expect(typeof ctx.metadata).toBe("function");
    expect(typeof ctx.ask).toBe("function");
  });

  it("accepts overrides", () => {
    const ctx = createMockToolContext({
      sessionID: "custom-session",
      agent: "custom-agent",
    });

    expect(ctx.sessionID).toBe("custom-session");
    expect(ctx.agent).toBe("custom-agent");
  });

  it("metadata and ask are callable without throwing", async () => {
    const ctx = createMockToolContext();
    ctx.metadata({ title: "test" });
    await ctx.ask({ permission: "write", patterns: [], always: [], metadata: {} });
  });
});

// ============================================================================
// createMockStateManager
// ============================================================================

describe("createMockStateManager", () => {
  it("returns an object satisfying the StateManager interface", () => {
    const mgr: StateManager = createMockStateManager();

    // Verify all interface methods exist
    expect(typeof mgr.getState).toBe("function");
    expect(typeof mgr.setState).toBe("function");
    expect(typeof mgr.getWorkflow).toBe("function");
    expect(typeof mgr.getActiveWorkflow).toBe("function");
    expect(typeof mgr.getActiveWorkflowId).toBe("function");
    expect(typeof mgr.setActiveWorkflow).toBe("function");
    expect(typeof mgr.createWorkflow).toBe("function");
    expect(typeof mgr.removeWorkflow).toBe("function");
    expect(typeof mgr.listWorkflowIds).toBe("function");
    expect(typeof mgr.updateWorkflow).toBe("function");
    expect(typeof mgr.transitionPhase).toBe("function");
    expect(typeof mgr.lockSpec).toBe("function");
    expect(typeof mgr.unlockSpec).toBe("function");
    expect(typeof mgr.confirmAcceptance).toBe("function");
    expect(typeof mgr.resetAcceptance).toBe("function");
    expect(typeof mgr.completeInterview).toBe("function");
    expect(typeof mgr.resetInterview).toBe("function");
    expect(typeof mgr.setMode).toBe("function");
    expect(typeof mgr.setDepth).toBe("function");
    expect(typeof mgr.updateWaveProgress).toBe("function");
    expect(typeof mgr.resetWorkflow).toBe("function");
    expect(typeof mgr.getADL).toBe("function");
    expect(typeof mgr.appendADL).toBe("function");
    expect(typeof mgr.saveCheckpoint).toBe("function");
    expect(typeof mgr.loadCheckpoint).toBe("function");
    expect(typeof mgr.listCheckpoints).toBe("function");
  });

  it("get-after-set returns the updated state", () => {
    const mgr = createMockStateManager();
    const original = mgr.getState();

    const updated: GoopState = {
      ...original,
      activeWorkflowId: "new-wf",
      workflows: {
        ...original.workflows,
        "new-wf": createDefaultWorkflowState({ phase: "plan" }),
      },
    };
    mgr.setState(updated);

    expect(mgr.getState().activeWorkflowId).toBe("new-wf");
    expect(mgr.getState().workflows["new-wf"]?.phase).toBe("plan");
  });

  it("creates and retrieves workflows", () => {
    const mgr = createMockStateManager();

    const wf = mgr.createWorkflow("feat-auth");
    expect(wf.phase).toBe("idle");
    expect(mgr.getWorkflow("feat-auth")).toBeDefined();
    expect(mgr.listWorkflowIds()).toContain("feat-auth");
  });

  it("removes workflows", () => {
    const mgr = createMockStateManager();
    mgr.createWorkflow("temp");
    mgr.removeWorkflow("temp");

    expect(mgr.getWorkflow("temp")).toBeUndefined();
  });

  it("transitions phases with validation", () => {
    const mgr = createMockStateManager();

    // idle → discuss is valid
    mgr.transitionPhase("discuss");
    expect(mgr.getActiveWorkflow().phase).toBe("discuss");

    // discuss → execute is invalid
    expect(() => mgr.transitionPhase("execute")).toThrow();

    // force overrides validation
    mgr.transitionPhase("execute", true);
    expect(mgr.getActiveWorkflow().phase).toBe("execute");
  });

  it("locks and unlocks spec", () => {
    const mgr = createMockStateManager();

    mgr.lockSpec();
    expect(mgr.getActiveWorkflow().specLocked).toBe(true);

    mgr.unlockSpec();
    expect(mgr.getActiveWorkflow().specLocked).toBe(false);
  });

  it("tracks wave progress", () => {
    const mgr = createMockStateManager();
    mgr.updateWaveProgress(3, 8);

    expect(mgr.getActiveWorkflow().currentWave).toBe(3);
    expect(mgr.getActiveWorkflow().totalWaves).toBe(8);
  });

  it("manages ADL entries", () => {
    const mgr = createMockStateManager();
    mgr.appendADL({
      timestamp: "2026-06-16T00:00:00Z",
      type: "deviation",
      description: "Changed approach",
      action: "Used alternative pattern",
      rule: 1,
      files: ["src/foo.ts"],
    });

    const adl = mgr.getADL();
    expect(adl).toContain("Changed approach");
    expect(adl).toContain("**Rule:** 1");
  });

  it("manages checkpoints", () => {
    const mgr = createMockStateManager();
    const data = {
      id: "cp-1",
      timestamp: new Date().toISOString(),
      state: mgr.getState(),
    };

    mgr.saveCheckpoint("cp-1", data);
    expect(mgr.loadCheckpoint("cp-1")).toEqual(data);
    expect(mgr.listCheckpoints()).toContain("cp-1");
    expect(mgr.loadCheckpoint("nonexistent")).toBeNull();
  });

  it("resets the active workflow", () => {
    const mgr = createMockStateManager();
    mgr.transitionPhase("discuss");
    mgr.lockSpec();
    mgr.updateWaveProgress(5, 10);

    mgr.resetWorkflow();
    const wf = mgr.getActiveWorkflow();
    expect(wf.phase).toBe("idle");
    expect(wf.specLocked).toBe(false);
    expect(wf.currentWave).toBe(0);
  });

  it("switches active workflow", () => {
    const mgr = createMockStateManager();
    mgr.createWorkflow("feat-x");
    mgr.setActiveWorkflow("feat-x");

    expect(mgr.getActiveWorkflowId()).toBe("feat-x");
  });

  it("throws when switching to nonexistent workflow", () => {
    const mgr = createMockStateManager();
    expect(() => mgr.setActiveWorkflow("nope")).toThrow();
  });
});

// ============================================================================
// createMockMemory
// ============================================================================

describe("createMockMemory", () => {
  it("returns an object satisfying the MemoryManager interface", () => {
    const mem: MemoryManager = createMockMemory();

    expect(typeof mem.save).toBe("function");
    expect(typeof mem.search).toBe("function");
    expect(typeof mem.getById).toBe("function");
    expect(typeof mem.forget).toBe("function");
    expect(typeof mem.forgetByQuery).toBe("function");
  });

  it("save returns a MemoryEntry with an id", async () => {
    const mem = createMockMemory();
    const entry = await mem.save({
      type: "observation",
      title: "Test observation",
      content: "Something interesting happened",
      importance: 7,
    });

    expect(entry.id).toBeGreaterThan(0);
    expect(entry.title).toBe("Test observation");
    expect(entry.type).toBe("observation");
    expect(entry.importance).toBe(7);
  });

  it("search finds saved entries by title", async () => {
    const mem = createMockMemory();
    await mem.save({
      type: "decision",
      title: "Use Bun for testing",
      content: "Bun test runner is fast and built-in",
    });

    const results = await mem.search({ query: "Bun" });
    expect(results.length).toBe(1);
    expect(results[0].memory.title).toBe("Use Bun for testing");
    expect(results[0].matchType).toBe("fts");
  });

  it("search finds saved entries by content", async () => {
    const mem = createMockMemory();
    await mem.save({
      type: "note",
      title: "A note",
      content: "The authentication service uses JWT tokens",
    });

    const results = await mem.search({ query: "JWT" });
    expect(results.length).toBe(1);
  });

  it("search respects type filter", async () => {
    const mem = createMockMemory();
    await mem.save({ type: "observation", title: "Obs", content: "shared keyword" });
    await mem.save({ type: "decision", title: "Dec", content: "shared keyword" });

    const results = await mem.search({ query: "shared", types: ["decision"] });
    expect(results.length).toBe(1);
    expect(results[0].memory.type).toBe("decision");
  });

  it("search respects minImportance filter", async () => {
    const mem = createMockMemory();
    await mem.save({ type: "note", title: "Low", content: "low priority", importance: 2 });
    await mem.save({ type: "note", title: "High", content: "high priority", importance: 9 });

    const results = await mem.search({ query: "priority", minImportance: 5 });
    expect(results.length).toBe(1);
    expect(results[0].memory.title).toBe("High");
  });

  it("search respects concept filter", async () => {
    const mem = createMockMemory();
    await mem.save({
      type: "observation",
      title: "Auth pattern",
      content: "Uses JWT",
      concepts: ["auth", "jwt"],
    });
    await mem.save({
      type: "observation",
      title: "DB pattern",
      content: "Uses SQLite",
      concepts: ["database"],
    });

    const results = await mem.search({ query: "pattern", concepts: ["auth"] });
    expect(results.length).toBe(1);
    expect(results[0].memory.title).toBe("Auth pattern");
  });

  it("getById retrieves a saved entry", async () => {
    const mem = createMockMemory();
    const saved = await mem.save({
      type: "note",
      title: "Findable",
      content: "Can be found by id",
    });

    const found = await mem.getById(saved.id);
    expect(found).not.toBeNull();
    expect(found?.title).toBe("Findable");
  });

  it("forget removes an entry", async () => {
    const mem = createMockMemory();
    const saved = await mem.save({
      type: "note",
      title: "Temporary",
      content: "Will be forgotten",
    });

    const deleted = await mem.forget(saved.id);
    expect(deleted).toBe(true);

    const found = await mem.getById(saved.id);
    expect(found).toBeNull();
  });

  it("forgetByQuery removes matching entries", async () => {
    const mem = createMockMemory();
    await mem.save({ type: "note", title: "Keep this", content: "Important" });
    await mem.save({ type: "note", title: "Remove this", content: "Outdated info" });
    await mem.save({ type: "note", title: "Also remove", content: "Outdated data" });

    const count = await mem.forgetByQuery("outdated");
    expect(count).toBe(2);

    const remaining = await mem.search({ query: "important" });
    expect(remaining.length).toBe(1);
  });

  it("works with seed data", async () => {
    const mem = createMockMemory([
      {
        id: 100,
        type: "observation",
        title: "Seeded",
        content: "Pre-loaded entry",
        importance: 5,
        createdAt: Date.now(),
      },
    ]);

    const found = await mem.getById(100);
    expect(found?.title).toBe("Seeded");

    // New entries get ids after the seed
    const newEntry = await mem.save({
      type: "note",
      title: "After seed",
      content: "New",
    });
    expect(newEntry.id).toBeGreaterThan(100);
  });
});

// ============================================================================
// createMockResolver
// ============================================================================

describe("createMockResolver", () => {
  const testResources: ResolvedResource[] = [
    { name: "executor-core", type: "reference", content: "# Executor Core\n\nProtocol..." },
    { name: "git-workflow", type: "reference", content: "# Git Workflow\n\nRules..." },
    { name: "spec-template", type: "template", content: "# SPEC Template\n\n..." },
  ];

  it("returns an object satisfying the ResourceResolver interface", () => {
    const resolver: ResourceResolver = createMockResolver();

    expect(typeof resolver.resolve).toBe("function");
    expect(typeof resolver.resolveMany).toBe("function");
    expect(typeof resolver.resolveAll).toBe("function");
    expect(typeof resolver.listNames).toBe("function");
  });

  it("resolves a single resource by type and name", () => {
    const resolver = createMockResolver(testResources);

    const result = resolver.resolve("reference", "executor-core");
    expect(result).not.toBeNull();
    expect(result?.name).toBe("executor-core");
    expect(result?.content).toContain("Executor Core");
  });

  it("returns null for unknown resources", () => {
    const resolver = createMockResolver(testResources);
    expect(resolver.resolve("reference", "nonexistent")).toBeNull();
  });

  it("resolveMany returns multiple resources", () => {
    const resolver = createMockResolver(testResources);

    const results = resolver.resolveMany(["executor-core", "git-workflow"]);
    expect(results.length).toBe(2);
    expect(results.map((r) => r.name)).toContain("executor-core");
    expect(results.map((r) => r.name)).toContain("git-workflow");
  });

  it("resolveMany skips unknown names", () => {
    const resolver = createMockResolver(testResources);

    const results = resolver.resolveMany(["executor-core", "nonexistent"]);
    expect(results.length).toBe(1);
  });

  it("resolveAll returns all resources of a type", () => {
    const resolver = createMockResolver(testResources);

    const refs = resolver.resolveAll("reference");
    expect(refs.length).toBe(2);

    const templates = resolver.resolveAll("template");
    expect(templates.length).toBe(1);
  });

  it("listNames returns names for a type", () => {
    const resolver = createMockResolver(testResources);

    const names = resolver.listNames("reference");
    expect(names).toContain("executor-core");
    expect(names).toContain("git-workflow");
    expect(names).not.toContain("spec-template");
  });
});

// ============================================================================
// createMockPluginContext
// ============================================================================

describe("createMockPluginContext", () => {
  it("returns an object satisfying the PluginContext interface", () => {
    const ctx: PluginContext = createMockPluginContext();

    expect(ctx.sdk).toBeDefined();
    expect(typeof ctx.sdk.directory).toBe("string");
    expect(typeof ctx.sdk.worktree).toBe("string");
    expect(ctx.sdk.client).toBeDefined();
    expect(ctx.sdk.$).toBeDefined();

    expect(ctx.stateManager).toBeDefined();
    expect(typeof ctx.stateManager.getState).toBe("function");

    expect(ctx.memory).toBeDefined();
    expect(typeof ctx.memory.save).toBe("function");

    expect(ctx.resolver).toBeDefined();
    expect(typeof ctx.resolver.resolve).toBe("function");

    expect(ctx.session).toBeDefined();
    expect(typeof ctx.session.id).toBe("string");
    expect(typeof ctx.session.startedAt).toBe("string");
  });

  it("uses provided testDir for sdk paths", () => {
    const ctx = createMockPluginContext({ testDir: "/tmp/custom-dir" });
    expect(ctx.sdk.directory).toBe("/tmp/custom-dir");
    expect(ctx.sdk.worktree).toBe("/tmp/custom-dir");
  });

  it("wires up state with custom initial state", () => {
    const ctx = createMockPluginContext({
      state: {
        workflows: {
          default: {
            phase: "execute",
            mode: "comprehensive",
            depth: "deep",
            interviewComplete: true,
            specLocked: true,
            acceptanceConfirmed: false,
            currentWave: 3,
            totalWaves: 8,
            autopilot: false,
            lazyAutopilot: false,
          },
        },
      },
    });

    const wf = ctx.stateManager.getActiveWorkflow();
    expect(wf.phase).toBe("execute");
    expect(wf.specLocked).toBe(true);
    expect(wf.currentWave).toBe(3);
  });

  it("wires up memory with seed data", async () => {
    const ctx = createMockPluginContext({
      memories: [
        {
          id: 1,
          type: "observation",
          title: "Seeded memory",
          content: "Pre-loaded",
          importance: 5,
          createdAt: Date.now(),
        },
      ],
    });

    const found = await ctx.memory.getById(1);
    expect(found?.title).toBe("Seeded memory");
  });

  it("wires up resolver with resources", () => {
    const ctx = createMockPluginContext({
      resources: [{ name: "test-ref", type: "reference", content: "Test content" }],
    });

    const result = ctx.resolver.resolve("reference", "test-ref");
    expect(result?.content).toBe("Test content");
  });

  it("sets session info from options", () => {
    const ctx = createMockPluginContext({
      sessionId: "custom-session",
      agent: "custom-agent",
    });

    expect(ctx.session.id).toBe("custom-session");
    expect(ctx.session.agent).toBe("custom-agent");
  });
});

// ============================================================================
// Import re-exports
// ============================================================================

import type { ResolvedResource } from "./core/types.js";

describe("re-exports", () => {
  it("re-exports commonly needed types", async () => {
    // Verify the module exports the types by importing them
    const mod = await import("./test-utils.js");

    // Verify factory functions are exported
    expect(typeof mod.setupTestEnvironment).toBe("function");
    expect(typeof mod.createMockToolContext).toBe("function");
    expect(typeof mod.createMockStateManager).toBe("function");
    expect(typeof mod.createMockMemory).toBe("function");
    expect(typeof mod.createMockResolver).toBe("function");
    expect(typeof mod.createMockPluginContext).toBe("function");
    expect(typeof mod.createDefaultWorkflowState).toBe("function");
    expect(typeof mod.delay).toBe("function");
  });
});
