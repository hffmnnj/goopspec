#!/usr/bin/env node

import { GOOPSPEC_VERSION } from "../core/version.js";
import { bold, dim, highlight, info, italic, primary, setColorEnabled, warning } from "./theme.js";
import { CLI_COMMANDS, COMMAND_META, type CliArgs, type CliCommand, type CommandMeta } from "./types.js";
import { showBanner, showError } from "./ui.js";

function isCliCommand(value: string): value is CliCommand {
  return CLI_COMMANDS.includes(value as CliCommand);
}

function isFlag(value: string): boolean {
  return value.startsWith("--");
}

export function parseArgs(argv: string[]): CliArgs {
  const flags: Record<string, string | boolean> = {};
  const positional: string[] = [];

  for (const token of argv) {
    if (isFlag(token)) {
      const flagBody = token.slice(2);
      if (!flagBody) {
        continue;
      }

      // Wire --no-color before any output
      if (flagBody === "no-color") {
        setColorEnabled(false);
        flags[flagBody] = true;
        continue;
      }

      const equalsIndex = flagBody.indexOf("=");
      if (equalsIndex === -1) {
        flags[flagBody] = true;
        continue;
      }

      const key = flagBody.slice(0, equalsIndex);
      const value = flagBody.slice(equalsIndex + 1);
      if (key) {
        flags[key] = value;
      }
      continue;
    }

    positional.push(token);
  }

  const commandInput = positional[0];
  const command = commandInput && isCliCommand(commandInput) ? commandInput : null;

  return {
    command,
    flags,
    args: positional.slice(1),
  };
}

// ---------------------------------------------------------------------------
// Help text — grouped commands with descriptions
// ---------------------------------------------------------------------------

const GROUP_LABELS: Record<CommandMeta["group"], { title: string; emoji: string }> = {
  setup: { title: "Setup", emoji: "⚙" },
  project: { title: "Project", emoji: "📁" },
  daemon: { title: "Daemon", emoji: "🔮" },
  tools: { title: "Tools", emoji: "🛠" },
};

const GROUP_ORDER: CommandMeta["group"][] = ["setup", "project", "daemon", "tools"];

function formatCommandLine(meta: CommandMeta): string {
  const name = highlight(meta.name.padEnd(12));
  return `  ${name} ${dim(meta.description)}`;
}

export function showHelp(): void {
  // Title
  console.log();
  console.log(`  ${primary("🔮 GoopSpec")} ${dim(`v${GOOPSPEC_VERSION}`)}`);
  console.log(`  ${dim("Spec-driven development for AI agents")}`);
  console.log();

  // Usage
  console.log(bold("  Usage:"));
  console.log(`    ${info("goopspec")} ${dim("<command>")} ${dim("[options]")}`);
  console.log();

  // Grouped commands
  console.log(bold("  Commands:"));
  console.log();

  for (const group of GROUP_ORDER) {
    const groupInfo = GROUP_LABELS[group];
    const commands = COMMAND_META.filter((cmd) => cmd.group === group);
    if (commands.length === 0) continue;

    console.log(`  ${dim(groupInfo.emoji)} ${bold(groupInfo.title)}`);
    for (const cmd of commands) {
      console.log(formatCommandLine(cmd));
    }
    console.log();
  }

  // Global options
  console.log(bold("  Options:"));
  console.log(`  ${highlight("--help".padEnd(12))} ${dim("Show help")}`);
  console.log(`  ${highlight("--version".padEnd(12))} ${dim("Show version")}`);
  console.log(`  ${highlight("--no-color".padEnd(12))} ${dim("Disable color output")}`);
  console.log();

  // Tip
  console.log(italic(dim("  Run 'goopspec <command> --help' for command-specific help")));
  console.log();
}

export function showVersion(): void {
  console.log(`goopspec v${GOOPSPEC_VERSION}`);
}

function levenshteinDistance(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const matrix: number[][] = Array.from({ length: rows }, () => Array<number>(cols).fill(0));

  for (let i = 0; i < rows; i += 1) {
    matrix[i][0] = i;
  }
  for (let j = 0; j < cols; j += 1) {
    matrix[0][j] = j;
  }

  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const substitutionCost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + substitutionCost,
      );
    }
  }

  return matrix[a.length][b.length];
}

export function suggestCommand(input: string): string | null {
  if (!input.trim()) {
    return null;
  }

  let bestMatch: CliCommand | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const command of CLI_COMMANDS) {
    const distance = levenshteinDistance(input, command);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestMatch = command;
    }
  }

  const threshold = Math.max(2, Math.floor(input.length / 2));
  return bestDistance <= threshold ? bestMatch : null;
}

export async function main(): Promise<void> {
  const argv = process.argv.slice(2);

  try {
    const parsed = parseArgs(argv);
    const commandInput = argv.find((arg) => !isFlag(arg));

    if (parsed.flags.version) {
      showVersion();
      return;
    }

    if (parsed.flags.help || !commandInput) {
      showHelp();
      return;
    }

    if (parsed.command) {
      switch (parsed.command) {
        case "init": {
          if (parsed.flags["reset-password"]) {
            const { runResetPassword } = await import("./commands/init.js");
            await runResetPassword();
          } else {
            const { runInit } = await import("./commands/init.js");
            await runInit();
          }
          break;
        }
        case "register": {
          const { runRegister } = await import("./commands/register.js");
          await runRegister(parsed.flags);
          break;
        }
        case "daemon": {
          const { runDaemon } = await import("./commands/daemon.js");
          const subcommand = parsed.args[0] ?? "status";
          await runDaemon(subcommand, parsed.flags);
          break;
        }
        case "models": {
          const { runModels } = await import("./commands/models.js");
          await runModels();
          break;
        }
        case "mcp": {
          const { runMcp } = await import("./commands/mcp.js");
          await runMcp();
          break;
        }
        case "memory": {
          const { runMemory } = await import("./commands/memory.js");
          await runMemory();
          break;
        }
        case "status": {
          const { runStatus } = await import("./commands/status.js");
          await runStatus();
          break;
        }
        case "verify": {
          const { runVerify } = await import("./commands/verify.js");
          await runVerify();
          break;
        }
        case "reset": {
          const { runReset } = await import("./commands/reset.js");
          await runReset();
          break;
        }
        default:
          console.log(warning(`Command '${parsed.command}' not yet implemented`));
          break;
      }
      return;
    }

    const suggestion = suggestCommand(commandInput);
    showBanner();
    showError(
      `Unknown command: ${commandInput}`,
      suggestion ? `Did you mean 'goopspec ${suggestion}'?` : "Run 'goopspec --help' for available commands",
    );
    process.exit(1);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    showError(message, "Run 'goopspec verify' to check your setup");
    process.exit(1);
  }
}

void main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  showError(message, "Run 'goopspec verify' to check your setup");
  process.exit(1);
});
