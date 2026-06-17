/**
 * GoopSpec CLI - Status Command
 * Shows current configuration summary and daemon connection state
 */
import pc from "picocolors";

import type { DaemonHealth } from "@goopspec/core";

import { createDaemonClient } from "../../features/daemon/client.js";
import { getSetupStatus } from "../../features/setup/index.js";
import { formatUptime } from "../command-utils.js";
import { statusLine } from "../components.js";
import { formatTable, sectionHeader, showError, showInfo, showWarning } from "../ui.js";

// Re-export for backward compatibility — canonical source is command-utils.ts
export { formatUptime } from "../command-utils.js";

export async function runStatus(): Promise<void> {
  try {
    const projectDir = process.cwd();
    const status = await getSetupStatus(projectDir);

    if (!status.initialized) {
      showInfo("GoopSpec is not initialized in this directory.");
      console.log(pc.dim("  → Run: goopspec init"));
      return;
    }

    sectionHeader("Project", "📦");
    if (status.projectName) {
      console.log(pc.dim(`  Name: ${pc.bold(status.projectName)}`));
    }
    console.log(pc.dim(`  Initialized: ${pc.green("✓")}`));
    console.log();

    sectionHeader("Configuration", "⚙️");
    console.log(`  Global config: ${status.scope.hasGlobal ? pc.green("✓") : pc.dim("✗")}`);
    console.log(`  Project config: ${status.scope.hasProject ? pc.green("✓") : pc.dim("✗")}`);
    console.log();

    sectionHeader("Memory System", "🧠");
    console.log(`  Configured: ${status.memory.configured ? pc.green("✓") : pc.dim("✗")}`);
    console.log(`  Enabled: ${status.memory.enabled ? pc.green("✓") : pc.dim("✗")}`);
    if (status.memory.provider) {
      console.log(`  Provider: ${status.memory.provider}`);
    }
    if (status.memory.workerRunning !== undefined) {
      console.log(`  Worker: ${status.memory.workerRunning ? pc.green("running") : pc.yellow("stopped")}`);
    }
    console.log();

    sectionHeader("MCP Servers", "🔌");
    if (status.mcps.installed.length > 0) {
      console.log(`  Installed: ${status.mcps.installed.join(", ")}`);
    } else {
      console.log(pc.dim("  No MCPs installed"));
    }
    if (status.mcps.missing.length > 0) {
      showWarning(`Recommended: ${status.mcps.missing.join(", ")}`);
    }
    console.log();

    const configuredAgents = Object.entries(status.agentModels);
    if (configuredAgents.length > 0) {
      sectionHeader("Agent Models", "🤖");
      const rows = configuredAgents.map(([agent, model]) => [agent, model]);
      console.log(formatTable(["Agent", "Model"], rows));
    }

    // ── Daemon section ──────────────────────────────────────────────────
    sectionHeader("Daemon", "🔮");
    try {
      const client = await createDaemonClient();
      const health = await client.get<DaemonHealth>("/health");

      console.log(statusLine("Connected", "✓", "ok"));
      console.log(statusLine("Version", health.version, "info"));
      console.log(statusLine("Uptime", formatUptime(health.uptime), "info"));
      console.log(statusLine("Projects", String(health.projectCount), "info"));
      if (health.activeWorkflows > 0) {
        console.log(statusLine("Active workflows", String(health.activeWorkflows), "info"));
      }
    } catch {
      console.log(statusLine("Connected", "✗ (run: goopspec daemon start)", "error"));
      console.log(pc.dim("  Daemon: not running"));
    }
    console.log();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    showError(message, "Check file permissions and try again");
    process.exit(1);
  }
}
