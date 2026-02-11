/**
 * Tests for Slash Command Tool - Agent Spawning Feature
 * @module tools/slashcommand/index.test
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createSlashcommandTool } from "./index.js";
import { createResourceResolver } from "../../core/resolver.js";
import { createStateManager } from "../../features/state-manager/manager.js";
import {
  createMockToolContext,
  setupTestEnvironment,
  type PluginContext,
} from "../../test-utils.js";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { createSession } from "../../features/session/index.js";

// Project root directory (where commands/ exists)
const PROJECT_DIR = process.cwd();

/**
 * Create a context using real resolver for the project
 */
function createProjectContext(): PluginContext {
  return {
    input: {
      client: {},
      project: { name: "goopspec" },
      directory: PROJECT_DIR,
      worktree: PROJECT_DIR,
      serverUrl: new URL("http://localhost:3000"),
    },
    config: {},
    resolver: createResourceResolver(PROJECT_DIR),
    stateManager: createStateManager(PROJECT_DIR, "goopspec"),
  };
}

/**
 * Create a context with custom commands in test directory
 */
function createCustomContext(testDir: string): PluginContext {
  return {
    input: {
      client: {},
      project: { name: "test-project" },
      directory: testDir,
      worktree: testDir,
      serverUrl: new URL("http://localhost:3000"),
    },
    config: {},
    resolver: createResourceResolver(testDir),
    stateManager: createStateManager(testDir, "test-project"),
  };
}

