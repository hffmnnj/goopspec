/**
 * Agent definition loader.
 *
 * GoopSpec ships its agent roster as markdown files under `agents/`, each with
 * a YAML-ish frontmatter block (name, description, model, temperature, mode,
 * tools) followed by the agent prompt body. OpenCode discovers agents from its
 * `Config.agent` map, so the agent-registration hook reads these files and
 * converts them into `AgentConfig` entries.
 *
 * The frontmatter we author is a small, fixed subset of YAML — scalar
 * `key: value` pairs plus a single `tools:` list. We parse that subset directly
 * rather than pulling in a YAML dependency. All filesystem and parse failures
 * degrade gracefully to an empty result; agent loading must never crash the
 * plugin.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import type { AgentConfig } from "../../core/sdk-compat.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A parsed agent: its registration key plus the OpenCode AgentConfig. */
export interface LoadedAgent {
  name: string;
  config: AgentConfig;
}

/** A parsed command ready for `Config.command` registration. */
export interface LoadedCommand {
  name: string;
  template: string;
  description?: string;
  agent?: string;
}

/** Raw frontmatter values are either a scalar string or a list of strings. */
type FrontmatterValue = string | string[];

const VALID_MODES = new Set(["subagent", "primary", "all"]);

// ---------------------------------------------------------------------------
// Frontmatter parsing
// ---------------------------------------------------------------------------

/** Strip a single pair of matching surrounding quotes, if present. */
function stripQuotes(value: string): string {
  if (value.length >= 2) {
    const first = value[0];
    const last = value[value.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return value.slice(1, -1);
    }
  }
  return value;
}

/**
 * Parse the supported frontmatter subset into a key → value map.
 *
 * Supported shapes:
 *   key: value          → string
 *   key:                 → list (followed by `  - item` lines)
 *     - item
 */
export function parseFrontmatter(src: string): Record<string, FrontmatterValue> {
  const result: Record<string, FrontmatterValue> = {};
  let currentListKey: string | null = null;

  for (const rawLine of src.split(/\r?\n/)) {
    if (rawLine.trim() === "") continue;

    // List item belonging to the most recent `key:` with no inline value.
    const listItem = rawLine.match(/^\s*-\s+(.*)$/);
    if (listItem && currentListKey) {
      (result[currentListKey] as string[]).push(stripQuotes(listItem[1].trim()));
      continue;
    }

    const kv = rawLine.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!kv) continue;

    const [, key, rawValue] = kv;
    const value = rawValue.trim();

    if (value === "") {
      // Begin a list; subsequent `- item` lines append to it.
      result[key] = [];
      currentListKey = key;
    } else {
      result[key] = stripQuotes(value);
      currentListKey = null;
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Markdown → AgentConfig
// ---------------------------------------------------------------------------

const FRONTMATTER_RE = /^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n?([\s\S]*)$/;

/**
 * Convert a single agent markdown document into a `LoadedAgent`.
 *
 * Returns null when the document has no frontmatter or no `name` — both are
 * required to register an agent.
 */
export function parseAgentMarkdown(raw: string): LoadedAgent | null {
  const match = raw.match(FRONTMATTER_RE);
  if (!match) return null;

  const [, frontmatter, body] = match;
  const meta = parseFrontmatter(frontmatter);

  const name = typeof meta.name === "string" ? meta.name : undefined;
  if (!name) return null;

  const config: AgentConfig = {};

  if (typeof meta.description === "string") config.description = meta.description;
  if (typeof meta.model === "string") config.model = meta.model;
  if (typeof meta.color === "string") config.color = meta.color;

  if (typeof meta.temperature === "string") {
    const temperature = Number.parseFloat(meta.temperature);
    if (!Number.isNaN(temperature)) config.temperature = temperature;
  }

  if (typeof meta.mode === "string" && VALID_MODES.has(meta.mode)) {
    config.mode = meta.mode as AgentConfig["mode"];
  }

  if (Array.isArray(meta.tools) && meta.tools.length > 0) {
    const tools: Record<string, boolean> = {};
    for (const toolName of meta.tools) tools[toolName] = true;
    config.tools = tools;
  }

  const prompt = body.trim();
  if (prompt) config.prompt = prompt;

  return { name, config };
}

// ---------------------------------------------------------------------------
// Directory loading
// ---------------------------------------------------------------------------

/**
 * Load every `*.md` agent definition from a directory into a name → AgentConfig
 * map. Unreadable or malformed files are skipped. Returns an empty map if the
 * directory is missing or cannot be read.
 */
export function loadAgentConfigs(agentsDir: string): Record<string, AgentConfig> {
  const agents: Record<string, AgentConfig> = {};

  try {
    if (!existsSync(agentsDir)) return agents;

    for (const file of readdirSync(agentsDir)) {
      if (!file.endsWith(".md")) continue;

      try {
        const raw = readFileSync(join(agentsDir, file), "utf-8");
        const parsed = parseAgentMarkdown(raw);
        if (parsed) agents[parsed.name] = parsed.config;
      } catch {
        // Skip a single unreadable/malformed agent file.
      }
    }
  } catch {
    // Directory read failure → no agents.
  }

  return agents;
}

// ---------------------------------------------------------------------------
// Command parsing & loading
// ---------------------------------------------------------------------------

/** Agent name alias mapping for the `agent` frontmatter field. */
const AGENT_ALIASES: Record<string, string> = {
  orchestrator: "goop-orchestrator",
};

/**
 * Parse a command markdown file into a `LoadedCommand`.
 *
 * Frontmatter must contain `name`. The body becomes the `template` that
 * OpenCode sends to the agent when the command is invoked.
 */
export function parseCommandMarkdown(raw: string): LoadedCommand | null {
  const match = raw.match(FRONTMATTER_RE);
  if (!match) return null;

  const [, frontmatter, body] = match;
  const meta = parseFrontmatter(frontmatter);

  const name = typeof meta.name === "string" ? meta.name : undefined;
  if (!name) return null;

  const template = body.trim();
  if (!template) return null;

  const cmd: LoadedCommand = { name, template };

  if (typeof meta.description === "string") cmd.description = meta.description;

  if (typeof meta.agent === "string") {
    cmd.agent = AGENT_ALIASES[meta.agent] ?? meta.agent;
  }

  return cmd;
}

/**
 * Load every `*.md` command definition from a directory into a name → command
 * config map suitable for `Config.command`. Unreadable or malformed files are
 * skipped. Returns an empty map if the directory is missing.
 */
export function loadCommandConfigs(
  commandsDir: string,
): Record<string, { template: string; description?: string; agent?: string }> {
  const commands: Record<string, { template: string; description?: string; agent?: string }> = {};

  try {
    if (!existsSync(commandsDir)) return commands;

    for (const file of readdirSync(commandsDir)) {
      if (!file.endsWith(".md")) continue;

      try {
        const raw = readFileSync(join(commandsDir, file), "utf-8");
        const parsed = parseCommandMarkdown(raw);
        if (parsed) {
          const { name, ...rest } = parsed;
          commands[name] = rest;
        }
      } catch {
        // Skip a single unreadable/malformed command file.
      }
    }
  } catch {
    // Directory read failure → no commands.
  }

  return commands;
}
