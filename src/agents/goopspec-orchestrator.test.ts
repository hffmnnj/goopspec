/**
 * Tests for GoopSpec Orchestrator Agent
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { createGoopSpecOrchestrator, getAgentNames, getSkillNames } from "./goopspec-orchestrator.js";
import type { GoopSpecConfig, ResourceResolver, ResolvedResource } from "../core/types.js";

// Mock resolver
function createMockResolver(agents: ResolvedResource[] = [], skills: ResolvedResource[] = []): ResourceResolver {
  return {
    resolve: (type, name) => {
      if (type === "agent") {
        return agents.find(agent => agent.name === name) ?? null;
      }
      if (type === "skill") {
        return skills.find(skill => skill.name === name) ?? null;
      }
      return null;
    },
    resolveAll: (type) => {
      if (type === "agent") return agents;
      if (type === "skill") return skills;
      return [];
    },
    getDirectory: () => null,
  };
}

// Mock agent resource
function createMockAgent(name: string, description: string): ResolvedResource {
  return {
    name,
    path: `/mock/agents/${name}.md`,
    type: "agent",
    frontmatter: { name, description },
    body: "Mock agent body",
    content: `---\nname: ${name}\ndescription: ${description}\n---\nMock agent body`,
  };
}

// Mock skill resource
function createMockSkill(name: string, description: string): ResolvedResource {
  return {
    name,
    path: `/mock/skills/${name}/skill.md`,
    type: "skill",
    frontmatter: { name, description },
    body: "Mock skill body",
    content: `---\nname: ${name}\ndescription: ${description}\n---\nMock skill body`,
  };
}

describe("createGoopSpecOrchestrator", () => {
  it("creates orchestrator with default options", () => {
    const resolver = createMockResolver();
    const orchestrator = createGoopSpecOrchestrator({ resolver });

    expect(orchestrator.mode).toBe("primary");
    expect(orchestrator.model).toBe("anthropic/claude-opus-4-6");
    expect(orchestrator.thinking.type).toBe("enabled");
    expect(orchestrator.thinking.budgetTokens).toBe(32000);
    expect(orchestrator.color).toBe("#65f463");
  });

  it("uses custom model when provided", () => {
    const resolver = createMockResolver();
    const orchestrator = createGoopSpecOrchestrator({
      resolver,
      model: "anthropic/claude-sonnet-4-6",
    });

    expect(orchestrator.model).toBe("anthropic/claude-sonnet-4-6");
  });

  it("prefers agents.goop-orchestrator.model over orchestrator.model", () => {
    const resolver = createMockResolver();
    const pluginConfig: GoopSpecConfig = {
      orchestrator: { model: "anthropic/claude-opus-4-6" },
      agents: {
        "goop-orchestrator": { model: "openai/gpt-5" },
      },
    };

    const orchestrator = createGoopSpecOrchestrator({
      resolver,
      pluginConfig,
    });

    expect(orchestrator.model).toBe("openai/gpt-5");
  });

  it("uses orchestrator.model when agent override is missing", () => {
    const resolver = createMockResolver();
    const pluginConfig: GoopSpecConfig = {
      orchestrator: { model: "anthropic/claude-sonnet-4-6" },
    };

    const orchestrator = createGoopSpecOrchestrator({
      resolver,
      pluginConfig,
    });

    expect(orchestrator.model).toBe("anthropic/claude-sonnet-4-6");
  });

  it("uses custom thinking budget when provided", () => {
    const resolver = createMockResolver();
    const orchestrator = createGoopSpecOrchestrator({
      resolver,
      thinkingBudget: 16000,
    });

    expect(orchestrator.thinking.budgetTokens).toBe(16000);
  });

  it("includes all required permissions", () => {
    const resolver = createMockResolver();
    const orchestrator = createGoopSpecOrchestrator({ resolver });

    expect(orchestrator.permission.goop_skill).toBe("allow");
    expect(orchestrator.permission.goop_status).toBe("allow");
    expect(orchestrator.permission.goop_adl).toBe("allow");
    expect(orchestrator.permission.goop_spec).toBe("allow");
    expect(orchestrator.permission.goop_checkpoint).toBe("allow");
    expect(orchestrator.permission.question).toBe("allow");
    expect(orchestrator.permission.todowrite).toBe("allow");
    expect(orchestrator.permission.todoread).toBe("allow");
  });

  it("generates prompt with all workflow phases", () => {
    const resolver = createMockResolver();
    const orchestrator = createGoopSpecOrchestrator({ resolver });

    expect(orchestrator.prompt).toContain("<Role>");
    expect(orchestrator.prompt).toContain("Phase 0: Intent Gate");
    expect(orchestrator.prompt).toContain("Phase 1: Discuss");
    expect(orchestrator.prompt).toContain("Phase 2: Plan");
    expect(orchestrator.prompt).toContain("Phase 3: Execute");
    expect(orchestrator.prompt).toContain("Phase 4: Audit");
    expect(orchestrator.prompt).toContain("Phase 5: Confirm");
  });

  it("includes delegation rules using direct task flow", () => {
    const resolver = createMockResolver();
    const orchestrator = createGoopSpecOrchestrator({ resolver });

    expect(orchestrator.prompt).toContain("<Delegation_Rules>");
    // Must use direct task() delegation
    expect(orchestrator.prompt).toContain("task(");
    // Must NOT reference the removed wrapper tool
    expect(orchestrator.prompt).not.toContain("goop_delegate(");
    expect(orchestrator.prompt).not.toContain("goop_delegate({");
  });

  it("does not include goop_delegate in permissions", () => {
    const resolver = createMockResolver();
    const orchestrator = createGoopSpecOrchestrator({ resolver });

    expect(orchestrator.permission).not.toHaveProperty("goop_delegate");
    // task tool should be allowed for direct delegation
    expect(orchestrator.permission.task).toBe("allow");
  });

  it("includes direct task prompt payload requirements", () => {
    const resolver = createMockResolver();
    const orchestrator = createGoopSpecOrchestrator({ resolver });

    // Prompt must describe the required payload sections for task delegation
    expect(orchestrator.prompt).toContain("## TASK INTENT");
    expect(orchestrator.prompt).toContain("## EXPECTED OUTPUT");
    expect(orchestrator.prompt).toContain("## PROJECT CONTEXT");
    expect(orchestrator.prompt).toContain("## CONSTRAINTS");
    expect(orchestrator.prompt).toContain("## VERIFICATION");
    // Context injection requirements
    expect(orchestrator.prompt).toContain("SPEC references");
    expect(orchestrator.prompt).toContain("BLUEPRINT references");
    expect(orchestrator.prompt).toContain("Relevant memory");
  });

  it("includes specialist routing guidance by task type", () => {
    const resolver = createMockResolver();
    const orchestrator = createGoopSpecOrchestrator({ resolver });

    // All specialist agents must be referenced for routing
    expect(orchestrator.prompt).toContain("goop-researcher");
    expect(orchestrator.prompt).toContain("goop-explorer");
    expect(orchestrator.prompt).toContain("goop-debugger");
    expect(orchestrator.prompt).toContain("goop-verifier");
    // All executor tiers must be referenced
    expect(orchestrator.prompt).toContain("goop-executor-low");
    expect(orchestrator.prompt).toContain("goop-executor-medium");
    expect(orchestrator.prompt).toContain("goop-executor-high");
    expect(orchestrator.prompt).toContain("goop-executor-frontend");
  });

  it("maps agent selection to task type categories", () => {
    const resolver = createMockResolver();
    const orchestrator = createGoopSpecOrchestrator({ resolver });

    // Prompt should contain guidance linking task types to agents
    // Research tasks → goop-researcher
    expect(orchestrator.prompt).toContain("goop-researcher");
    // Exploration tasks → goop-explorer
    expect(orchestrator.prompt).toContain("goop-explorer");
    // Implementation tasks → executor tiers
    expect(orchestrator.prompt).toContain("goop-executor");
    // Verification tasks → goop-verifier
    expect(orchestrator.prompt).toContain("goop-verifier");
  });

  it("includes constraints in prompt", () => {
    const resolver = createMockResolver();
    const orchestrator = createGoopSpecOrchestrator({ resolver });

    expect(orchestrator.prompt).toContain("<Constraints>");
    expect(orchestrator.prompt).toContain("Deviation Rules");
  });

  it("includes available agents in delegation section", () => {
    const agents = [
      createMockAgent("goop-planner", "Creates execution plans"),
      createMockAgent("goop-executor", "Implements tasks"),
    ];
    const resolver = createMockResolver(agents);
    const orchestrator = createGoopSpecOrchestrator({ resolver });

    expect(orchestrator.prompt).toContain("goop-planner");
    expect(orchestrator.prompt).toContain("goop-executor");
    expect(orchestrator.prompt).toContain("Creates execution plans");
  });

  it("includes available skills in prompt", () => {
    const skills = [
      createMockSkill("typescript", "TypeScript best practices"),
      createMockSkill("react", "React patterns"),
    ];
    const resolver = createMockResolver([], skills);
    const orchestrator = createGoopSpecOrchestrator({ resolver });

    expect(orchestrator.prompt).toContain("typescript");
    expect(orchestrator.prompt).toContain("react");
  });

  it("respects phaseGates setting in prompt", () => {
    const resolver = createMockResolver();
    
    const strictOrch = createGoopSpecOrchestrator({ 
      resolver, 
      phaseGates: "strict" 
    });
    expect(strictOrch.prompt).toContain("Strict Mode");

    const autoOrch = createGoopSpecOrchestrator({ 
      resolver, 
      phaseGates: "automatic" 
    });
    expect(autoOrch.prompt).toContain("Automatic Mode");
  });

  it("respects waveExecution setting in prompt", () => {
    const resolver = createMockResolver();
    
    const seqOrch = createGoopSpecOrchestrator({ 
      resolver, 
      waveExecution: "sequential" 
    });
    expect(seqOrch.prompt).toContain("Sequential Wave");

    const parOrch = createGoopSpecOrchestrator({ 
      resolver, 
      waveExecution: "parallel" 
    });
    expect(parOrch.prompt).toContain("Parallel");
  });
});

describe("getAgentNames", () => {
  it("extracts names from agent resources", () => {
    const agents = [
      createMockAgent("agent-1", "First agent"),
      createMockAgent("agent-2", "Second agent"),
    ];

    const names = getAgentNames(agents);
    expect(names).toEqual(["agent-1", "agent-2"]);
  });

  it("handles empty array", () => {
    const names = getAgentNames([]);
    expect(names).toEqual([]);
  });
});

describe("getSkillNames", () => {
  it("extracts names from skill resources", () => {
    const skills = [
      createMockSkill("skill-1", "First skill"),
      createMockSkill("skill-2", "Second skill"),
    ];

    const names = getSkillNames(skills);
    expect(names).toEqual(["skill-1", "skill-2"]);
  });

  it("handles empty array", () => {
    const names = getSkillNames([]);
    expect(names).toEqual([]);
  });
});
