import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createGoopDelegateTool } from "./index.js";
import {
  createMockPluginContext,
  createMockToolContext,
  createMockResource,
  setupTestEnvironment,
  type PluginContext,
} from "../../test-utils.js";

function extractDelegationPayload(result: string): Record<string, unknown> {
  const match = result.match(/<goop_delegation>\n([\s\S]*?)\n<\/goop_delegation>/);
  expect(match).toBeTruthy();
  return JSON.parse(match?.[1] ?? "{}");
}

describe("goop_delegate search provider substitution", () => {
  let cleanup: () => void;
  let toolContext: ReturnType<typeof createMockToolContext>;
  let testDir: string;

  beforeEach(() => {
    const env = setupTestEnvironment("goop-delegate-test");
    testDir = env.testDir;
    cleanup = env.cleanup;
    toolContext = createMockToolContext({ directory: testDir, worktree: testDir });
  });

  afterEach(() => {
    cleanup();
  });

  function createContext(searchProvider?: "exa" | "brave"): PluginContext {
    return createMockPluginContext({
      testDir,
      config: {
        mcp: searchProvider ? { searchProvider } : undefined,
      },
      resources: [
        createMockResource({
          name: "goop-researcher",
          type: "agent",
          frontmatter: {
            name: "goop-researcher",
            description: "Research specialist",
            model: "anthropic/claude-sonnet-4-5",
            tools: ["read", "web_search_exa", "company_research_exa", "get_code_context_exa"],
            skills: [],
            references: [],
          },
          body: [
            "Use web_search_exa for discovery.",
            "Use company_research_exa for company research.",
            "Use get_code_context_exa for code examples.",
            "Prioritize Exa for broad web scans.",
          ].join("\n"),
        }),
      ],
    });
  }

  it("keeps Exa defaults when provider is unset", async () => {
    const ctx = createContext(undefined);
    const tool = createGoopDelegateTool(ctx);

    const result = await tool.execute(
      {
        agent: "goop-researcher",
        prompt: "Investigate test topic",
      },
      toolContext
    );

    const payload = extractDelegationPayload(result);
    const composedPrompt = String(payload.composedPrompt ?? "");
    const agentPromptSection = composedPrompt.split("## Planning Files")[0] ?? "";

    expect(agentPromptSection).toContain("web_search_exa");
    expect(agentPromptSection).toContain("company_research_exa");
    expect(agentPromptSection).toContain("get_code_context_exa");
    expect(agentPromptSection).toContain("Exa");
    expect(agentPromptSection).not.toContain("brave_web_search");
    expect(agentPromptSection).not.toContain("Brave Search");
  });

  it("substitutes Exa search references for Brave", async () => {
    const ctx = createContext("brave");
    const tool = createGoopDelegateTool(ctx);

    const result = await tool.execute(
      {
        agent: "goop-researcher",
        prompt: "Investigate test topic",
      },
      toolContext
    );

    const payload = extractDelegationPayload(result);
    const composedPrompt = String(payload.composedPrompt ?? "");
    const agentPromptSection = composedPrompt.split("## Planning Files")[0] ?? "";

    expect(agentPromptSection).toContain("brave_web_search");
    expect(agentPromptSection).toContain("Brave Search");
    expect(agentPromptSection).not.toContain("web_search_exa");
    expect(agentPromptSection).not.toContain("company_research_exa");
    expect(agentPromptSection).not.toContain("get_code_context_exa");
    expect(agentPromptSection).not.toContain(" Exa ");
  });
});

