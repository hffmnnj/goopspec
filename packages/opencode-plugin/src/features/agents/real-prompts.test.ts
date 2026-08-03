import { describe, expect, it } from "bun:test";

import { AGENT_ROLES } from "../../core/constants.js";
import {
  loadRealAgents,
  loadRealCommands,
  type RealAgentPrompt,
  type RealCommandPrompt,
} from "./real-prompts.test-support.js";

const EXPECTED_AGENT_FILES = 15;
const EXPECTED_COMMAND_FILES = 9;

const BUILTIN_TOOLS = new Set([
  "ast_grep",
  "background_cancel",
  "background_command",
  "background_status",
  "bash",
  "difftastic",
  "edit",
  "generate_image",
  "glob",
  "grep",
  "question",
  "read",
  "scip",
  "task",
  "todowrite",
  "webfetch",
  "write",
]);

const REGISTERED_TOOLS = new Set([
  "goop_acceptance_audit",
  "goop_adl",
  "goop_append_chronicle",
  "goop_blocker",
  "goop_boot",
  "goop_checkpoint",
  "goop_compact",
  "goop_create_pr",
  "goop_get_global_config",
  "goop_infer_intent",
  "goop_query_decisions",
  "goop_read_db",
  "goop_read_section",
  "goop_read_wave",
  "goop_reference",
  "goop_save_note",
  "goop_search_docs",
  "goop_search_notes",
  "goop_setup",
  "goop_spec",
  "goop_state",
  "goop_status",
  "goop_timeline",
  "goop_write_db",
  "goop_write_section",
  "goop_write_wave",
  "memory_forget",
  "memory_save",
  "memory_search",
  "slashcommand",
]);

const VALID_TOOLS = new Set([...BUILTIN_TOOLS, ...REGISTERED_TOOLS]);

const agents = loadRealAgents();
const commands = loadRealCommands();

function describeAgent(agent: RealAgentPrompt): string {
  return `${agent.file} (${agent.path})`;
}

function describeCommand(command: RealCommandPrompt): string {
  return `${command.file} (${command.path})`;
}

function toolGrants(agent: RealAgentPrompt): string[] {
  if (!agent.parsed) return [];
  const tools = Object.keys(agent.parsed.config.tools ?? {});
  const permissions = Object.keys(agent.parsed.config.permission ?? {});
  return [...tools, ...permissions];
}

describe("real agent prompt directory", () => {
  it("contains exactly the shipped agent file count", () => {
    expect(agents, "agents/*.md file count changed").toHaveLength(EXPECTED_AGENT_FILES);
  });

  it("ships the wave-verifier agent as goop-wave-verifier.md", () => {
    const waveVerifier = agents.find((agent) => agent.file === "goop-wave-verifier.md");
    expect(waveVerifier, "goop-wave-verifier.md is missing from agents/*.md").toBeDefined();
    expect(waveVerifier?.parsed?.name, "goop-wave-verifier.md did not parse to name goop-wave-verifier").toBe(
      "goop-wave-verifier",
    );
  });

  for (const agent of agents) {
    it(`${describeAgent(agent)} parses and has required metadata`, () => {
      expect(agent.parsed, `${describeAgent(agent)} failed production parsing`).not.toBeNull();
      const parsed = agent.parsed;
      expect(parsed?.name, `${describeAgent(agent)} has no parsed name`).toBeTruthy();
      expect(parsed?.config.description, `${describeAgent(agent)} has no description`).toBeTruthy();
      expect(parsed?.config.model, `${describeAgent(agent)} has no model`).toBeTruthy();
      expect(parsed?.config.temperature, `${describeAgent(agent)} has no temperature`).toEqual(
        expect.any(Number),
      );
      expect(parsed?.config.mode, `${describeAgent(agent)} has no valid mode`).toBeTruthy();
      expect(parsed?.config.prompt, `${describeAgent(agent)} has no prompt body`).toBeTruthy();
      expect(toolGrants(agent), `${describeAgent(agent)} has no tool or permission grants`).not.toHaveLength(0);
    });

    it(`${describeAgent(agent)} grants only known tools`, () => {
      const invalid = toolGrants(agent).filter((tool) => !VALID_TOOLS.has(tool));
      expect(invalid, `${describeAgent(agent)} contains invalid grants`).toEqual([]);
    });
  }

  it("contains every role in the production agent roster", () => {
    const names = new Set(agents.flatMap((agent) => (agent.parsed ? [agent.parsed.name] : [])));
    const missing = AGENT_ROLES.map((role) => `goop-${role}`).filter((name) => !names.has(name));
    expect(missing, "agent roster entries are missing from agents/*.md").toEqual([]);
  });

  it("fails safely for a malformed agent document without touching real files", () => {
    const malformed = { file: "synthetic-malformed.md", path: "<synthetic>", raw: "not markdown", parsed: null };
    expect(malformed.parsed, `${malformed.file} should be rejected`).toBeNull();
  });
});

describe("real command prompt directory", () => {
  it("contains exactly the shipped command file count", () => {
    expect(commands, "commands/*.md file count changed").toHaveLength(EXPECTED_COMMAND_FILES);
  });

  for (const command of commands) {
    it(`${describeCommand(command)} parses and has required metadata`, () => {
      expect(command.parsed, `${describeCommand(command)} failed production parsing`).not.toBeNull();
      const parsed = command.parsed;
      expect(parsed?.name, `${describeCommand(command)} has no parsed name`).toBeTruthy();
      expect(parsed?.description, `${describeCommand(command)} has no description`).toBeTruthy();
      expect(parsed?.agent, `${describeCommand(command)} has no normalized agent`).toBe(
        "goop-orchestrator",
      );
      expect(parsed?.phase, `${describeCommand(command)} has no phase`).toBeTruthy();
      expect(parsed?.requires, `${describeCommand(command)} has no requires field`).toBeTruthy();
      expect(parsed?.nextStep, `${describeCommand(command)} has no next-step field`).toBeTruthy();
      expect(parsed?.template, `${describeCommand(command)} has no command body`).toBeTruthy();
    });
  }

  it("fails safely for a malformed command document without touching real files", () => {
    const malformed = { file: "synthetic-malformed.md", path: "<synthetic>", raw: "not markdown", parsed: null };
    expect(malformed.parsed, `${malformed.file} should be rejected`).toBeNull();
  });
});
