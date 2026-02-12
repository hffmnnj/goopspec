/**
 * Tests for Orchestrator Enforcement Hooks
 * @module hooks/orchestrator-enforcement.test
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import type { Part } from "@opencode-ai/sdk";
import {
  createOrchestratorEnforcementHooks,
  isOrchestrator,
  wouldBlockPath,
  isBlockedTool,
  getToolCategory,
  detectIntent,
  clearExplorationTracking,
} from "./orchestrator-enforcement.js";
import {
  createMockPluginContext,
  setupTestEnvironment,
  type PluginContext,
} from "../test-utils.js";

describe("orchestrator-enforcement hooks", () => {
  let ctx: PluginContext;
  let cleanup: () => void;

  beforeEach(() => {
    const env = setupTestEnvironment("enforcement-test");
    cleanup = env.cleanup;
    ctx = createMockPluginContext({ testDir: env.testDir });
  });

  afterEach(() => {
    clearExplorationTracking("test-explore");
    clearExplorationTracking("test-explore-nudge");
    clearExplorationTracking("explore-task-test");
    clearExplorationTracking("agent-select-explore");
    cleanup();
  });

  describe("isOrchestrator", () => {
    it("returns true for goopspec agent", () => {
      expect(isOrchestrator("goopspec")).toBe(true);
      expect(isOrchestrator("GOOPSPEC")).toBe(true);
    });

    it("returns true for orchestrator variants", () => {
      expect(isOrchestrator("goop-orchestrator")).toBe(true);
      expect(isOrchestrator("my-orchestrator")).toBe(true);
    });

    it("returns false for other agents", () => {
      expect(isOrchestrator("goop-executor")).toBe(false);
      expect(isOrchestrator("general")).toBe(false);
      expect(isOrchestrator(undefined)).toBe(false);
    });
  });

  describe("wouldBlockPath", () => {
    it("blocks TypeScript files in src/", () => {
      expect(wouldBlockPath("src/index.ts")).toBe(true);
      expect(wouldBlockPath("src/hooks/test.ts")).toBe(true);
      expect(wouldBlockPath("src/deep/nested/file.tsx")).toBe(true);
    });

    it("blocks JavaScript files in lib/", () => {
      expect(wouldBlockPath("lib/utils.js")).toBe(true);
      expect(wouldBlockPath("lib/helpers.mjs")).toBe(true);
    });

    it("allows markdown files everywhere", () => {
      expect(wouldBlockPath("src/README.md")).toBe(false);
      expect(wouldBlockPath("lib/CHANGELOG.md")).toBe(false);
    });

    it("allows .goopspec/ files", () => {
      expect(wouldBlockPath(".goopspec/SPEC.md")).toBe(false);
      expect(wouldBlockPath(".goopspec/config.json")).toBe(false);
    });

    it("allows files outside protected dirs", () => {
      expect(wouldBlockPath("scripts/build.ts")).toBe(false);
      expect(wouldBlockPath("test.ts")).toBe(false);
    });
  });

  describe("isBlockedTool", () => {
    it("returns true for research tools", () => {
      expect(isBlockedTool("exa_web_search_exa")).toBe(true);
      expect(isBlockedTool("mcp_google_search")).toBe(true);
      expect(isBlockedTool("mcp_webfetch")).toBe(true);
    });

    it("returns false for non-research tools", () => {
      expect(isBlockedTool("mcp_read")).toBe(false);
      expect(isBlockedTool("mcp_edit")).toBe(false);
      expect(isBlockedTool("task")).toBe(false);
    });
  });

  describe("getToolCategory", () => {
    it("returns research for research tools", () => {
      expect(getToolCategory("exa_web_search_exa")).toBe("research");
      expect(getToolCategory("mcp_google_search")).toBe("research");
    });

    it("returns exploration for exploration tools", () => {
      expect(getToolCategory("mcp_grep")).toBe("exploration");
      expect(getToolCategory("mcp_glob")).toBe("exploration");
    });

    it("returns null for other tools", () => {
      expect(getToolCategory("mcp_read")).toBe(null);
      expect(getToolCategory("task")).toBe(null);
    });
  });

  describe("createOrchestratorEnforcementHooks", () => {
    it("creates permission.ask hook", () => {
      const hooks = createOrchestratorEnforcementHooks(ctx);
      expect(hooks["permission.ask"]).toBeDefined();
      expect(typeof hooks["permission.ask"]).toBe("function");
    });

    it("creates tool.execute.after hook", () => {
      const hooks = createOrchestratorEnforcementHooks(ctx);
      expect(hooks["tool.execute.after"]).toBeDefined();
      expect(typeof hooks["tool.execute.after"]).toBe("function");
    });

    it("creates chat.message hook", () => {
      const hooks = createOrchestratorEnforcementHooks(ctx);
      expect(hooks["chat.message"]).toBeDefined();
      expect(typeof hooks["chat.message"]).toBe("function");
    });
  });

  describe("chat.message hook", () => {
    it("does not inject parts for orchestrator intent-like messages", async () => {
      const hooks = createOrchestratorEnforcementHooks(ctx);
      const initialParts = [
        { type: "text", text: "research compare find trace" },
      ] as unknown as Part[];
      const output = {
        parts: initialParts,
      };

      await hooks["chat.message"](
        {
          sessionID: "chat-session",
          agent: "goopspec",
          messageID: "m1",
        },
        output
      );

      expect(output.parts).toBe(initialParts);
      expect(output.parts).toHaveLength(1);
    });

    it("does not modify parts for non-orchestrator messages", async () => {
      const hooks = createOrchestratorEnforcementHooks(ctx);
      const initialParts = [
        { type: "text", text: "where is the router defined" },
      ] as unknown as Part[];
      const output = {
        parts: initialParts,
      };

      await hooks["chat.message"](
        {
          sessionID: "chat-session-non-orch",
          agent: "goop-executor",
          messageID: "m2",
        },
        output
      );

      expect(output.parts).toBe(initialParts);
      expect(output.parts).toHaveLength(1);
    });
  });

  describe("permission.ask hook", () => {
    it("denies edit on code file for orchestrator", async () => {
      const hooks = createOrchestratorEnforcementHooks(ctx);
      const output = { status: "ask" as const };
      
      await hooks["permission.ask"](
        {
          tool: "edit",
          sessionID: "test-session",
          path: "src/index.ts",
          agent: "goopspec",
        },
        output
      );
      
      expect(output.status).toBe("deny");
    });

    it("uses warn enforcement level from config", async () => {
      const warnCtx = createMockPluginContext({
        testDir: ctx.input.directory,
        config: { enforcement: "warn" },
      });
      const hooks = createOrchestratorEnforcementHooks(warnCtx);
      const output = { status: "ask" as const };

      await hooks["permission.ask"](
        {
          tool: "edit",
          sessionID: "warn-session",
          path: "src/index.ts",
          agent: "goopspec",
        },
        output
      );

      expect(output.status).toBe("ask");
    });

    it("uses strict enforcement level from config", async () => {
      const strictCtx = createMockPluginContext({
        testDir: ctx.input.directory,
        config: { enforcement: "strict" },
      });
      const hooks = createOrchestratorEnforcementHooks(strictCtx);
      const output = { status: "ask" as const };

      await hooks["permission.ask"](
        {
          tool: "edit",
          sessionID: "strict-session",
          path: "src/index.ts",
          agent: "goopspec",
        },
        output
      );

      expect(output.status).toBe("deny");
    });

    it("allows edit on code file for non-orchestrator", async () => {
      const hooks = createOrchestratorEnforcementHooks(ctx);
      const output = { status: "ask" as const };
      
      await hooks["permission.ask"](
        {
          tool: "edit",
          sessionID: "test-session",
          path: "src/index.ts",
          agent: "goop-executor",
        },
        output
      );
      
      expect(output.status).toBe("ask");  // Unchanged
    });

    it("allows edit on markdown for orchestrator", async () => {
      const hooks = createOrchestratorEnforcementHooks(ctx);
      const output = { status: "ask" as const };
      
      await hooks["permission.ask"](
        {
          tool: "edit",
          sessionID: "test-session",
          path: ".goopspec/SPEC.md",
          agent: "goopspec",
        },
        output
      );
      
      expect(output.status).toBe("ask");  // Unchanged
    });

    it("logs to ADL when blocking", async () => {
      const hooks = createOrchestratorEnforcementHooks(ctx);
      const output = { status: "ask" as const };
      
      await hooks["permission.ask"](
        {
          tool: "write",
          sessionID: "test-session",
          path: "src/new-file.ts",
          agent: "goopspec",
        },
        output
      );
      
      const adl = ctx.stateManager.getADL();
      expect(adl).toContain("Orchestrator code modification blocked");
    });
  });

  describe("permission.ask hook (research tool blocking)", () => {
    it("denies research tool for orchestrator", async () => {
      const hooks = createOrchestratorEnforcementHooks(ctx);
      const output = { status: "ask" as const };

      await hooks["permission.ask"](
        {
          tool: "mcp_google_search",
          sessionID: "test-session",
          agent: "goopspec",
        },
        output
      );

      expect(output.status).toBe("deny");
    });

    it("allows research tool for non-orchestrator", async () => {
      const hooks = createOrchestratorEnforcementHooks(ctx);
      const output = { status: "ask" as const };

      await hooks["permission.ask"](
        {
          tool: "mcp_google_search",
          sessionID: "test-session",
          agent: "goop-researcher",
        },
        output
      );

      expect(output.status).toBe("ask");
    });
  });

  describe("tool.execute.after hook (direct task guidance)", () => {
    it("does not inject delegation wrapper instructions for task tool", async () => {
      const hooks = createOrchestratorEnforcementHooks(ctx);
      const output = {
        title: "Task",
        output: "Delegated task completed successfully",
        metadata: {},
      };
      
      await hooks["tool.execute.after"](
        { tool: "task", sessionID: "test-session", callID: "call-1" },
        output
      );

      // Direct task usage should not trigger any wrapper-style guidance
      expect(output.output).not.toContain("MANDATORY NEXT STEP");
      expect(output.output).not.toContain("Two-Step Delegation Flow");
      expect(output.output).not.toContain("goop_delegate");
    });

    it("clears exploration tracking when task is called", async () => {
      const hooks = createOrchestratorEnforcementHooks(ctx);

      clearExplorationTracking("test-session");
      await hooks["tool.execute.after"](
        { tool: "mcp_grep", sessionID: "test-session", callID: "call-1" },
        { title: "Grep", output: "results", metadata: {} }
      );
      await hooks["tool.execute.after"](
        { tool: "mcp_grep", sessionID: "test-session", callID: "call-2" },
        { title: "Grep", output: "results", metadata: {} }
      );

      const taskOutput = { title: "Task", output: "done", metadata: {} };
      await hooks["tool.execute.after"](
        { tool: "task", sessionID: "test-session", callID: "call-2" },
        taskOutput
      );

      const output = { title: "Grep", output: "results", metadata: {} };
      await hooks["tool.execute.after"](
        { tool: "mcp_grep", sessionID: "test-session", callID: "call-3" },
        output
      );

      expect(output.output).not.toContain("Consider Delegating Exploration");
    });
  });

  describe("direct task delegation flow", () => {
    it("generates delegation guidance referencing task() not goop_delegate()", async () => {
      const hooks = createOrchestratorEnforcementHooks(ctx);
      const permOutput = { status: "ask" as const };
      await hooks["permission.ask"](
        {
          tool: "mcp_edit",
          sessionID: "direct-task-test",
          path: "src/feature.ts",
          agent: "goopspec",
        },
        permOutput
      );
      expect(permOutput.status).toBe("deny");

      const execOutput = { title: "Edit", output: "", metadata: {} };
      await hooks["tool.execute.after"](
        { tool: "mcp_edit", sessionID: "direct-task-test", callID: "call-1" },
        execOutput
      );

      // Guidance must reference direct task() usage
      expect(execOutput.output).toContain("task(");
      expect(execOutput.output).toContain("subagent_type");
      // Must NOT reference the removed wrapper
      expect(execOutput.output).not.toContain("goop_delegate(");
      expect(execOutput.output).not.toContain("goop_delegate");
    });

    it("research delegation guidance references task() directly", async () => {
      const hooks = createOrchestratorEnforcementHooks(ctx);
      const permOutput = { status: "ask" as const };
      await hooks["permission.ask"](
        {
          tool: "mcp_google_search",
          sessionID: "research-task-test",
          agent: "goopspec",
        },
        permOutput
      );
      expect(permOutput.status).toBe("deny");

      const execOutput = { title: "Search", output: "", metadata: {} };
      await hooks["tool.execute.after"](
        { tool: "mcp_google_search", sessionID: "research-task-test", callID: "call-1" },
        execOutput
      );

      expect(execOutput.output).toContain("task(");
      expect(execOutput.output).toContain("goop-researcher");
      expect(execOutput.output).not.toContain("goop_delegate");
    });

    it("exploration nudge guidance references task() directly", async () => {
      const hooks = createOrchestratorEnforcementHooks(ctx);
      clearExplorationTracking("explore-task-test");

      for (let i = 0; i < 3; i++) {
        const output = { title: "Grep", output: "results", metadata: {} };
        await hooks["tool.execute.after"](
          { tool: "mcp_grep", sessionID: "explore-task-test", callID: String(i) },
          output
        );

        if (i === 2) {
          expect(output.output).toContain("task(");
          expect(output.output).toContain("goop-explorer");
          expect(output.output).not.toContain("goop_delegate");
        }
      }

      clearExplorationTracking("explore-task-test");
    });
  });

  describe("agent selection in delegation guidance", () => {
    it("selects executor tier for code file blocks", async () => {
      const hooks = createOrchestratorEnforcementHooks(ctx);
      const permOutput = { status: "ask" as const };
      await hooks["permission.ask"](
        {
          tool: "mcp_edit",
          sessionID: "agent-select-code",
          path: "src/index.ts",
          agent: "goopspec",
        },
        permOutput
      );

      const execOutput = { title: "Edit", output: "", metadata: {} };
      await hooks["tool.execute.after"](
        { tool: "mcp_edit", sessionID: "agent-select-code", callID: "call-1" },
        execOutput
      );

      expect(execOutput.output).toContain("goop-executor");
    });

    it("selects goop-researcher for research tool blocks", async () => {
      const hooks = createOrchestratorEnforcementHooks(ctx);
      const permOutput = { status: "ask" as const };
      await hooks["permission.ask"](
        {
          tool: "exa_web_search_exa",
          sessionID: "agent-select-research",
          agent: "goopspec",
        },
        permOutput
      );

      const execOutput = { title: "Search", output: "", metadata: {} };
      await hooks["tool.execute.after"](
        { tool: "exa_web_search_exa", sessionID: "agent-select-research", callID: "call-1" },
        execOutput
      );

      expect(execOutput.output).toContain("goop-researcher");
    });

    it("selects goop-explorer for exploration nudges", async () => {
      const hooks = createOrchestratorEnforcementHooks(ctx);
      clearExplorationTracking("agent-select-explore");

      for (let i = 0; i < 3; i++) {
        const output = { title: "Glob", output: "results", metadata: {} };
        await hooks["tool.execute.after"](
          { tool: "mcp_glob", sessionID: "agent-select-explore", callID: String(i) },
          output
        );

        if (i === 2) {
          expect(output.output).toContain("goop-explorer");
        }
      }

      clearExplorationTracking("agent-select-explore");
    });
  });

  describe("orchestrator-enforcement integration", () => {
    let hooks: ReturnType<typeof createOrchestratorEnforcementHooks>;

    beforeEach(() => {
      hooks = createOrchestratorEnforcementHooks(ctx);
    });

    describe("research tool blocking flow", () => {
      it("blocks research tool and provides guidance", async () => {
        const permOutput = { status: "ask" as const };
        await hooks["permission.ask"](
          {
            tool: "mcp_google_search",
            sessionID: "integration-test",
            agent: "goopspec",
          },
          permOutput
        );
        expect(permOutput.status).toBe("deny");

        const execOutput = { title: "Search", output: "", metadata: {} };
        await hooks["tool.execute.after"](
          { tool: "mcp_google_search", sessionID: "integration-test", callID: "1" },
          execOutput
        );
        expect(execOutput.output).toContain("goop-researcher");
        expect(execOutput.output).toContain("task(");
      });

      it("allows research tool for subagents", async () => {
        const output = { status: "ask" as const };

        await hooks["permission.ask"](
          {
            tool: "mcp_google_search",
            sessionID: "subagent-test",
            agent: "goop-researcher",
          },
          output
        );

        expect(output.status).toBe("ask");
      });
    });

    describe("code file blocking flow", () => {
      it("blocks code file and provides delegation guidance", async () => {
        const permOutput = { status: "ask" as const };
        await hooks["permission.ask"](
          {
            tool: "mcp_edit",
            sessionID: "code-block-test",
            path: "src/index.ts",
            agent: "goopspec",
          },
          permOutput
        );
        expect(permOutput.status).toBe("deny");

        const execOutput = { title: "Edit", output: "", metadata: {} };
        await hooks["tool.execute.after"](
          { tool: "mcp_edit", sessionID: "code-block-test", callID: "1" },
          execOutput
        );
        expect(execOutput.output).toContain("goop-executor");
      });
    });

    describe("exploration pattern nudge flow", () => {
      it("nudges after multiple exploration tool uses", async () => {
        clearExplorationTracking("exploration-flow-test");

        for (let i = 0; i < 3; i += 1) {
          const output = { title: "Grep", output: "found matches", metadata: {} };
          await hooks["tool.execute.after"](
            { tool: "mcp_grep", sessionID: "exploration-flow-test", callID: String(i) },
            output
          );

          if (i === 2) {
            expect(output.output).toContain("Consider Delegating Exploration");
            expect(output.output).toContain("goop-explorer");
          }
        }
      });

      it("clears exploration tracking after delegation", async () => {
        clearExplorationTracking("clear-test");

        for (let i = 0; i < 2; i += 1) {
          const output = { title: "Grep", output: "results", metadata: {} };
          await hooks["tool.execute.after"](
            { tool: "mcp_grep", sessionID: "clear-test", callID: String(i) },
            output
          );
        }

        const taskOutput = { title: "Task", output: "done", metadata: {} };
        await hooks["tool.execute.after"](
          { tool: "task", sessionID: "clear-test", callID: "task-1" },
          taskOutput
        );

        const output = { title: "Grep", output: "results", metadata: {} };
        await hooks["tool.execute.after"](
          { tool: "mcp_grep", sessionID: "clear-test", callID: "3" },
          output
        );
        expect(output.output).not.toContain("Consider Delegating Exploration");
      });
    });

    describe("delegation guidance quality", () => {
      it("provides direct task prompt requirements after code block", async () => {
        const permOutput = { status: "ask" as const };
        await hooks["permission.ask"](
          {
            tool: "mcp_edit",
            sessionID: "guidance-quality",
            path: "src/hooks/orchestrator-enforcement.ts",
            agent: "goopspec",
          },
          permOutput
        );
        expect(permOutput.status).toBe("deny");

        const execOutput = { title: "Edit", output: "", metadata: {} };
        await hooks["tool.execute.after"](
          { tool: "mcp_edit", sessionID: "guidance-quality", callID: "call-1" },
          execOutput
        );

        expect(execOutput.output).toContain("task(");
        expect(execOutput.output).toContain("Task Intent");
        expect(execOutput.output).toContain("Expected Output");
        expect(execOutput.output).toContain("Required Context");
        expect(execOutput.output).toContain("SPEC must-have");
        expect(execOutput.output).toContain("BLUEPRINT task");
        expect(execOutput.output).toContain("Constraints");
        expect(execOutput.output).toContain("Verification");
      });
    });
  });

  describe("detectIntent", () => {
    it("detects research intent", () => {
      expect(detectIntent("research the best React libraries").type).toBe("research");
      expect(detectIntent("compare Redux and Zustand").type).toBe("research");
      expect(detectIntent("evaluate this approach").type).toBe("research");
    });

    it("detects exploration intent", () => {
      expect(detectIntent("where is the config defined").type).toBe("exploration");
      expect(detectIntent("how does the router work").type).toBe("exploration");
      expect(detectIntent("find where this function is called").type).toBe("exploration");
    });

    it("returns null for unrecognized intents", () => {
      expect(detectIntent("hello world").type).toBe(null);
      expect(detectIntent("implement feature X").type).toBe(null);
    });
  });

  describe("exploration tracking", () => {
    it("does not nudge before threshold", async () => {
      const hooks = createOrchestratorEnforcementHooks(ctx);
      const output = { title: "Grep", output: "results", metadata: {} };

      await hooks["tool.execute.after"](
        { tool: "mcp_grep", sessionID: "test-explore", callID: "1" },
        output
      );
      await hooks["tool.execute.after"](
        { tool: "mcp_glob", sessionID: "test-explore", callID: "2" },
        output
      );

      expect(output.output).not.toContain("Consider Delegating Exploration");
    });

    it("nudges after threshold reached", async () => {
      const hooks = createOrchestratorEnforcementHooks(ctx);

      for (let i = 0; i < 3; i++) {
        const output = { title: "Grep", output: "results", metadata: {} };
        await hooks["tool.execute.after"](
          { tool: "mcp_grep", sessionID: "test-explore-nudge", callID: String(i) },
          output
        );

        if (i === 2) {
          expect(output.output).toContain("Consider Delegating Exploration");
        }
      }
    });
  });

});
