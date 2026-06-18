import { describe, expect, it, spyOn } from "bun:test";
import type { SdkModel } from "../core/sdk-compat.js";
import type { MemoryEntry } from "../core/types.js";
import {
  createDefaultWorkflowState,
  createMockPluginContext,
  setupTestEnvironment,
} from "../test-utils.js";
import {
  buildMemoryBlock,
  buildStateBlock,
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
// buildStateBlock
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

// ---------------------------------------------------------------------------
// createSystemTransformHook (integration)
// ---------------------------------------------------------------------------

describe("createSystemTransformHook", () => {
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
});
