/**
 * GoopSpec Slash Command Tool
 *
 * Resolves a GoopSpec slash command name to its markdown content from the
 * `commands/` directory. Returns the raw markdown so the orchestrator can
 * read and execute the workflow instructions.
 *
 * DESIGN INTENT (1.0.0):
 * This tool is intentionally side-effect-free. It does NOT create sessions,
 * bind workflows, or mutate any state. Those concerns belong to the session
 * subsystem and the command-processor hook (Wave 5). Keeping this tool simple
 * eliminates the stale-session-binding bug present in 0.2.x where the tool
 * would silently bind to a stale workflow ID.
 *
 * @module tools/slashcommand
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { tool } from "../../core/sdk-compat.js";
import type { ToolContext, ToolDefinition } from "../../core/sdk-compat.js";
import type { PluginContext } from "../../core/types.js";
import { getPackageRoot } from "../../shared/paths.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * The 9 kept commands for GoopSpec 1.0.0.
 * Used to build the "available commands" list in error messages.
 */
const KEPT_COMMANDS = [
  "goop-discuss",
  "goop-plan",
  "goop-execute",
  "goop-accept",
  "goop-quick",
  "goop-status",
  "goop-setup",
  "goop-help",
  "goop-amend",
] as const;

// ---------------------------------------------------------------------------
// Path resolution
// ---------------------------------------------------------------------------

/**
 * Resolve the absolute path to the `commands/` directory.
 *
 * Strategy (in order):
 * 1. `ctx.sdk.directory` — the project root where the plugin is running.
 *    Commands may live at `<project>/.goopspec/commands/` (project overrides).
 * 2. Package root — the `commands/` directory shipped with the plugin package,
 *    resolved via the shared `getPackageRoot()` helper which is robust across
 *    both the source tree and the single-file bundled `dist/index.js`.
 *
 * Returns the first directory that exists.
 */
function resolveCommandsDir(projectDir: string): string {
  // Check for project-local command overrides first
  const projectOverride = join(projectDir, ".goopspec", "commands");
  if (existsSync(projectOverride)) {
    return projectOverride;
  }

  // Fall back to the package-bundled commands directory.
  return join(getPackageRoot(), "commands");
}

// ---------------------------------------------------------------------------
// Command name normalisation
// ---------------------------------------------------------------------------

/**
 * Normalise a raw command input to a bare command name.
 *
 * Handles:
 * - Leading `/` strip: `/goop-plan` → `goop-plan`
 * - `goop-` prefix tolerance: `plan` → `goop-plan`
 * - Trailing arguments are ignored (only the first token is used)
 * - Case-insensitive
 */
function normaliseCommandName(input: string): string {
  const token = input.trim().split(/\s+/)[0] ?? "";
  const stripped = token.replace(/^\//, "").toLowerCase();

  // If the user typed a bare name without the `goop-` prefix, add it.
  if (!stripped.startsWith("goop-") && stripped.length > 0) {
    return `goop-${stripped}`;
  }

  return stripped;
}

// ---------------------------------------------------------------------------
// Command discovery
// ---------------------------------------------------------------------------

/**
 * List all available command names from the commands directory.
 * Returns bare names without the `.md` extension.
 */
function listAvailableCommands(commandsDir: string): string[] {
  try {
    if (!existsSync(commandsDir)) return [...KEPT_COMMANDS];
    return readdirSync(commandsDir)
      .filter((f) => f.endsWith(".md"))
      .map((f) => f.slice(0, -3))
      .sort();
  } catch {
    return [...KEPT_COMMANDS];
  }
}

// ---------------------------------------------------------------------------
// Tool factory
// ---------------------------------------------------------------------------

export function createSlashcommandTool(ctx: PluginContext): ToolDefinition {
  const availableList = KEPT_COMMANDS.map((c) => `/${c}`).join(", ");
  return tool({
    description: `Execute a GoopSpec slash command. Resolves the command name to its markdown instructions from the commands/ directory and returns the content. Available commands: ${availableList}`,
    args: {
      command: tool.schema
        .string()
        .describe(
          'Command name to execute, e.g. "/goop-plan" or "goop-plan". Leading slash and goop- prefix are both optional.',
        ),
    },
    async execute(args: { command: string }, _context: ToolContext): Promise<string> {
      try {
        const commandsDir = resolveCommandsDir(ctx.sdk.directory);
        const name = normaliseCommandName(args.command);

        if (!name) {
          const available = listAvailableCommands(commandsDir);
          return buildUnknownCommandError("(empty)", available);
        }

        const filePath = join(commandsDir, `${name}.md`);

        if (!existsSync(filePath)) {
          const available = listAvailableCommands(commandsDir);
          return buildUnknownCommandError(name, available);
        }

        const content = readFileSync(filePath, "utf-8");
        return content;
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        return `Error resolving command "${args.command}": ${msg}`;
      }
    },
  });
}

// ---------------------------------------------------------------------------
// Error formatting
// ---------------------------------------------------------------------------

function buildUnknownCommandError(name: string, available: string[]): string {
  const list = available.map((c) => `  - /${c}`).join("\n");
  return `Command "/${name}" not found.\n\nAvailable commands:\n${list}\n\nUsage: pass the command name with or without the leading slash, e.g. "goop-plan" or "/goop-plan".`;
}
