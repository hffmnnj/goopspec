/**
 * GoopSpec CLI - Daemon Command
 * Manages the GoopSpec daemon service (start, stop, status, install, uninstall).
 *
 * Uses platform-specific service adapters (systemd, launchd, SCM) to manage
 * the daemon as a user-mode system service. No root/admin required.
 */

import { execSync } from "node:child_process";
import { resolve } from "node:path";

import type { DaemonHealth } from "@goopspec/core";

import { createDaemonClient } from "../../features/daemon/client.js";
import { detectPlatform } from "../../features/setup/platform.js";
import { formatUptime, handleCommandError } from "../command-utils.js";
import { keyValue, statusLine, themedSpinner, themedTable } from "../components.js";
import { getConfig } from "../config.js";
import { createServiceAdapter } from "../services/index.js";
import type { InstallOptions } from "../services/types.js";
import { dim, error as errorColor, info, success as successColor, warning } from "../theme.js";
import { confirm, isCancel, sectionHeader, showBanner, showError, showInfo, showSuccess } from "../ui.js";

const VALID_SUBCOMMANDS = ["start", "stop", "status", "install", "uninstall"] as const;
type DaemonSubcommand = (typeof VALID_SUBCOMMANDS)[number];

/**
 * `goopspec daemon <subcommand>` command
 * Manages the GoopSpec daemon as a system service.
 */
export async function runDaemon(
  subcommand: string,
  _flags: Record<string, string | boolean>,
): Promise<void> {
  try {
    if (!isValidSubcommand(subcommand)) {
      showError(
        `Unknown daemon subcommand: '${subcommand}'. Use start|stop|status|install|uninstall`,
      );
      return;
    }

    switch (subcommand) {
      case "start":
        await handleStart();
        break;
      case "stop":
        await handleStop();
        break;
      case "status":
        await handleStatus();
        break;
      case "install":
        await handleInstall();
        break;
      case "uninstall":
        await handleUninstall();
        break;
    }
  } catch (error) {
    handleCommandError(error);
  }
}

// ---------------------------------------------------------------------------
// Subcommand handlers
// ---------------------------------------------------------------------------

async function handleStart(): Promise<void> {
  showBanner();
  console.log();
  sectionHeader("GoopSpec Daemon", "🔮");
  console.log();

  const platform = detectPlatform();
  const adapter = createServiceAdapter(platform);

  console.log(statusLine("Platform:", platform.description, "info"));
  console.log(statusLine("Service:", adapter.platform, "info"));
  console.log();

  // Install service definition if not already installed
  const installOptions = await resolveInstallOptions();
  const installSpin = themedSpinner("Installing service...");
  const installResult = await adapter.install(installOptions);

  if (!installResult.success) {
    installSpin.fail("Service installation failed");
    console.log();
    showError(installResult.message);
    return;
  }

  installSpin.stop("Service installed");

  // Start the daemon
  const startSpin = themedSpinner("Starting daemon...");
  const startResult = await adapter.start();

  if (!startResult.success) {
    startSpin.fail("Failed to start daemon");
    console.log();
    showError(startResult.message);
    return;
  }

  startSpin.stop("Daemon started");

  // Wait for daemon to become healthy
  const health = await waitForDaemonHealth(5000);

  console.log();
  if (health) {
    showSuccess("Daemon is running");
    console.log();
    console.log(keyValue("URL", info(health.url)));
    console.log(keyValue("Version", health.version));
    console.log();
  } else {
    showInfo("Daemon service started but health check timed out");
    showInfo("It may still be initializing. Check with: goopspec daemon status");
    console.log();
  }
}

async function handleStop(): Promise<void> {
  const platform = detectPlatform();
  const adapter = createServiceAdapter(platform);

  const spin = themedSpinner("Stopping daemon...");
  const result = await adapter.stop();

  if (result.success) {
    spin.stop("Daemon stopped");
    console.log();
    showSuccess("Daemon stopped");
    console.log();
  } else {
    spin.fail("Failed to stop daemon");
    console.log();
    showError(result.message);
  }
}