describe("slashcommand tool", () => {
  describe("basic functionality (with real commands)", () => {
    let ctx: PluginContext;

    beforeEach(() => {
      ctx = createProjectContext();
    });

    it("returns command content for valid command", async () => {
      const tool = createSlashcommandTool(ctx);
      const result = await tool.execute(
        { command: "goop-status" },
        createMockToolContext()
      );
      
      expect(result).toContain("/goop-status Command");
      expect(result).toContain("Instructions");
    });

    it("suggests similar commands for typos", async () => {
      const tool = createSlashcommandTool(ctx);
      const result = await tool.execute(
        { command: "goop-stat" },
        createMockToolContext()
      );
      
      expect(result).toContain("Did you mean");
      expect(result).toContain("goop-status");
    });

    it("returns error for unknown command", async () => {
      const tool = createSlashcommandTool(ctx);
      const result = await tool.execute(
        { command: "unknown-command-xyz" },
        createMockToolContext()
      );
      
      expect(result).toContain("not found");
    });
  });

  describe("agent spawning (with custom test commands)", () => {
    let ctx: PluginContext;
    let testDir: string;
    let cleanup: () => void;

    beforeEach(() => {
      const env = setupTestEnvironment("slashcommand-spawn-test");
      cleanup = env.cleanup;
      testDir = env.testDir;
      
      // Project overrides go in .goopspec/commands/ (not commands/)
      const commandsDir = join(testDir, ".goopspec", "commands");
      mkdirSync(commandsDir, { recursive: true });
      
      // Create a test command with spawn enabled
      writeFileSync(
        join(commandsDir, "test-spawn.md"),
        `---
name: test-spawn
description: Test spawning agent
agent: goop-executor
spawn: true
---

# Test Spawn Command

This command should spawn an agent.
`
      );
      
      // Create a command without spawn
      writeFileSync(
        join(commandsDir, "test-no-spawn.md"),
        `---
name: test-no-spawn
description: Test without spawning
agent: goop-executor
---

# Test No Spawn Command

This command should NOT spawn an agent.
`
      );
      
      ctx = createCustomContext(testDir);
    });

    afterEach(() => cleanup());

    it("includes task invocation for spawn commands", async () => {
      const tool = createSlashcommandTool(ctx);
      const result = await tool.execute(
        { command: "test-spawn" },
        createMockToolContext()
      );
      
      expect(result).toContain("AUTOMATIC AGENT SPAWN");
      expect(result).toContain("goop-executor");
      expect(result).toContain("task({");
      expect(result).toContain("subagent_type");
    });

    it("does not include task invocation without spawn flag", async () => {
      const tool = createSlashcommandTool(ctx);
      const result = await tool.execute(
        { command: "test-no-spawn" },
        createMockToolContext()
      );
      
      expect(result).not.toContain("AUTOMATIC AGENT SPAWN");
      expect(result).not.toContain("task({");
    });

    it("includes command arguments in spawn prompt", async () => {
      const tool = createSlashcommandTool(ctx);
      const result = await tool.execute(
        { command: "test-spawn add dark mode to settings" },
        createMockToolContext()
      );
      
      expect(result).toContain("add dark mode to settings");
    });
  });

  describe("immediate action extraction", () => {
    let ctx: PluginContext;

    beforeEach(() => {
      ctx = createProjectContext();
    });

    it("extracts immediate action and puts it at the top", async () => {
      const tool = createSlashcommandTool(ctx);
      const result = await tool.execute(
        { command: "goop-plan" },
        createMockToolContext()
      );
      
      // Should have MANDATORY section (extracted from STOP-AND-RETURN gate)
      expect(result).toContain("MANDATORY: Execute Immediately");
      expect(result).toContain("goop_state({ action: \"get\" })");
      expect(result).toContain("Do NOT process any user message");
      
      // MANDATORY should appear before Full Instructions
      const mandatoryIndex = result.indexOf("MANDATORY");
      const instructionsIndex = result.indexOf("## Full Instructions");
      expect(mandatoryIndex).toBeLessThan(instructionsIndex);
    });
  });

  describe("real commands with spawn", () => {
    let ctx: PluginContext;

    beforeEach(() => {
      ctx = createProjectContext();
    });

    it("goop-plan does NOT include spawn instruction (orchestrator-driven)", async () => {
      // goop-plan is now orchestrator-driven: the orchestrator conducts the interview
      // directly, then spawns agents only for document creation
      const tool = createSlashcommandTool(ctx);
      const result = await tool.execute(
        { command: "goop-plan" },
        createMockToolContext()
      );
      
      expect(result).not.toContain("AUTOMATIC AGENT SPAWN");
      expect(result).toContain("# /goop-plan Command");
      expect(result).toContain("Create specification and blueprint");
    });

    it("goop-execute includes spawn instruction", async () => {
      const tool = createSlashcommandTool(ctx);
      const result = await tool.execute(
        { command: "goop-execute" },
        createMockToolContext()
      );
      
      expect(result).not.toContain("AUTOMATIC AGENT SPAWN");
      expect(result).toContain("goop-executor");
    });

    it("goop-research includes spawn instruction", async () => {
      const tool = createSlashcommandTool(ctx);
      const result = await tool.execute(
        { command: "goop-research" },
        createMockToolContext()
      );
      
      expect(result).toContain("AUTOMATIC AGENT SPAWN");
      expect(result).toContain("goop-researcher");
    });
    
    it("goop-status does NOT include spawn instruction (no spawn flag)", async () => {
      const tool = createSlashcommandTool(ctx);
      const result = await tool.execute(
        { command: "goop-status" },
        createMockToolContext()
      );
      
      expect(result).not.toContain("AUTOMATIC AGENT SPAWN");
    });
  });

  describe("session context", () => {
    let ctx: PluginContext;

    beforeEach(() => {
      ctx = createProjectContext();
    });

    it("includes active session context when bound", async () => {
      ctx.sessionId = "feature-auth";

      const tool = createSlashcommandTool(ctx);
      const result = await tool.execute(
        { command: "goop-status" },
        createMockToolContext()
      );

      expect(result).toContain("Session Context");
      expect(result).toContain("Active Session");
      expect(result).toContain("feature-auth");
    });

    it("extracts requested session name for goop-discuss", async () => {
      const tool = createSlashcommandTool(ctx);
      const result = await tool.execute(
        { command: "goop-discuss feat-auth" },
        createMockToolContext()
      );

      expect(result).toContain("Session Context");
      expect(result).toContain("Requested Session");
      expect(result).toContain("feat-auth");
    });
  });

  describe("session lifecycle side-effects", () => {
    let ctx: PluginContext;
    let testDir: string;
    let cleanup: () => void;

    beforeEach(() => {
      const env = setupTestEnvironment("slashcommand-session-lifecycle");
      cleanup = env.cleanup;
      testDir = env.testDir;

      const commandsDir = join(testDir, ".goopspec", "commands");
      mkdirSync(commandsDir, { recursive: true });

      writeFileSync(
        join(commandsDir, "goop-discuss.md"),
        `---
name: goop-discuss
description: Start discussion
argument-hint: "[session-name]"
phase: discuss
---

# /goop-discuss

Discuss command.
`,
      );

      writeFileSync(
        join(commandsDir, "goop-resume.md"),
        `---
name: goop-resume
description: Resume workflow
---

# /goop-resume

Resume command.
`,
      );

      writeFileSync(
        join(commandsDir, "goop-plan.md"),
        `---
name: goop-plan
description: Plan workflow
phase: plan
---

# /goop-plan

Plan command.
`,
      );

      ctx = createCustomContext(testDir);
    });

    afterEach(() => cleanup());

    it("creates and binds session for /goop-discuss <name>", async () => {
      const tool = createSlashcommandTool(ctx);
      const result = await tool.execute(
        { command: "goop-discuss feat-auth" },
        createMockToolContext(),
      );

      expect(ctx.sessionId).toBe("feat-auth");
      expect(result).toContain("Created and bound session: feat-auth");
      expect(existsSync(join(testDir, ".goopspec", "sessions", "feat-auth"))).toBe(true);
    });

    it("binds existing session for /goop-discuss <name> when already created", async () => {
      createSession(testDir, "feat-auth");

      const tool = createSlashcommandTool(ctx);
      const result = await tool.execute(
        { command: "goop-discuss feat-auth" },
        createMockToolContext(),
      );

      expect(ctx.sessionId).toBe("feat-auth");
      expect(result).toContain("Bound existing session: feat-auth");
    });

    it("does not create session for /goop-discuss without name", async () => {
      const tool = createSlashcommandTool(ctx);
      await tool.execute({ command: "goop-discuss" }, createMockToolContext());

      expect(ctx.sessionId).toBeUndefined();
      expect(existsSync(join(testDir, ".goopspec", "sessions", "_active.json"))).toBe(false);
    });

    it("resolves and binds session for /goop-resume when sessions exist", async () => {
      createSession(testDir, "feat-auth");

      const tool = createSlashcommandTool(ctx);
      const result = await tool.execute({ command: "goop-resume" }, createMockToolContext());

      expect(ctx.sessionId).toBe("feat-auth");
      expect(result).toContain("Resolved and bound session: feat-auth");
    });

    it("falls back normally for /goop-resume when no sessions exist", async () => {
      const tool = createSlashcommandTool(ctx);
      const result = await tool.execute({ command: "goop-resume" }, createMockToolContext());

      expect(ctx.sessionId).toBeUndefined();
      expect(result).not.toContain("Resolved and bound session:");
      expect(result).toContain("# /goop-resume Command");
    });

    it("silently resolves and binds session for workflow commands with phase", async () => {
      createSession(testDir, "feat-auth");

      const tool = createSlashcommandTool(ctx);
      const result = await tool.execute({ command: "goop-plan" }, createMockToolContext());

      expect(ctx.sessionId).toBe("feat-auth");
      expect(result).toContain("Resolved session for workflow command: feat-auth");
    });
  });
});