describe("goop_delegate session context injection", () => {
  let cleanup: () => void;
  let toolContext: ReturnType<typeof createMockToolContext>;
  let testDir: string;

  beforeEach(() => {
    const env = setupTestEnvironment("goop-delegate-session-test");
    testDir = env.testDir;
    cleanup = env.cleanup;
    toolContext = createMockToolContext({ directory: testDir, worktree: testDir });
  });

  afterEach(() => {
    cleanup();
  });

  function createContext(): PluginContext {
    return createMockPluginContext({
      testDir,
      resources: [
        createMockResource({
          name: "goop-executor",
          type: "agent",
          frontmatter: {
            name: "goop-executor",
            description: "Executor agent",
            model: "anthropic/claude-sonnet-4-5",
            tools: ["read"],
            skills: [],
            references: [],
          },
          body: "You are the executor.",
        }),
      ],
    });
  }

  it("includes session_id and session-scoped planning paths when session is active", async () => {
    const ctx = createContext();
    ctx.sessionId = "feature-auth";
    const tool = createGoopDelegateTool(ctx);

    const result = await tool.execute(
      {
        agent: "goop-executor",
        prompt: "Implement auth endpoint",
      },
      toolContext,
    );

    const payload = extractDelegationPayload(result);
    const composedPrompt = String(payload.composedPrompt ?? "");

    expect(payload.session_id).toBe("feature-auth");
    expect(composedPrompt).toContain(".goopspec/sessions/feature-auth/SPEC.md");
    expect(composedPrompt).toContain(".goopspec/sessions/feature-auth/BLUEPRINT.md");
    expect(composedPrompt).toContain(".goopspec/sessions/feature-auth/CHRONICLE.md");
    expect(composedPrompt).toContain(".goopspec/sessions/feature-auth/RESEARCH.md");
    expect(composedPrompt).toContain("## Session Context");
    expect(composedPrompt).toContain("sessionId: `feature-auth`");
  });

  it("keeps legacy delegation payload and root planning paths when no session is active", async () => {
    const ctx = createContext();
    const tool = createGoopDelegateTool(ctx);

    const result = await tool.execute(
      {
        agent: "goop-executor",
        prompt: "Implement auth endpoint",
      },
      toolContext,
    );

    const payload = extractDelegationPayload(result);
    const composedPrompt = String(payload.composedPrompt ?? "");

    expect(payload.session_id).toBeUndefined();
    expect(composedPrompt).toContain(".goopspec/SPEC.md");
    expect(composedPrompt).toContain(".goopspec/BLUEPRINT.md");
    expect(composedPrompt).toContain(".goopspec/CHRONICLE.md");
    expect(composedPrompt).toContain(".goopspec/RESEARCH.md");
    expect(composedPrompt).not.toContain(".goopspec/sessions/");
  });
});

describe("bootstrap enforcement", () => {
  let cleanup: () => void;
  let toolContext: ReturnType<typeof createMockToolContext>;
  let testDir: string;

  beforeEach(() => {
    const env = setupTestEnvironment("goop-delegate-bootstrap-test");
    testDir = env.testDir;
    cleanup = env.cleanup;
    toolContext = createMockToolContext({ directory: testDir, worktree: testDir });
  });

  afterEach(() => {
    cleanup();
  });

  function createContext(): PluginContext {
    return createMockPluginContext({
      testDir,
      resources: [
        createMockResource({
          name: "goop-executor",
          type: "agent",
          frontmatter: {
            name: "goop-executor",
            description: "Executor agent",
            model: "anthropic/claude-sonnet-4-5",
            tools: ["read"],
            skills: [],
            references: [],
          },
          body: "You are the executor.",
        }),
      ],
    });
  }

  it("includes mandatory bootstrap block in agent prompt", async () => {
    const ctx = createContext();
    const tool = createGoopDelegateTool(ctx);

    const result = await tool.execute(
      {
        agent: "goop-executor",
        prompt: "Implement auth endpoint",
      },
      toolContext,
    );

    const payload = extractDelegationPayload(result);
    const composedPrompt = String(payload.composedPrompt ?? "");

    expect(composedPrompt).toContain("MANDATORY FIRST STEP");
  });

  it("bootstrap block appears before user task content", async () => {
    const userTask = "Implement auth endpoint";
    const ctx = createContext();
    const tool = createGoopDelegateTool(ctx);

    const result = await tool.execute(
      {
        agent: "goop-executor",
        prompt: userTask,
      },
      toolContext,
    );

    const payload = extractDelegationPayload(result);
    const composedPrompt = String(payload.composedPrompt ?? "");
    const bootstrapIndex = composedPrompt.indexOf("## ⚠️ MANDATORY FIRST STEP");
    const userTaskIndex = composedPrompt.indexOf(userTask);

    expect(bootstrapIndex).toBeGreaterThan(-1);
    expect(userTaskIndex).toBeGreaterThan(-1);
    expect(bootstrapIndex).toBeLessThan(userTaskIndex);
  });

  it("delegation includes bootstrap boundary text", async () => {
    const ctx = createContext();
    const tool = createGoopDelegateTool(ctx);

    const result = await tool.execute(
      {
        agent: "goop-executor",
        prompt: "Implement auth endpoint",
      },
      toolContext,
    );

    expect(result).toContain("DO NOT skip bootstrap");
  });

  it("includes goop_state bootstrap step in agent prompt", async () => {
    const ctx = createContext();
    const tool = createGoopDelegateTool(ctx);

    const result = await tool.execute(
      {
        agent: "goop-executor",
        prompt: "Implement auth endpoint",
      },
      toolContext,
    );

    const payload = extractDelegationPayload(result);
    const composedPrompt = String(payload.composedPrompt ?? "");

    expect(composedPrompt).toContain('goop_state({ action: "get" })');
  });
});
