import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { EXECUTOR_TIERS, WORKFLOW_PHASES } from "../../core/constants.js";
import { buildPhaseEnforcement } from "../enforcement/phase-context.js";
import { buildStateBlock } from "../../hooks/system-transform.js";
import { createDefaultWorkflowState } from "../../test-utils.js";
import {
  AGENTS_DIR,
  loadRealAgents,
  loadRealCommands,
  type RealAgentPrompt,
} from "./real-prompts.test-support.js";

const agents = loadRealAgents();
const commands = loadRealCommands();
const responseFormat = readFileSync(join(AGENTS_DIR, "../references/response-format.md"), "utf8");

const EXECUTOR_AGENT_NAMES = EXECUTOR_TIERS.map((tier) => `goop-executor-${tier}`);

function describeAgent(agent: RealAgentPrompt): string {
  return `${agent.file} (${agent.path})`;
}

function hasResponseEnvelopeContract(prompt: string): boolean {
  const headings = ["STATUS", "SUMMARY", "ARTIFACTS", "VERIFICATION", "NEXT"];
  const hasAllHeadings = headings.every((heading) => new RegExp(`^## ${heading}$`, "m").test(prompt));
  const pointsToSharedContract = /references\/response-format\.md/.test(prompt);
  const sharedContractIsIntact = headings.every((heading) => new RegExp(`^## ${heading}$`, "m").test(responseFormat));
  return hasAllHeadings || (pointsToSharedContract && sharedContractIsIntact);
}

function hasMemoryFirstBoot(prompt: string): boolean {
  return (
    /Memory-first flow: see `references\/core-protocol\.md` §Memory-First Protocol/i.test(prompt) ||
    /Boot sequence: see `references\/core-protocol\.md`/i.test(prompt)
  );
}

describe("semantic prompt invariants", () => {
  it("preserves the five workflow phase names and runtime gate flag semantics", () => {
    expect(WORKFLOW_PHASES, "runtime workflow phase names changed").toEqual([
      "idle",
      "discuss",
      "plan",
      "execute",
      "accept",
    ]);

    const lifecycle = agents.find((agent) => agent.file === "goop-orchestrator.md");
    expect(lifecycle, "goop-orchestrator.md is missing").toBeDefined();
    for (const phase of ["discuss", "plan", "execute", "accept", "confirm"]) {
      expect(lifecycle?.raw, `goop-orchestrator.md lost workflow phase ${phase}`).toContain(phase);
    }
    for (const phase of WORKFLOW_PHASES) {
      expect(buildPhaseEnforcement(phase), `runtime phase ${phase} has no enforcement block`).toContain(
        `PHASE ENFORCEMENT: ${phase.toUpperCase()}`,
      );
    }

    const state = createDefaultWorkflowState({
      phase: "execute",
      interviewComplete: true,
      specLocked: false,
      acceptanceConfirmed: true,
    });
    const stateBlock = buildStateBlock(state, "semantic-invariant");
    expect(stateBlock, "runtime gate flag interviewComplete lost its value").toContain("interview_complete: true");
    expect(stateBlock, "runtime gate flag specLocked lost its value").toContain("spec_locked: false");
    expect(stateBlock, "runtime gate flag acceptanceConfirmed lost its value").toContain(
      "acceptance_confirmed: true",
    );
  });

  it("requires the five-section response envelope for every real agent", () => {
    for (const agent of agents) {
      expect(hasResponseEnvelopeContract(agent.raw), `${describeAgent(agent)} lost the response envelope contract`).toBe(
        true,
      );
    }
  });

  it("keeps Conductor and executor ownership separate at their owning prompt layers", () => {
    const conductor = agents.find((agent) => agent.file === "goop-orchestrator.md");
    expect(conductor?.raw, "goop-orchestrator.md must own Conductor identity").toMatch(
      /You are the \*\*Conductor\*\*.*never.*implementation code/i,
    );
    for (const agentName of EXECUTOR_AGENT_NAMES) {
      const agent = agents.find((candidate) => candidate.parsed?.name === agentName);
      expect(agent, `${agentName}.md is missing from the real prompt stack`).toBeDefined();
      expect(agent?.raw, `${agentName}.md lost executor separation`).toMatch(/dispatched subagent \(NOT the Conductor\)/i);
    }
  });

  it("keeps all six executor tiers named and reachable from the authoritative Conductor prompt", () => {
    const conductor = agents.find((agent) => agent.file === "goop-orchestrator.md");
    expect(conductor, "goop-orchestrator.md is missing").toBeDefined();
    for (const agentName of EXECUTOR_AGENT_NAMES) {
      expect(conductor?.raw, `goop-orchestrator.md lost reachable tier ${agentName}`).toContain(agentName);
      expect(
        agents.some((agent) => agent.parsed?.name === agentName),
        `${agentName}.md is not reachable in the parsed real-agent roster`,
      ).toBe(true);
    }
  });

  it("keeps memory-first boot present for every real agent through the shared protocol pointer", () => {
    for (const agent of agents) {
      expect(hasMemoryFirstBoot(agent.raw), `${describeAgent(agent)} lost memory-first core-protocol boot`).toBe(true);
    }
  });

  it("does not grant plan-phase prompts direct source-file writing behavior", () => {
    const planCommand = commands.find((command) => command.file === "goop-plan.md");
    const planner = agents.find((agent) => agent.file === "goop-planner.md");
    expect(planCommand?.parsed?.phase, "goop-plan.md lost plan ownership").toBe("plan");
    expect(planCommand?.parsed?.agent, "goop-plan.md lost orchestrator ownership").toBe("goop-orchestrator");
    expect(planCommand?.raw, "goop-plan.md must scope planning outputs to workflow documents").toMatch(
      /locked contract \(`SPEC\.md`\) and an executable wave plan \(`BLUEPRINT\.md`\)/,
    );
    expect(planCommand?.raw, "goop-plan.md must not authorize source implementation").not.toMatch(
      /write (?:or )?edit.*source files|implement(?:ation)? code/i,
    );
    expect(planner?.raw, "goop-planner.md must own the source-write prohibition").toMatch(
      /Write or edit source code, configs, or test files\./i,
    );
    const plannerTools = Object.keys(planner?.parsed?.config.tools ?? {});
    expect(plannerTools, "goop-planner.md must not receive edit capability during planning").not.toContain("edit");
    expect(plannerTools, "goop-planner.md must not receive shell capability during planning").not.toContain("bash");
  });
});
