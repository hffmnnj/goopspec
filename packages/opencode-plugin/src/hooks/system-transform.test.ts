import { afterEach, describe, expect, it, spyOn } from "bun:test";
import type { SdkModel } from "../core/sdk-compat.js";
import type { MemoryEntry } from "../core/types.js";
import { WORKFLOW_PHASES } from "../core/constants.js";
import {
  createDefaultWorkflowState,
  createMockPluginContext,
  setupTestEnvironment,
} from "../test-utils.js";
import {
  buildDbContextBlock,
  buildFieldNotesBlock,
  buildMemoryBlock,
  buildStateBlock,
  clearDocTypeCache,
  clearMemoryCache,
  createSystemTransformHook,
  estimateTokens,
  systemTransformFactory,
} from "./system-transform.js";

// ---------------------------------------------------------------------------
// estimateTokens
// ---------------------------------------------------------------------------

describe("estimateTokens", () => {
  it("estimates ~4 chars per token", () => {
    expect(estimateTokens("abcd")).toBe(1);
    expect(estimateTokens("abcde")).toBe(2);
    expect(estimateTokens("")).toBe(0);
  });

  it("rounds up partial tokens", () => {
    expect(estimateTokens("ab")).toBe(1);
    expect(estimateTokens("abc")).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// buildDbContextBlock
// ---------------------------------------------------------------------------

describe("buildDbContextBlock", () => {
  it("lists the document inventory and a concise tool pointer, without restating tool descriptions", () => {
    const { testDir, cleanup } = setupTestEnvironment("db-context-block");
    try {
      const ctx = createMockPluginContext({ testDir });
      ctx.db.upsertDocument("feat-auth", "spec", "# Spec");
      clearDocTypeCache();

      const block = buildDbContextBlock(ctx, "feat-auth");

      expect(block).toContain("<goopspec_db>");
      expect(block).toContain("</goopspec_db>");
      expect(block).toContain("## Workflow Documents (feat-auth)");
      expect(block).toContain("- spec");
      // Pointer, not a restated description — no per-tool argument lists.
      expect(block).toContain("goop_read_db");
      expect(block).not.toContain("## DB Tools Available");
      expect(block).not.toContain("doc_type, workflow_id?");
      expect(block).not.toContain("renders markdown sidecar automatically");
    } finally {
      cleanup();
    }
  });

  it("reports no documents yet when the workflow has none", () => {
    const { testDir, cleanup } = setupTestEnvironment("db-context-block-empty");
    try {
      const ctx = createMockPluginContext({ testDir });
      clearDocTypeCache();

      const block = buildDbContextBlock(ctx, "brand-new");

      expect(block).toContain("(no documents yet — use goop_write_db to create them)");
    } finally {
      cleanup();
    }
  });
});

// ---------------------------------------------------------------------------
// DB context block
// ---------------------------------------------------------------------------

describe("buildStateBlock", () => {
  it("includes phase, workflow ID, and key flags", () => {
    const wf = createDefaultWorkflowState({ phase: "execute", specLocked: true });
    const block = buildStateBlock(wf, "my-feature");

    expect(block).toContain("<goopspec_state>");
    expect(block).toContain("</goopspec_state>");
    expect(block).toContain("workflow: my-feature");
    expect(block).toContain("phase: execute");
    expect(block).toContain("spec_locked: true");
    expect(block).toContain("interview_complete: false");
    expect(block).toContain("acceptance_confirmed: false");
  });

  it("includes wave progress when waves exist", () => {
    const wf = createDefaultWorkflowState({ currentWave: 3, totalWaves: 5 });
    const block = buildStateBlock(wf, "test");

    expect(block).toContain("wave_progress: 3/5");
  });

  it("omits wave progress when totalWaves is 0", () => {
    const wf = createDefaultWorkflowState();
    const block = buildStateBlock(wf, "test");

    expect(block).not.toContain("wave_progress");
  });

  it("includes autopilot flag when enabled", () => {
    const wf = createDefaultWorkflowState({ autopilot: true, lazyAutopilot: true });
    const block = buildStateBlock(wf, "test");

    expect(block).toContain("autopilot: true (lazy)");
  });

  it("includes checkpoint when set", () => {
    const wf = createDefaultWorkflowState({ checkpoint: "wave-2-complete" });
    const block = buildStateBlock(wf, "test");

    expect(block).toContain("checkpoint: wave-2-complete");
  });
});

// ---------------------------------------------------------------------------
// buildMemoryBlock
// ---------------------------------------------------------------------------

function makeMemoryResult(
  title: string,
  content: string,
): {
  memory: MemoryEntry;
  score: number;
  matchType: "fts";
} {
  return {
    memory: {
      id: 1,
      type: "observation",
      title,
      content,
      importance: 5,
      createdAt: Date.now(),
    },
    score: 1.0,
    matchType: "fts",
  };
}

describe("buildMemoryBlock", () => {
  it("returns empty string for no memories", () => {
    expect(buildMemoryBlock([], 800)).toBe("");
  });

  it("formats memories within budget", () => {
    const results = [
      makeMemoryResult("Auth pattern", "Use JWT with jose library"),
      makeMemoryResult("DB choice", "PostgreSQL for main store"),
    ];

    const block = buildMemoryBlock(results, 800);

    expect(block).toContain("<goopspec_memory>");
    expect(block).toContain("</goopspec_memory>");
    expect(block).toContain("[observation] Auth pattern: Use JWT with jose library");
    expect(block).toContain("[observation] DB choice: PostgreSQL for main store");
  });

  it("respects token budget and truncates entries", () => {
    const longContent = "x".repeat(3200); // ~800 tokens
    const results = [
      makeMemoryResult("First", "short"),
      makeMemoryResult("Second", longContent),
      makeMemoryResult("Third", "also short"),
    ];

    const block = buildMemoryBlock(results, 100);

    expect(block).toContain("First");
    expect(block).not.toContain("Second");
    expect(block).not.toContain("Third");
  });

  it("returns empty when even first entry exceeds budget", () => {
    const longContent = "x".repeat(4000);
    const results = [makeMemoryResult("Huge", longContent)];

    const block = buildMemoryBlock(results, 10);

    expect(block).toBe("");
  });
});

describe("buildFieldNotesBlock", () => {
  it("formats notes within budget", () => {
    const block = buildFieldNotesBlock(
      [
        {
          id: "fn_20260718_highnote",
          title: "Workflow decision",
          body: "Use the additive Field Notes context budget.",
          tags: "[]",
          source_agent: "goop-executor-high",
          importance: 8,
          workflow_id: "default",
          project_id: "goopspec",
          created_at: Date.now(),
        },
      ],
      300,
    );

    expect(block).toContain("<goopspec_field_notes>");
    expect(estimateTokens(block)).toBeLessThanOrEqual(300);
  });
});

// ---------------------------------------------------------------------------
// createSystemTransformHook (integration)
// ---------------------------------------------------------------------------

describe("createSystemTransformHook", () => {
  // Task 1.2 measured 334 tokens for state + phase rules + DB in execute;
  // 800 memory + 300 Field Notes budgets leave 166 tokens of headroom.
  const MAX_ALWAYS_ON_CONTEXT_TOKENS = 1_600;

  afterEach(() => {
    clearMemoryCache();
    clearDocTypeCache();
  });

  it("injects state block into output.system", async () => {
    const { testDir, cleanup } = setupTestEnvironment("sys-transform-state");
    try {
      const ctx = createMockPluginContext({
        testDir,
        state: {
          activeWorkflowId: "feat-auth",
          workflows: {
            "feat-auth": createDefaultWorkflowState({
              phase: "execute",
              specLocked: true,
              currentWave: 2,
              totalWaves: 5,
            }),
          },
        },
      });

      const hooks = createSystemTransformHook(ctx);
      const output = { system: ["existing system prompt"] };
      const input = { sessionID: "s1", model: {} as SdkModel };

      await hooks["experimental.chat.system.transform"]?.(input, output);

      expect(output.system.length).toBe(2);
      const injected = output.system[1];
      expect(injected).toContain("workflow: feat-auth");
      expect(injected).toContain("phase: execute");
      expect(injected).toContain("spec_locked: true");
      expect(injected).toContain("wave_progress: 2/5");
      // Single canonical state block — the markdown "## CURRENT STATE"
      // variant is no longer duplicated into the phase rules block.
      expect(injected).not.toContain("## CURRENT STATE");
    } finally {
      cleanup();
    }
  });

  it("keeps exactly one canonical state block and no legacy state block in every workflow phase", async () => {
    const { testDir, cleanup } = setupTestEnvironment("sys-transform-state-invariant");
    try {
      const ctx = createMockPluginContext({
        testDir,
        state: {
          activeWorkflowId: "phase-invariant",
          workflows: {
            "phase-invariant": createDefaultWorkflowState({
              phase: "discuss",
              specLocked: true,
              interviewComplete: true,
              acceptanceConfirmed: true,
            }),
          },
        },
      });
      const hooks = createSystemTransformHook(ctx);
      const phases = WORKFLOW_PHASES;

      for (const phase of phases) {
        ctx.stateManager.updateWorkflow({ phase });
        clearMemoryCache();
        clearDocTypeCache();
        const output = { system: [] as string[] };
        await hooks["experimental.chat.system.transform"]?.(
          { sessionID: `state-invariant-${phase}`, model: {} as SdkModel },
          output,
        );

        const injected = output.system[0] ?? "";
        expect(injected.match(/<goopspec_state>/g) ?? []).toHaveLength(1);
        expect(injected.match(/<\/goopspec_state>/g) ?? []).toHaveLength(1);
        expect(injected).not.toContain("## CURRENT STATE");
      }
    } finally {
      cleanup();
    }
  });

  it("rejects a synthetic duplicate-state negative control", () => {
    const stateBlock = buildStateBlock(createDefaultWorkflowState({ phase: "execute" }), "test");
    const countStateBlocks = (message: string): void => {
      expect(message.match(/<goopspec_state>/g) ?? []).toHaveLength(1);
      expect(message).not.toContain("## CURRENT STATE");
    };

    countStateBlocks(stateBlock);
    expect(() => countStateBlocks(`${stateBlock}\n\n${stateBlock}`)).toThrow();
    expect(() => countStateBlocks(`${stateBlock}\n\n## CURRENT STATE\nphase: execute`)).toThrow();
  });

  it("keeps the populated always-on composition under its documented token ceiling", async () => {
    const { testDir, cleanup } = setupTestEnvironment("sys-transform-budget");
    try {
      const memories: MemoryEntry[] = Array.from({ length: 10 }, (_, index) => ({
        id: index + 1,
        type: "decision",
        title: `execute workflow memory ${index}`,
        content: "Preserve the shared workflow contract while composing useful context. ".repeat(8),
        importance: 8,
        createdAt: Date.now(),
      }));
      const ctx = createMockPluginContext({
        testDir,
        memories,
        state: {
          activeWorkflowId: "budget-workflow",
          workflows: {
            "budget-workflow": createDefaultWorkflowState({
              phase: "execute",
              specLocked: true,
              interviewComplete: true,
              currentWave: 2,
              totalWaves: 5,
              autopilot: true,
              lazyAutopilot: true,
              checkpoint: "wave-1-complete",
            }),
          },
        },
      });
      for (const docType of [
        "spec",
        "blueprint",
        "chronicle",
        "adl",
        "handoff",
        "requirements",
        "research",
      ] as const) {
        ctx.db.upsertDocument("budget-workflow", docType, `# ${docType}`);
      }
      for (let index = 0; index < 10; index++) {
        ctx.db.saveNote({
          id: `fn_budget_${index}`,
          title: `execute workflow Field Note ${index}`,
          body: "Retain high-value evidence and decisions in the assembled context. ".repeat(5),
          tags: '["prompt", "workflow"]',
          source_agent: "goop-researcher",
          importance: 8,
          workflow_id: "budget-workflow",
          project_id: "goopspec",
        });
      }

      const output = { system: [] as string[] };
      await createSystemTransformHook(ctx)["experimental.chat.system.transform"]?.(
        { sessionID: "budget", model: {} as SdkModel },
        output,
      );

      const injected = output.system[0] ?? "";
      const measuredTokens = estimateTokens(injected);
      expect(injected).toContain("<goopspec_memory>");
      expect(injected).toContain("<goopspec_field_notes>");
      expect(measuredTokens).toBeLessThanOrEqual(MAX_ALWAYS_ON_CONTEXT_TOKENS);
    } finally {
      cleanup();
    }
  });

  it("includes phase enforcement rules", async () => {
    const { testDir, cleanup } = setupTestEnvironment("sys-transform-rules");
    try {
      const ctx = createMockPluginContext({
        testDir,
        state: {
          activeWorkflowId: "default",
          workflows: {
            default: createDefaultWorkflowState({ phase: "execute" }),
          },
        },
      });

      const hooks = createSystemTransformHook(ctx);
      const output = { system: [] as string[] };
      const input = { sessionID: "s1", model: {} as SdkModel };

      await hooks["experimental.chat.system.transform"]?.(input, output);

      const injected = output.system[0];
      expect(injected).toContain("MUST DO");
      expect(injected).toContain("MUST NOT DO");
      expect(injected).toContain("DELEGATE");
    } finally {
      cleanup();
    }
  });

  it("includes memories within token budget", async () => {
    const { testDir, cleanup } = setupTestEnvironment("sys-transform-memory");
    try {
      const memories: MemoryEntry[] = [
        {
          id: 1,
          type: "decision",
          title: "execute workflow decision: Use jose for JWT",
          content: "Chose jose over jsonwebtoken for ESM compatibility",
          importance: 8,
          createdAt: Date.now(),
        },
      ];

      const ctx = createMockPluginContext({
        testDir,
        memories,
        state: {
          activeWorkflowId: "default",
          workflows: {
            default: createDefaultWorkflowState({ phase: "execute" }),
          },
        },
      });

      const hooks = createSystemTransformHook(ctx);
      const output = { system: [] as string[] };
      const input = { sessionID: "s1", model: {} as SdkModel };

      await hooks["experimental.chat.system.transform"]?.(input, output);

      const injected = output.system[0];
      expect(injected).toContain("<goopspec_memory>");
      expect(injected).toContain("jose");
    } finally {
      cleanup();
    }
  });

  it("does not inject memory block when no memories match", async () => {
    const { testDir, cleanup } = setupTestEnvironment("sys-transform-no-mem");
    try {
      const ctx = createMockPluginContext({
        testDir,
        memories: [],
        state: {
          activeWorkflowId: "default",
          workflows: {
            default: createDefaultWorkflowState({ phase: "idle" }),
          },
        },
      });

      const hooks = createSystemTransformHook(ctx);
      const output = { system: [] as string[] };
      const input = { sessionID: "s1", model: {} as SdkModel };

      await hooks["experimental.chat.system.transform"]?.(input, output);

      const injected = output.system[0];
      expect(injected).not.toContain("<goopspec_memory>");
    } finally {
      cleanup();
    }
  });

  it("injects high-importance workflow Field Notes within their additive budget", async () => {
    const { testDir, cleanup } = setupTestEnvironment("sys-transform-field-notes");
    try {
      const ctx = createMockPluginContext({
        testDir,
        state: {
          activeWorkflowId: "notes-workflow",
          workflows: {
            "notes-workflow": createDefaultWorkflowState({ phase: "execute" }),
          },
        },
      });
      ctx.db.saveNote({
        id: "fn_20260718_important",
        title: "execute workflow decision",
        body: "Inject high-value Field Notes as additive agent context.",
        tags: '["memory"]',
        source_agent: "goop-researcher",
        importance: 8,
        workflow_id: "notes-workflow",
        project_id: "goopspec",
      });
      ctx.db.saveNote({
        id: "fn_20260718_lowpriority",
        title: "execute workflow reminder",
        body: "This note should not be injected.",
        tags: '["memory"]',
        source_agent: "goop-researcher",
        importance: 7,
        workflow_id: "notes-workflow",
        project_id: "goopspec",
      });

      const hooks = createSystemTransformHook(ctx);
      const output = { system: [] as string[] };
      await hooks["experimental.chat.system.transform"]?.(
        { sessionID: "field-notes", model: {} as SdkModel },
        output,
      );

      const fieldNotesBlock = output.system[0].match(
        /<goopspec_field_notes>[\s\S]*?<\/goopspec_field_notes>/,
      )?.[0];
      expect(fieldNotesBlock).toContain("Inject high-value Field Notes");
      expect(fieldNotesBlock).not.toContain("This note should not be injected");
      expect(estimateTokens(fieldNotesBlock ?? "")).toBeLessThanOrEqual(300);
    } finally {
      cleanup();
    }
  });

  it("preserves the memory-only block when the workflow has no Field Notes", async () => {
    const { testDir, cleanup } = setupTestEnvironment("sys-transform-memory-only");
    try {
      const memory = makeMemoryResult(
        "execute workflow decision",
        "Keep memory context behavior unchanged when no Field Notes exist.",
      );
      const ctx = createMockPluginContext({
        testDir,
        memories: [memory.memory],
        state: {
          activeWorkflowId: "default",
          workflows: {
            default: createDefaultWorkflowState({ phase: "execute" }),
          },
        },
      });

      const hooks = createSystemTransformHook(ctx);
      const output = { system: [] as string[] };
      await hooks["experimental.chat.system.transform"]?.(
        { sessionID: "memory-only", model: {} as SdkModel },
        output,
      );

      expect(output.system[0]).toContain(buildMemoryBlock([memory], 800));
      expect(output.system[0]).not.toContain("<goopspec_field_notes>");
    } finally {
      cleanup();
    }
  });

  it("gracefully injects nothing on error", async () => {
    const { testDir, cleanup } = setupTestEnvironment("sys-transform-error");
    try {
      const ctx = createMockPluginContext({ testDir });

      // Force an error by making getState throw
      const originalGetState = ctx.stateManager.getState;
      (ctx.stateManager as unknown as { getState: () => never }).getState = () => {
        throw new Error("state explosion");
      };

      const consoleSpy = spyOn(console, "error").mockImplementation(() => {});

      const hooks = createSystemTransformHook(ctx);
      const output = { system: ["original prompt"] };
      const input = { sessionID: "s1", model: {} as SdkModel };

      await hooks["experimental.chat.system.transform"]?.(input, output);

      // Original system prompt preserved, nothing added
      expect(output.system).toEqual(["original prompt"]);

      consoleSpy.mockRestore();
      (ctx.stateManager as unknown as { getState: typeof originalGetState }).getState =
        originalGetState;
    } finally {
      cleanup();
    }
  });

  it("does nothing when active workflow is missing", async () => {
    const { testDir, cleanup } = setupTestEnvironment("sys-transform-missing-wf");
    try {
      const ctx = createMockPluginContext({
        testDir,
        state: {
          activeWorkflowId: "nonexistent",
          workflows: {},
        },
      });

      // Override getState to return the raw state with missing workflow
      const rawState = {
        version: 2,
        activeWorkflowId: "nonexistent",
        workflows: {},
      };
      (ctx.stateManager as unknown as { getState: () => typeof rawState }).getState = () =>
        rawState;

      const hooks = createSystemTransformHook(ctx);
      const output = { system: ["original"] };
      const input = { sessionID: "s1", model: {} as SdkModel };

      await hooks["experimental.chat.system.transform"]?.(input, output);

      expect(output.system).toEqual(["original"]);
    } finally {
      cleanup();
    }
  });

  it("exports systemTransformFactory matching HookFactory signature", () => {
    const { testDir, cleanup } = setupTestEnvironment("sys-transform-factory");
    try {
      const ctx = createMockPluginContext({ testDir });
      const hooks = systemTransformFactory(ctx);

      expect(hooks["experimental.chat.system.transform"]).toBeDefined();
      expect(typeof hooks["experimental.chat.system.transform"]).toBe("function");
    } finally {
      cleanup();
    }
  });

  // -----------------------------------------------------------------------
  // Memory cache behaviour
  // -----------------------------------------------------------------------

  it("cache miss: first call invokes ctx.memory.search", async () => {
    const { testDir, cleanup } = setupTestEnvironment("sys-transform-cache-miss");
    try {
      const ctx = createMockPluginContext({
        testDir,
        state: {
          activeWorkflowId: "default",
          workflows: {
            default: createDefaultWorkflowState({ phase: "execute", currentWave: 1 }),
          },
        },
      });

      const searchSpy = spyOn(ctx.memory, "search");

      const hooks = createSystemTransformHook(ctx);
      const output = { system: [] as string[] };
      const input = { sessionID: "sess-cache-miss", model: {} as SdkModel };

      await hooks["experimental.chat.system.transform"]?.(input, output);

      expect(searchSpy).toHaveBeenCalledTimes(1);
    } finally {
      cleanup();
    }
  });

  it("cache hit: second call with same sessionID+phase+wave skips ctx.memory.search", async () => {
    const { testDir, cleanup } = setupTestEnvironment("sys-transform-cache-hit");
    try {
      const ctx = createMockPluginContext({
        testDir,
        state: {
          activeWorkflowId: "default",
          workflows: {
            default: createDefaultWorkflowState({ phase: "execute", currentWave: 2 }),
          },
        },
      });

      const searchSpy = spyOn(ctx.memory, "search");

      const hooks = createSystemTransformHook(ctx);
      const input = { sessionID: "sess-cache-hit", model: {} as SdkModel };

      // First call — cache miss
      await hooks["experimental.chat.system.transform"]?.(input, { system: [] as string[] });
      expect(searchSpy).toHaveBeenCalledTimes(1);

      // Second call — same key, should be a cache hit
      await hooks["experimental.chat.system.transform"]?.(input, { system: [] as string[] });
      expect(searchSpy).toHaveBeenCalledTimes(1); // still 1, not 2
    } finally {
      cleanup();
    }
  });

  it("different phase produces a new cache key → cache miss → search called again", async () => {
    const { testDir, cleanup } = setupTestEnvironment("sys-transform-cache-phase");
    try {
      const ctx = createMockPluginContext({
        testDir,
        state: {
          activeWorkflowId: "default",
          workflows: {
            default: createDefaultWorkflowState({ phase: "execute", currentWave: 1 }),
          },
        },
      });

      const searchSpy = spyOn(ctx.memory, "search");
      const hooks = createSystemTransformHook(ctx);

      // First call — execute phase
      await hooks["experimental.chat.system.transform"]?.(
        { sessionID: "sess-phase-test", model: {} as SdkModel },
        { system: [] as string[] },
      );
      expect(searchSpy).toHaveBeenCalledTimes(1);

      // Mutate workflow to a different phase
      ctx.stateManager.updateWorkflow({ phase: "plan" });

      // Second call — different phase → different cache key → cache miss
      await hooks["experimental.chat.system.transform"]?.(
        { sessionID: "sess-phase-test", model: {} as SdkModel },
        { system: [] as string[] },
      );
      expect(searchSpy).toHaveBeenCalledTimes(2);
    } finally {
      cleanup();
    }
  });

  it("clearMemoryCache() resets the cache so next call is a miss", async () => {
    const { testDir, cleanup } = setupTestEnvironment("sys-transform-clear-cache");
    try {
      const ctx = createMockPluginContext({
        testDir,
        state: {
          activeWorkflowId: "default",
          workflows: {
            default: createDefaultWorkflowState({ phase: "plan", currentWave: 0 }),
          },
        },
      });

      const searchSpy = spyOn(ctx.memory, "search");
      const hooks = createSystemTransformHook(ctx);
      const input = { sessionID: "sess-clear", model: {} as SdkModel };

      // First call — cache miss
      await hooks["experimental.chat.system.transform"]?.(input, { system: [] as string[] });
      expect(searchSpy).toHaveBeenCalledTimes(1);

      // Second call — cache hit, no new search
      await hooks["experimental.chat.system.transform"]?.(input, { system: [] as string[] });
      expect(searchSpy).toHaveBeenCalledTimes(1);

      // Clear the cache
      clearMemoryCache();

      // Third call — cache was cleared → miss → search called again
      await hooks["experimental.chat.system.transform"]?.(input, { system: [] as string[] });
      expect(searchSpy).toHaveBeenCalledTimes(2);
    } finally {
      cleanup();
    }
  });

  it("TTL expiry produces a cache miss on next call", async () => {
    const { testDir, cleanup } = setupTestEnvironment("sys-transform-ttl");
    try {
      const ctx = createMockPluginContext({
        testDir,
        state: {
          activeWorkflowId: "default",
          workflows: {
            default: createDefaultWorkflowState({ phase: "execute", currentWave: 3 }),
          },
        },
      });

      const searchSpy = spyOn(ctx.memory, "search");
      const hooks = createSystemTransformHook(ctx);
      const input = { sessionID: "sess-ttl", model: {} as SdkModel };

      // First call — cache miss, entry stored
      await hooks["experimental.chat.system.transform"]?.(input, { system: [] as string[] });
      expect(searchSpy).toHaveBeenCalledTimes(1);

      // Manually expire the cache entry by backdating its timestamp
      // Access the module-level cache via clearMemoryCache + re-insert with old timestamp
      // Strategy: clear cache and re-populate with an expired entry by calling the hook
      // with a manipulated Date.now. We use clearMemoryCache + Date mock approach.
      const realDateNow = Date.now;
      // Simulate 31 seconds have passed (TTL is 30s)
      Date.now = () => realDateNow() + 31_000;

      try {
        // Second call — TTL expired → cache miss → search called again
        await hooks["experimental.chat.system.transform"]?.(input, { system: [] as string[] });
        expect(searchSpy).toHaveBeenCalledTimes(2);
      } finally {
        Date.now = realDateNow;
      }
    } finally {
      cleanup();
    }
  });
});
