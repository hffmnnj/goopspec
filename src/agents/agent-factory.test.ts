/**
 * Unit Tests for Agent Factory
 * @module agents/agent-factory.test
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import {
  createAgentFromMarkdown,
  validateAgentResource,
  type AgentConfig,
} from "./agent-factory.js";
import {
  createMockResourceResolver,
  createMockResource,
  setupTestEnvironment,
  TEST_SKILL_RESOURCE,
  type ResolvedResource,
} from "../test-utils.js";
import { createResourceResolver } from "../core/resolver.js";

const PROJECT_ROOT = process.cwd();

describe("agent-factory", () => {
  let cleanup: () => void;

  beforeEach(() => {
    const env = setupTestEnvironment("agent-factory-test");
    cleanup = env.cleanup;
  });

  afterEach(() => {
    cleanup();
  });

  describe("createAgentFromMarkdown", () => {
    describe("basic agent creation", () => {
      it("creates agent with name from frontmatter", () => {
        const resource = createMockResource({
          name: "my-agent",
          type: "agent",
          frontmatter: {
            name: "my-agent",
            description: "Test agent",
            mode: "subagent",
          },
          body: "You are my agent.",
        });

        const resolver = createMockResourceResolver([resource]);
        const config = createAgentFromMarkdown(resource, resolver);

        expect(config.description).toBe("Test agent");
      });

      it("creates agent with description from frontmatter", () => {
        const resource = createMockResource({
          name: "test-agent",
          type: "agent",
          frontmatter: {
            name: "test-agent",
            description: "A test agent for testing",
            mode: "subagent",
          },
          body: "Prompt",
        });

        const resolver = createMockResourceResolver();
        const config = createAgentFromMarkdown(resource, resolver);

        expect(config.description).toBe("A test agent for testing");
      });

      it("uses resource name when frontmatter name missing", () => {
        const resource = createMockResource({
          name: "fallback-agent",
          type: "agent",
          frontmatter: {
            description: "Test",
            mode: "subagent",
          },
          body: "Prompt",
        });

        const resolver = createMockResourceResolver();
        const config = createAgentFromMarkdown(resource, resolver);

        expect(config.description).toBe("Test");
      });

      it("uses default description when missing", () => {
        const resource = createMockResource({
          name: "unnamed-agent",
          type: "agent",
          frontmatter: {
            mode: "subagent",
          },
          body: "Prompt",
        });

        const resolver = createMockResourceResolver();
        const config = createAgentFromMarkdown(resource, resolver);

        expect(config.description).toContain("GoopSpec");
      });
    });

    describe("mode handling", () => {
      it("respects primary mode", () => {
        const resource = createMockResource({
          name: "primary-agent",
          type: "agent",
          frontmatter: {
            mode: "primary",
            description: "Primary",
          },
          body: "Prompt",
        });

        const resolver = createMockResourceResolver();
        const config = createAgentFromMarkdown(resource, resolver);

        expect(config.mode).toBe("primary");
      });

      it("respects subagent mode", () => {
        const resource = createMockResource({
          name: "sub-agent",
          type: "agent",
          frontmatter: {
            mode: "subagent",
            description: "Sub",
          },
          body: "Prompt",
        });

        const resolver = createMockResourceResolver();
        const config = createAgentFromMarkdown(resource, resolver);

        expect(config.mode).toBe("subagent");
      });

      it("respects all mode", () => {
        const resource = createMockResource({
          name: "all-agent",
          type: "agent",
          frontmatter: {
            mode: "all",
            description: "All",
          },
          body: "Prompt",
        });

        const resolver = createMockResourceResolver();
        const config = createAgentFromMarkdown(resource, resolver);

        expect(config.mode).toBe("all");
      });

      it("defaults to subagent mode", () => {
        const resource = createMockResource({
          name: "no-mode-agent",
          type: "agent",
          frontmatter: {
            description: "No mode",
          },
          body: "Prompt",
        });

        const resolver = createMockResourceResolver();
        const config = createAgentFromMarkdown(resource, resolver);

        expect(config.mode).toBe("subagent");
      });
    });

    describe("model configuration", () => {
      it("prefers config agent model over frontmatter model", () => {
        const resource = createMockResource({
          name: "goop-executor",
          type: "agent",
          frontmatter: {
            name: "Goop Executor",
            mode: "subagent",
            model: "anthropic/claude-opus-4-6",
            description: "Model precedence test",
          },
          body: "Prompt",
        });

        const resolver = createMockResourceResolver();
        const config = createAgentFromMarkdown(resource, resolver, {
          pluginConfig: {
            agents: {
              "goop-executor": {
                model: "openai/gpt-5.3-codex",
              },
            },
          },
        });

        expect(config.model).toBe("openai/gpt-5.3-codex");
      });

      it("uses model from frontmatter", () => {
        const resource = createMockResource({
          name: "model-agent",
          type: "agent",
          frontmatter: {
            mode: "subagent",
            model: "anthropic/claude-opus-4-6",
            description: "Model test",
          },
          body: "Prompt",
        });

        const resolver = createMockResourceResolver();
        const config = createAgentFromMarkdown(resource, resolver);

        expect(config.model).toBe("anthropic/claude-opus-4-6");
      });

      it("uses config defaultModel when frontmatter model is not set", () => {
        const resource = createMockResource({
          name: "no-model-agent",
          type: "agent",
          frontmatter: {
            mode: "subagent",
            description: "No model",
          },
          body: "Prompt",
        });

        const resolver = createMockResourceResolver();
        const config = createAgentFromMarkdown(resource, resolver, {
          pluginConfig: {
            defaultModel: "openai/gpt-5-mini",
          },
        });

        expect(config.model).toBe("openai/gpt-5-mini");
      });

      it("falls back to hardcoded model when no config or frontmatter model is set", () => {
        const resource = createMockResource({
          name: "no-model-agent",
          type: "agent",
          frontmatter: {
            mode: "subagent",
            description: "No model",
          },
          body: "Prompt",
        });

        const resolver = createMockResourceResolver();
        const config = createAgentFromMarkdown(resource, resolver);

        expect(config.model).toBe("anthropic/claude-sonnet-4-5");
      });
    });

    describe("temperature configuration", () => {
      it("uses temperature from frontmatter", () => {
        const resource = createMockResource({
          name: "temp-agent",
          type: "agent",
          frontmatter: {
            mode: "subagent",
            temperature: 0.7,
            description: "Temp test",
          },
          body: "Prompt",
        });

        const resolver = createMockResourceResolver();
        const config = createAgentFromMarkdown(resource, resolver);

        expect(config.temperature).toBe(0.7);
      });
    });

    describe("tools and permissions", () => {
      it("creates permission map from tools list", () => {
        const resource = createMockResource({
          name: "tools-agent",
          type: "agent",
          frontmatter: {
            mode: "subagent",
            tools: ["read", "write", "glob"],
            description: "Tools test",
          },
          body: "Prompt",
        });

        const resolver = createMockResourceResolver();
        const config = createAgentFromMarkdown(resource, resolver);

        expect(config.permission).toBeDefined();
        expect(config.permission?.read).toBe("allow");
        expect(config.permission?.write).toBe("allow");
        expect(config.permission?.glob).toBe("allow");
      });

      it("handles empty tools list", () => {
        const resource = createMockResource({
          name: "no-tools-agent",
          type: "agent",
          frontmatter: {
            mode: "subagent",
            tools: [],
            description: "No tools",
          },
          body: "Prompt",
        });

        const resolver = createMockResourceResolver();
        const config = createAgentFromMarkdown(resource, resolver, {
          enableMemoryTools: false,
        });

        // Should have no permission entry
        expect(config.permission).toBeUndefined();
      });

      it("normalizes stringified tools list in frontmatter", () => {
        const resource = createMockResource({
          name: "string-tools-agent",
          type: "agent",
          frontmatter: {
            mode: "subagent",
            tools: "[]" as unknown as string[],
            description: "String tools",
          },
          body: "Prompt",
        });

        const resolver = createMockResourceResolver();
        const config = createAgentFromMarkdown(resource, resolver, {
          enableMemoryTools: false,
        });

        expect(config.permission).toBeUndefined();
      });
    });

    describe("memory tools integration", () => {
      it("adds memory tools for memory-capable agents", () => {
        const resource = createMockResource({
          name: "memory-agent",
          type: "agent",
          frontmatter: {
            mode: "subagent",
            tools: ["read"],
            skills: ["memory-usage"],
            description: "Memory test",
          },
          body: "Prompt",
        });

        const resolver = createMockResourceResolver();
        const config = createAgentFromMarkdown(resource, resolver);

        expect(config.permission?.memory_save).toBe("allow");
        expect(config.permission?.memory_search).toBe("allow");
      });

      it("skips memory tools when agent has no memory capability", () => {
        const resource = createMockResource({
          name: "no-memory-capability-agent",
          type: "agent",
          frontmatter: {
            mode: "subagent",
            tools: ["read"],
            description: "No memory capability",
          },
          body: "Prompt",
        });

        const resolver = createMockResourceResolver();
        const config = createAgentFromMarkdown(resource, resolver);

        expect(config.permission?.memory_save).toBeUndefined();
        expect(config.permission?.memory_search).toBeUndefined();
      });

      it("respects enableMemoryTools option", () => {
        const resource = createMockResource({
          name: "no-memory-agent",
          type: "agent",
          frontmatter: {
            mode: "subagent",
            tools: ["read"],
            description: "No memory",
          },
          body: "Prompt",
        });

        const resolver = createMockResourceResolver();
        const config = createAgentFromMarkdown(resource, resolver, {
          enableMemoryTools: false,
        });

        expect(config.permission?.memory_save).toBeUndefined();
      });

      it("does not duplicate memory tools", () => {
        const resource = createMockResource({
          name: "has-memory-agent",
          type: "agent",
          frontmatter: {
            mode: "subagent",
            tools: ["read", "memory_save", "memory_search"],
            description: "Has memory",
          },
          body: "Prompt",
        });

        const resolver = createMockResourceResolver();
        const config = createAgentFromMarkdown(resource, resolver);

        // Should still work, just not duplicate
        expect(config.permission?.memory_save).toBe("allow");
        expect(config.permission?.memory_search).toBe("allow");
      });

      it("adds memory instructions to prompt", () => {
        const resource = createMockResource({
          name: "memory-prompt-agent",
          type: "agent",
          frontmatter: {
            mode: "subagent",
            skills: ["memory-usage"],
            description: "Memory prompt",
          },
          body: "Base prompt",
        });

        const resolver = createMockResourceResolver();
        const config = createAgentFromMarkdown(resource, resolver);

        expect(config.prompt).toContain("Memory System");
        expect(config.prompt).toContain("memory_decision");
      });

      it("omits memory instructions for non-memory agents", () => {
        const resource = createMockResource({
          name: "stateless-agent",
          type: "agent",
          frontmatter: {
            mode: "subagent",
            description: "No memory prompt",
          },
          body: "Base prompt",
        });

        const resolver = createMockResourceResolver();
        const config = createAgentFromMarkdown(resource, resolver);

        expect(config.prompt).not.toContain("Memory System");
      });
    });

    describe("question tool instructions", () => {
      it("injects question instructions for orchestrator agents", () => {
        const resource = createMockResource({
          name: "goop-orchestrator",
          type: "agent",
          frontmatter: {
            name: "goop-orchestrator",
            mode: "orchestrator",
            tools: ["question"],
            description: "Orchestrator",
          },
          body: "Base prompt",
        });

        const resolver = createMockResourceResolver();
        const config = createAgentFromMarkdown(resource, resolver);

        expect(config.prompt).toContain("Question Tool (User Interaction)");
      });

      it("omits question instructions for subagents", () => {
        const resource = createMockResource({
          name: "goop-executor",
          type: "agent",
          frontmatter: {
            mode: "subagent",
            tools: ["read", "bash"],
            description: "Executor",
          },
          body: "Base prompt",
        });

        const resolver = createMockResourceResolver();
        const config = createAgentFromMarkdown(resource, resolver, {
          enableMemoryTools: false,
        });

        expect(config.prompt).not.toContain("Question Tool (User Interaction)");
      });
    });

    describe("skills injection", () => {
      it("injects skill content into prompt", () => {
        const skill = createMockResource({
          name: "test-skill/skill",
          type: "skill",
          frontmatter: {
            name: "test-skill",
            description: "A test skill",
          },
          body: "This is the skill content.",
        });

        const agent = createMockResource({
          name: "skill-agent",
          type: "agent",
          frontmatter: {
            mode: "subagent",
            skills: ["test-skill"],
            description: "Skill test",
          },
          body: "Base prompt",
        });

        const resolver = createMockResourceResolver([skill, agent]);
        const config = createAgentFromMarkdown(agent, resolver, {
          enableMemoryTools: false,
        });

        expect(config.prompt).toContain("Loaded Skills");
        expect(config.prompt).toContain("test-skill");
        expect(config.prompt).toContain("This is the skill content");
      });

      it("handles missing skills gracefully", () => {
        const agent = createMockResource({
          name: "missing-skill-agent",
          type: "agent",
          frontmatter: {
            mode: "subagent",
            skills: ["nonexistent-skill"],
            description: "Missing skill",
          },
          body: "Base prompt",
        });

        const resolver = createMockResourceResolver();
        // Should not throw
        const config = createAgentFromMarkdown(agent, resolver, {
          enableMemoryTools: false,
        });

        expect(config.prompt).toContain("Loaded Skills");
      });
    });

    describe("references injection", () => {
      it("injects reference content into prompt", () => {
        const reference = createMockResource({
          name: "test-reference",
          type: "reference",
          frontmatter: {
            name: "test-reference",
            description: "A test reference",
          },
          body: "Reference document content.",
        });

        const agent = createMockResource({
          name: "ref-agent",
          type: "agent",
          frontmatter: {
            mode: "subagent",
            references: ["test-reference"],
            description: "Ref test",
          },
          body: "Base prompt",
        });

        const resolver = createMockResourceResolver([reference, agent]);
        const config = createAgentFromMarkdown(agent, resolver, {
          enableMemoryTools: false,
        });

        expect(config.prompt).toContain("Reference Documents");
        expect(config.prompt).toContain("Reference document content");
      });
    });

    describe("thinking budget", () => {
      it("sets thinking budget from frontmatter", () => {
        const resource = createMockResource({
          name: "thinking-agent",
          type: "agent",
          frontmatter: {
            mode: "subagent",
            thinking_budget: 32000,
            description: "Thinking test",
          },
          body: "Prompt",
        });

        const resolver = createMockResourceResolver();
        const config = createAgentFromMarkdown(resource, resolver);

        expect(config.thinking).toBeDefined();
        expect(config.thinking?.type).toBe("enabled");
        expect(config.thinking?.budgetTokens).toBe(32000);
      });

      it("leaves thinking undefined when not specified", () => {
        const resource = createMockResource({
          name: "no-thinking-agent",
          type: "agent",
          frontmatter: {
            mode: "subagent",
            description: "No thinking",
          },
          body: "Prompt",
        });

        const resolver = createMockResourceResolver();
        const config = createAgentFromMarkdown(resource, resolver);

        expect(config.thinking).toBeUndefined();
      });
    });

    describe("color configuration", () => {
      it("uses color from frontmatter", () => {
        const resource = createMockResource({
          name: "colored-agent",
          type: "agent",
          frontmatter: {
            mode: "subagent",
            color: "#ff0000",
            description: "Colored",
          },
          body: "Prompt",
        });

        const resolver = createMockResourceResolver();
        const config = createAgentFromMarkdown(resource, resolver);

        expect(config.color).toBe("#ff0000");
      });
    });
  });

  describe("validateAgentResource", () => {
    it("returns empty array for valid agent", () => {
      const resource = createMockResource({
        name: "valid-agent",
        type: "agent",
        frontmatter: {
          name: "valid-agent",
          description: "A valid agent",
          mode: "subagent",
        },
        body: "This is the prompt body.",
      });

      const issues = validateAgentResource(resource);
      expect(issues).toEqual([]);
    });

    it("reports missing description", () => {
      const resource = createMockResource({
        name: "no-desc-agent",
        type: "agent",
        frontmatter: {
          name: "no-desc-agent",
          mode: "subagent",
        },
        body: "Prompt",
      });

      const issues = validateAgentResource(resource);
      expect(issues).toContain("Missing 'description' field");
    });

    it("reports invalid mode", () => {
      const resource = createMockResource({
        name: "bad-mode-agent",
        type: "agent",
        frontmatter: {
          name: "bad-mode-agent",
          description: "Bad mode",
          mode: "invalid",
        },
        body: "Prompt",
      });

      const issues = validateAgentResource(resource);
      expect(issues.some(i => i.includes("mode"))).toBe(true);
    });

    it("reports empty body", () => {
      const resource = createMockResource({
        name: "empty-body-agent",
        type: "agent",
        frontmatter: {
          name: "empty-body-agent",
          description: "Empty body",
          mode: "subagent",
        },
        body: "",
      });

      const issues = validateAgentResource(resource);
      expect(issues.some(i => i.includes("Empty"))).toBe(true);
    });

    it("reports whitespace-only body", () => {
      const resource = createMockResource({
        name: "whitespace-agent",
        type: "agent",
        frontmatter: {
          name: "whitespace-agent",
          description: "Whitespace only",
          mode: "subagent",
        },
        body: "   \n\t  ",
      });

      const issues = validateAgentResource(resource);
      expect(issues.some(i => i.includes("Empty"))).toBe(true);
    });

    it("reports multiple issues", () => {
      const resource = createMockResource({
        name: "many-issues-agent",
        type: "agent",
        frontmatter: {
          mode: "invalid",
        },
        body: "",
      });

      const issues = validateAgentResource(resource);
      expect(issues.length).toBeGreaterThan(1);
    });
  });

  describe("bundled agent composition", () => {
    it("composes all 16 bundled agents without failures", () => {
      const resolver = createResourceResolver(PROJECT_ROOT);
      const agentResources = resolver.resolveAll("agent");

      expect(agentResources.length).toBe(16);

      const failures: string[] = [];
      const composed = new Map<string, AgentConfig>();

      for (const agent of agentResources) {
        try {
          const config = createAgentFromMarkdown(agent, resolver);
          composed.set(agent.name, config);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          failures.push(`${agent.name}: ${message}`);
        }
      }

      expect(failures).toEqual([]);
      expect(composed.has("memory-distiller")).toBe(true);

      const memoryDistillerConfig = composed.get("memory-distiller");
      expect(memoryDistillerConfig).toBeDefined();
      expect(memoryDistillerConfig?.prompt.length).toBeGreaterThan(0);
    });
  });

  describe("goop-creative composition integrity", () => {
    function composeCreativeAgent(): AgentConfig {
      const resolver = createResourceResolver(PROJECT_ROOT);
      const resource = resolver.resolve("agent", "goop-creative");
      if (!resource) throw new Error("goop-creative agent not found");
      return createAgentFromMarkdown(resource, resolver);
    }

    describe("frontmatter parsing", () => {
      it("resolves goop-creative from bundled agents", () => {
        const resolver = createResourceResolver(PROJECT_ROOT);
        const resource = resolver.resolve("agent", "goop-creative");

        expect(resource).not.toBeNull();
        expect(resource!.name).toBe("goop-creative");
        expect(resource!.type).toBe("agent");
      });

      it("parses mode as subagent", () => {
        const config = composeCreativeAgent();
        expect(config.mode).toBe("subagent");
      });

      it("parses model from frontmatter", () => {
        const config = composeCreativeAgent();
        expect(config.model).toBe("anthropic/claude-opus-4-6");
      });

      it("parses temperature from frontmatter", () => {
        const config = composeCreativeAgent();
        expect(config.temperature).toBe(0.5);
      });

      it("parses thinking budget from frontmatter", () => {
        const config = composeCreativeAgent();
        expect(config.thinking).toBeDefined();
        expect(config.thinking?.type).toBe("enabled");
        expect(config.thinking?.budgetTokens).toBe(32000);
      });

      it("parses description from frontmatter", () => {
        const config = composeCreativeAgent();
        expect(config.description).toContain("Visionary");
      });

      it("includes declared tools in permission map", () => {
        const config = composeCreativeAgent();
        expect(config.permission).toBeDefined();
        expect(config.permission?.goop_state).toBe("allow");
        expect(config.permission?.read).toBe("allow");
        expect(config.permission?.glob).toBe("allow");
        expect(config.permission?.grep).toBe("allow");
        expect(config.permission?.goop_skill).toBe("allow");
        expect(config.permission?.goop_reference).toBe("allow");
      });
    });

    describe("skills and references injection", () => {
      it("injects goop-core skill content", () => {
        const config = composeCreativeAgent();
        expect(config.prompt).toContain("Loaded Skills");
        expect(config.prompt).toContain("goop-core");
      });

      it("injects architecture-design skill content", () => {
        const config = composeCreativeAgent();
        expect(config.prompt).toContain("architecture-design");
      });

      it("injects memory-usage skill content", () => {
        const config = composeCreativeAgent();
        expect(config.prompt).toContain("memory-usage");
      });

      it("adds memory tools to permission map", () => {
        const config = composeCreativeAgent();
        expect(config.permission?.memory_save).toBe("allow");
        expect(config.permission?.memory_search).toBe("allow");
        expect(config.permission?.memory_note).toBe("allow");
        expect(config.permission?.memory_decision).toBe("allow");
        expect(config.permission?.memory_forget).toBe("allow");
      });

      it("injects reference documents section", () => {
        const config = composeCreativeAgent();
        expect(config.prompt).toContain("Reference Documents");
      });

      it("injects subagent-protocol reference content", () => {
        const config = composeCreativeAgent();
        expect(config.prompt).toContain("Subagent Protocol");
      });

      it("injects response-format reference content", () => {
        const config = composeCreativeAgent();
        expect(config.prompt).toContain("Agent Response Format");
      });

      it("injects xml-response-schema reference content", () => {
        const config = composeCreativeAgent();
        expect(config.prompt).toContain("XML Response Schema");
      });

      it("injects handoff-protocol reference content", () => {
        const config = composeCreativeAgent();
        expect(config.prompt).toContain("Handoff Protocol");
      });

      it("injects context-injection reference content", () => {
        const config = composeCreativeAgent();
        expect(config.prompt).toContain("Context Injection");
      });
    });

    describe("protocol markers in composed prompt", () => {
      it("contains mandatory first step protocol", () => {
        const config = composeCreativeAgent();
        expect(config.prompt).toContain("MANDATORY FIRST STEP");
      });

      it("contains goop_state load instruction", () => {
        const config = composeCreativeAgent();
        expect(config.prompt).toContain("goop_state");
      });

      it("contains SPEC.md read instruction", () => {
        const config = composeCreativeAgent();
        expect(config.prompt).toContain("SPEC.md");
      });

      it("contains BLUEPRINT.md read instruction", () => {
        const config = composeCreativeAgent();
        expect(config.prompt).toContain("BLUEPRINT.md");
      });

      it("contains memory_search instruction in first steps", () => {
        const config = composeCreativeAgent();
        expect(config.prompt).toContain("memory_search");
      });

      it("contains XML goop_report envelope requirement", () => {
        const config = composeCreativeAgent();
        expect(config.prompt).toContain("goop_report");
      });

      it("contains handoff fields requirement", () => {
        const config = composeCreativeAgent();
        expect(config.prompt).toContain("<handoff>");
      });

      it("contains status values (COMPLETE, PARTIAL, BLOCKED, CHECKPOINT)", () => {
        const config = composeCreativeAgent();
        expect(config.prompt).toContain("COMPLETE");
        expect(config.prompt).toContain("PARTIAL");
        expect(config.prompt).toContain("BLOCKED");
        expect(config.prompt).toContain("CHECKPOINT");
      });

      it("contains Memory System section", () => {
        const config = composeCreativeAgent();
        expect(config.prompt).toContain("Memory System");
      });

      it("does not contain question tool instructions (subagent)", () => {
        const config = composeCreativeAgent();
        expect(config.prompt).not.toContain("Question Tool (User Interaction)");
      });
    });

    describe("prompt structure integrity", () => {
      it("produces a non-empty prompt", () => {
        const config = composeCreativeAgent();
        expect(config.prompt.length).toBeGreaterThan(0);
      });

      it("starts with the base agent body content", () => {
        const config = composeCreativeAgent();
        expect(config.prompt).toContain("Elite Strategy and Systems Consultant");
      });

      it("contains creative protocol section", () => {
        const config = composeCreativeAgent();
        expect(config.prompt).toContain("Creative Protocol");
      });

      it("contains structured ideation mode", () => {
        const config = composeCreativeAgent();
        expect(config.prompt).toContain("Structured Ideation Mode");
      });

      it("contains idea-extension framework", () => {
        const config = composeCreativeAgent();
        expect(config.prompt).toContain("Idea-Extension Framework");
      });

      it("contains technology evaluation protocol", () => {
        const config = composeCreativeAgent();
        expect(config.prompt).toContain("Technology Evaluation");
      });

      it("contains problem decomposition protocol", () => {
        const config = composeCreativeAgent();
        expect(config.prompt).toContain("Problem Decomposition Protocol");
      });

      it("contains edge-case and failure-mode analysis", () => {
        const config = composeCreativeAgent();
        expect(config.prompt).toContain("Edge-Case and Failure-Mode Analysis");
      });

      it("contains universal compatibility protocol", () => {
        const config = composeCreativeAgent();
        expect(config.prompt).toContain("Universal Compatibility");
      });

      it("contains anti-bias checks", () => {
        const config = composeCreativeAgent();
        expect(config.prompt).toContain("Anti-Bias Checks");
      });

      it("passes validation with no issues", () => {
        const resolver = createResourceResolver(PROJECT_ROOT);
        const resource = resolver.resolve("agent", "goop-creative");
        expect(resource).not.toBeNull();

        const issues = validateAgentResource(resource!);
        expect(issues).toEqual([]);
      });
    });
  });
});
