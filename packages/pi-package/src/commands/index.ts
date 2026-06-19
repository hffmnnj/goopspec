import type { GoopPiContext, PiExtensionAPI } from "../core/types.js";
import { createGoopAcceptCommand } from "./goop-accept.js";
import { createGoopDiscussCommand } from "./goop-discuss.js";
import { createGoopExecuteCommand } from "./goop-execute.js";
import { createGoopPlanCommand } from "./goop-plan.js";
import { createGoopStatusCommand } from "./goop-status.js";

/**
 * Register all GoopSpec phase commands with Pi.
 *
 * Each command transitions the workflow to the appropriate phase
 * and prints a brief status banner to stdout.
 */
export function registerCommands(pi: PiExtensionAPI, ctx: GoopPiContext): void {
  pi.registerCommand("goop-discuss", createGoopDiscussCommand(ctx));
  pi.registerCommand("goop-plan", createGoopPlanCommand(ctx));
  pi.registerCommand("goop-execute", createGoopExecuteCommand(ctx));
  pi.registerCommand("goop-accept", createGoopAcceptCommand(ctx));
  pi.registerCommand("goop-status", createGoopStatusCommand(ctx));
}
