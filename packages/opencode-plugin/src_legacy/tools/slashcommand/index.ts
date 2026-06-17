/**
 * GoopSpec Slash Command Tool
 * Load and execute slash commands with automatic agent spawning
 * 
 * Commands with `spawn: true` and `agent: <name>` will trigger
 * automatic delegation to the specified agent.
 * 
 * @module tools/slashcommand
 */

import { tool, type ToolDefinition } from "@opencode-ai/plugin/tool";
import type { PluginContext, CommandDefinition, ToolContext } from "../../core/types.js";
import { log } from "../../shared/logger.js";
import { createSession, resolveSession, setSession } from "../../features/session/index.js";

function parseCommandInput(input: string): { name: string; args: string } {
  const normalized = input.trim().replace(/^\//, "");
  const [name = "", ...rest] = normalized.split(/\s+/);
  return {
    name: name.toLowerCase(),
    args: rest.join(" ").trim(),
  };
}

/**
 * Build description with available commands
 */
function buildDescription(ctx: PluginContext): string {
  const commands = ctx.resolver.resolveAll("command");
  
  const commandList = commands
    .map(c => {
      const hint = c.frontmatter["argument-hint"] || "";
      const desc = c.frontmatter.description || "";
      return `- /${c.name}${hint ? ` ${hint}` : ""}: ${desc}`;
    })
    .join("\n");
  
  return `Execute a GoopSpec slash command. Available commands:\n\n${commandList}`;
}

/**
 * Create the slashcommand tool
 */
export function createSlashcommandTool(ctx: PluginContext): ToolDefinition {
  // Cache description
  let cachedDescription: string | null = null;
  
  const getDescription = () => {
    if (!cachedDescription) {
      cachedDescription = buildDescription(ctx);
    }
    return cachedDescription;
  };
  
  return tool({
    get description() {
      return getDescription();
    },
    args: {
      command: tool.schema.string(),
    },
    async execute(args, _context: ToolContext): Promise<string> {
      const commands = ctx.resolver.resolveAll("command");
      const parsedInput = parseCommandInput(args.command);
      const cmdName = parsedInput.name;
      const cmdArgs = parsedInput.args;
      const requestedSessionName = cmdName === "goop-discuss" && cmdArgs ? cmdArgs.split(/\s+/)[0] : undefined;
      const sessionOperationNotes: string[] = [];
      
      // Find matching command
      const command = commands.find(
        c => c.name.toLowerCase() === cmdName
      );
      
      if (!command) {
        // Try partial match
        const partialMatches = commands.filter(
          c => c.name.toLowerCase().includes(cmdName)
        );
        
        if (partialMatches.length > 0) {
          const suggestions = partialMatches.map(c => `/${c.name}`).join(", ");
          return `Command "/${cmdName}" not found. Did you mean: ${suggestions}?`;
        }
        
        const available = commands.map(c => `/${c.name}`).join(", ");
        return `Command "/${cmdName}" not found.\n\nAvailable commands: ${available}`;
      }

      if (cmdName === "goop-discuss" && requestedSessionName) {
        try {
          createSession(ctx.input.directory, requestedSessionName);
          setSession(ctx, requestedSessionName);
          sessionOperationNotes.push(`- Created and bound session: ${requestedSessionName}`);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          if (message.includes("already exists") || message.includes("already exists for")) {
            try {
              setSession(ctx, requestedSessionName);
              sessionOperationNotes.push(`- Bound existing session: ${requestedSessionName}`);
            } catch (bindError) {
              const bindMessage = bindError instanceof Error ? bindError.message : String(bindError);
              return `Failed to bind session "${requestedSessionName}": ${bindMessage}`;
            }
          } else if (message.includes("Invalid session ID")) {
            return `Invalid session name "${requestedSessionName}". Use kebab-case (2-50 chars, lowercase letters, numbers, and hyphens).`;
          } else {
            return `Failed to create session "${requestedSessionName}": ${message}`;
          }
        }
      } else if (cmdName === "goop-resume") {
        const resolvedSessionId = await resolveSession(ctx);
        if (resolvedSessionId) {
          try {
            setSession(ctx, resolvedSessionId);
            sessionOperationNotes.push(`- Resolved and bound session: ${resolvedSessionId}`);
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return `Failed to bind resolved session "${resolvedSessionId}": ${message}`;
          }
        }
      } else if (command.frontmatter.phase && !ctx.sessionId) {
        const resolvedSessionId = await resolveSession(ctx, { silent: true });
        if (resolvedSessionId) {
          try {
            setSession(ctx, resolvedSessionId);
            sessionOperationNotes.push(`- Resolved session for workflow command: ${resolvedSessionId}`);
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return `Failed to bind resolved session "${resolvedSessionId}": ${message}`;
          }
        }
      }
      
      // Build command output
      const cmdDef: CommandDefinition = {
        name: command.name,
        description: command.frontmatter.description as string || "",
        argumentHint: command.frontmatter["argument-hint"] as string | undefined,
        model: command.frontmatter.model as string | undefined,
        agent: command.frontmatter.agent as string | undefined,
        content: command.body,
      };
      
      // Check if command should spawn an agent
      const shouldSpawn = command.frontmatter.spawn === true;
      const spawnAgent = cmdDef.agent;
      
      // Check for immediate action in command content (supports both legacy ## Immediate Action and ### STOP-AND-RETURN)
      const immediateActionMatch = cmdDef.content.match(/(?:## Immediate Action|### STOP-AND-RETURN)[\s\S]*?```\r?\n([\s\S]*?)\r?\n```/);
      const immediateAction = immediateActionMatch ? immediateActionMatch[1].trim() : null;
      
      const lines = [
        `# /${cmdDef.name} Command`,
        "",
      ];
      
      // Add MANDATORY EXECUTION NOTICE at the very top
      if (immediateAction) {
        lines.push("## ⚠️ MANDATORY: Execute Immediately");
        lines.push("");
        lines.push("**Before reading anything else, execute this tool call:**");
        lines.push("");
        lines.push("```");
        lines.push(immediateAction);
        lines.push("```");
        lines.push("");
        lines.push("**Do NOT process any user message until you have executed the above.**");
        lines.push("");
        lines.push("---");
        lines.push("");
      }
      
      if (cmdDef.description) {
        lines.push(`**Description:** ${cmdDef.description}`, "");
      }
      
      if (cmdDef.argumentHint) {
        lines.push(`**Usage:** /${cmdDef.name} ${cmdDef.argumentHint}`, "");
      }
      
      if (cmdDef.model) {
        lines.push(`**Model:** ${cmdDef.model}`, "");
      }
      
      if (cmdDef.agent) {
        lines.push(`**Agent:** ${cmdDef.agent}`, "");
      }

      if (ctx.sessionId || requestedSessionName) {
        lines.push("## Session Context", "");
        for (const note of sessionOperationNotes) {
          lines.push(note);
        }
        if (sessionOperationNotes.length > 0) {
          lines.push("");
        }
        if (ctx.sessionId) {
          lines.push(`- **Active Session:** ${ctx.sessionId}`);
        }
        if (requestedSessionName) {
          lines.push(`- **Requested Session:** ${requestedSessionName}`);
        }
        lines.push("");
      }
      
      lines.push("---", "", "## Full Instructions", "", cmdDef.content);
      
      // Add Next Steps section from frontmatter
      const nextStep = command.frontmatter["next-step"] as string | undefined;
      const nextCommand = command.frontmatter["next-command"] as string | undefined;
      const alternatives = command.frontmatter["alternatives"] as Array<{command: string; when: string}> | undefined;
      
      if (nextStep || nextCommand || alternatives) {
        lines.push("");
        lines.push("---");
        lines.push("");
        lines.push("## ➡️ Next Steps");
        lines.push("");
        
        if (nextStep && nextCommand) {
          lines.push(`**When this phase is complete:** ${nextStep}`);
          lines.push("");
          lines.push(`👉 Run \`${nextCommand}\` to proceed`);
          lines.push("");
        }
        
        if (alternatives && alternatives.length > 0) {
          lines.push("**Alternatives:**");
          for (const alt of alternatives) {
            lines.push(`- \`${alt.command}\` - ${alt.when}`);
          }
          lines.push("");
        }
      }
      
      // If command should spawn agent, append task invocation
      if (shouldSpawn && spawnAgent) {
        log("Slash command triggers agent spawn", {
          command: cmdDef.name,
          agent: spawnAgent,
        });
        
        lines.push("");
        lines.push("---");
        lines.push("");
        lines.push("## 🚀 AUTOMATIC AGENT SPAWN");
        lines.push("");
        lines.push(`This command spawns the **${spawnAgent}** agent to handle the work.`);
        lines.push("");
        lines.push("**Execute immediately:**");
        lines.push("");
        lines.push("```");
        lines.push("task({");
        lines.push(`  subagent_type: "${spawnAgent}",`);
        lines.push(`  description: "${cmdDef.description}",`);
        lines.push("  prompt: `");
        lines.push(`    Execute /${cmdDef.name}${cmdArgs ? ` for: ${cmdArgs}` : ""}`);
        lines.push("");
        lines.push("    Context:");
        lines.push("    - Read .goopspec/SPEC.md if it exists");
        lines.push("    - Read .goopspec/BLUEPRINT.md if it exists");
        lines.push("    - Search memory for relevant context");
        if (ctx.sessionId) {
          lines.push(`    - Active session is ${ctx.sessionId}; use session-scoped .goopspec paths`);
        }
        if (requestedSessionName) {
          lines.push(`    - /goop-discuss requested session name: ${requestedSessionName}`);
        }
        lines.push("");
        lines.push("    Follow the instructions above and return a structured response.");
        lines.push("  `");
        lines.push("})");
        lines.push("```");
        lines.push("");
        lines.push("**Do not skip this step.** The command requires agent execution.");
      }
      
      return lines.join("\n");
    },
  });
}