async function handleStatus(): Promise<void> {
  showBanner();
  console.log();
  sectionHeader("GoopSpec Daemon Status", "🔮");
  console.log();

  const platform = detectPlatform();
  const adapter = createServiceAdapter(platform);
  const config = await getConfig();

  // Get service status from adapter
  const serviceInfo = await adapter.status();

  // Try to query daemon health
  let health: DaemonHealth | null = null;
  try {
    const client = await createDaemonClient();
    health = await client.get<DaemonHealth>("/health");
  } catch {
    // Daemon not reachable — that's fine, we'll show disconnected
  }

  // Build status table
  const serviceStatusDisplay = formatServiceStatus(serviceInfo.status);
  const healthDisplay = health ? successColor("connected") : errorColor("disconnected");
  const versionDisplay = health?.version ?? dim("—");
  const uptimeDisplay = health ? formatUptime(health.uptime) : dim("—");
  const portDisplay = String(config.port);

  const table = themedTable(
    ["Property", "Value"],
    [
      ["Service", serviceStatusDisplay],
      ["Health", healthDisplay],
      ["Version", versionDisplay],
      ["Uptime", uptimeDisplay],
      ["Port", portDisplay],
    ],
  );

  console.log(table);
  console.log();

  if (serviceInfo.status === "not-installed") {
    showInfo("Run 'goopspec daemon install' to set up as a service");
    console.log();
  }
}

async function handleInstall(): Promise<void> {
  const platform = detectPlatform();
  const adapter = createServiceAdapter(platform);

  console.log(statusLine("Platform:", platform.description, "info"));
  console.log();

  const installOptions = await resolveInstallOptions();
  const spin = themedSpinner("Installing service...");
  const result = await adapter.install(installOptions);

  if (result.success) {
    spin.stop("Service installed");
    console.log();
    showSuccess("Service installed. Run 'goopspec daemon start' to start");
    console.log();
  } else {
    spin.fail("Installation failed");
    console.log();
    showError(result.message);
  }
}

async function handleUninstall(): Promise<void> {
  const shouldContinue = await confirm({
    message: "This will remove the GoopSpec daemon service. Continue?",
  });

  if (isCancel(shouldContinue) || !shouldContinue) {
    showInfo("Uninstall cancelled");
    return;
  }

  const platform = detectPlatform();
  const adapter = createServiceAdapter(platform);

  const spin = themedSpinner("Uninstalling service...");
  const result = await adapter.uninstall();

  if (result.success) {
    spin.stop("Service uninstalled");
    console.log();
    showSuccess("Daemon service has been removed");
    console.log();
  } else {
    spin.fail("Uninstall failed");
    console.log();
    showError(result.message);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isValidSubcommand(cmd: string): cmd is DaemonSubcommand {
  return (VALID_SUBCOMMANDS as readonly string[]).includes(cmd);
}

/**
 * Resolve the bun executable path.
 * Checks process.execPath first (if running under Bun), then falls back to `which bun`.
 */
export function resolveBunPath(): string {
  // If running under Bun, process.execPath points to the bun binary
  if (process.execPath && /bun/i.test(process.execPath)) {
    return process.execPath;
  }

  // Fallback: find bun on PATH
  try {
    const cmd = process.platform === "win32" ? "where bun" : "which bun";
    return execSync(cmd, { encoding: "utf-8" }).trim();
  } catch {
    // Last resort — assume bun is on PATH
    return "bun";
  }
}

/**
 * Resolve the daemon entry point path.
 * Points to the daemon package's index.ts relative to the monorepo.
 */
export function resolveDaemonPath(): string {
  // Try to resolve from the monorepo structure
  // The daemon package is at packages/daemon/src/index.ts relative to the repo root
  try {
    // Use require.resolve to find the daemon package entry
    const daemonEntry = require.resolve("@goopspec/daemon");
    return daemonEntry;
  } catch {
    // Fallback: resolve relative to this file's location in the monorepo
    // This file: packages/opencode-plugin/src/cli/commands/daemon.ts
    // Target:    packages/daemon/src/index.ts
    return resolve(__dirname, "../../../../daemon/src/index.ts");
  }
}

async function resolveInstallOptions(): Promise<InstallOptions> {
  const config = await getConfig();
  return {
    bunPath: resolveBunPath(),
    daemonPath: resolveDaemonPath(),
    port: config.port,
    host: config.host,
  };
}

/**
 * Wait for the daemon to respond to /health within the given timeout.
 * Returns health info on success, null on timeout.
 */
async function waitForDaemonHealth(
  timeoutMs: number,
): Promise<{ version: string; url: string } | null> {
  const start = Date.now();
  const pollInterval = 500;

  while (Date.now() - start < timeoutMs) {
    try {
      const client = await createDaemonClient();
      const health = await client.get<DaemonHealth>("/health");
      return {
        version: health.version,
        url: client.getBaseUrl(),
      };
    } catch {
      // Not ready yet — wait and retry
      await sleep(pollInterval);
    }
  }

  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatServiceStatus(status: string): string {
  switch (status) {
    case "running":
      return successColor("running");
    case "stopped":
      return warning("stopped");
    case "not-installed":
      return dim("not-installed");
    default:
      return dim(status);
  }
}
