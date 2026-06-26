import { renderConfigScreen } from "./screens/config.js";
import { renderDashboardScreen } from "./screens/dashboard.js";
import { renderHelpScreen } from "./screens/help.js";
import { renderModelsScreen } from "./screens/models.js";
import { renderStatusScreen } from "./screens/status.js";
import { renderUninstallScreen } from "./screens/uninstall.js";

export type Command = "status" | "config" | "models" | "dashboard" | "uninstall" | "help";

const commands: ReadonlySet<string> = new Set<Command>([
  "status",
  "config",
  "models",
  "dashboard",
  "uninstall",
  "help",
]);

export async function route(command: string, args: string[]): Promise<void> {
  if (!commands.has(command)) {
    await renderHelpScreen(command);
    return;
  }

  switch (command as Command) {
    case "status":
      await renderStatusScreen();
      return;
    case "config":
      await renderConfigScreen();
      return;
    case "models":
      await renderModelsScreen();
      return;
    case "dashboard":
      await renderDashboardScreen(args[0]);
      return;
    case "uninstall":
      await renderUninstallScreen({ dryRun: args.includes("--dry-run") });
      return;
    case "help":
      await renderHelpScreen();
      return;
  }
}
