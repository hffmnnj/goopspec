import { existsSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { exec as execCallback } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { goopspecHome } from "../../shared/paths.js";
import type {
  InstallOptions,
  ServiceAdapter,
  ServiceInfo,
  ServiceOperationResult,
} from "./types.js";

const execAsync = promisify(execCallback);

const LABEL = "com.goopspec.daemon";
const PLIST_FILE = "com.goopspec.daemon.plist";

export class LaunchdAdapter implements ServiceAdapter {
  readonly platform = "launchd";

  async install(options: InstallOptions): Promise<ServiceOperationResult> {
    try {
      const plistDir = this.getLaunchAgentsDir();
      await mkdir(plistDir, { recursive: true });
      await mkdir(goopspecHome(), { recursive: true });

      await writeFile(this.getPlistPath(), this.buildPlist(options), "utf8");

      const result = await exec(`launchctl load -w ${this.getPlistPath()}`);
      if (result.exitCode !== 0) {
        return { success: false, message: result.stderr || "Failed to load launch agent" };
      }

      return { success: true, message: "Installed launchd user agent" };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : "Failed to install launchd agent",
      };
    }
  }

  async uninstall(): Promise<ServiceOperationResult> {
    try {
      await exec(`launchctl unload -w ${this.getPlistPath()}`);
      await rm(this.getPlistPath(), { force: true });
      return { success: true, message: "Uninstalled launchd user agent" };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : "Failed to uninstall launchd agent",
      };
    }
  }

  async start(): Promise<ServiceOperationResult> {
    try {
      const result = await exec(`launchctl start ${LABEL}`);
      if (result.exitCode !== 0) {
        return { success: false, message: result.stderr || "Failed to start launchd service" };
      }

      return { success: true, message: "Started launchd user agent" };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : "Failed to start launchd agent",
      };
    }
  }

  async stop(): Promise<ServiceOperationResult> {
    try {
      const result = await exec(`launchctl stop ${LABEL}`);
      if (result.exitCode !== 0) {
        return { success: false, message: result.stderr || "Failed to stop launchd service" };
      }

      return { success: true, message: "Stopped launchd user agent" };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : "Failed to stop launchd agent",
      };
    }
  }

  async status(): Promise<ServiceInfo> {
    try {
      const result = await exec(`launchctl list ${LABEL}`);
      if (result.exitCode !== 0) {
        const errorText = `${result.stdout} ${result.stderr}`.toLowerCase();
        if (errorText.includes("could not find") || errorText.includes("not found")) {
          return { status: "not-installed", message: "Service is not installed" };
        }

        return { status: "unknown", message: result.stderr || "Failed to query launchd status" };
      }

      const line = result.stdout
        .split("\n")
        .map((entry) => entry.trim())
        .find((entry) => entry.includes(LABEL));

      if (!line) {
        return { status: "stopped", message: "Service loaded but not running" };
      }

      const parts = line.split(/\s+/);
      const pidPart = parts[0] ?? "-";
      const statusPart = parts[1] ?? "0";
      const pid = Number.parseInt(pidPart, 10);
      const statusCode = Number.parseInt(statusPart, 10);

      if (!Number.isNaN(pid) && pid > 0) {
        return { status: "running", pid, message: "Service is running" };
      }

      if (!Number.isNaN(statusCode) && statusCode !== 0) {
        return { status: "stopped", message: `Exited with status ${statusCode}` };
      }

      return { status: "stopped", message: "Service is loaded" };
    } catch (error) {
      return {
        status: "unknown",
        message: error instanceof Error ? error.message : "Failed to get launchd status",
      };
    }
  }

  async isInstalled(): Promise<boolean> {
    try {
      return existsSync(this.getPlistPath());
    } catch {
      return false;
    }
  }

  private getLaunchAgentsDir(): string {
    return join(homedir(), "Library", "LaunchAgents");
  }

  private getPlistPath(): string {
    return join(this.getLaunchAgentsDir(), PLIST_FILE);
  }

  private buildPlist(options: InstallOptions): string {
    const home = homedir();

    return `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0">\n<dict>\n  <key>Label</key>\n  <string>${LABEL}</string>\n  <key>ProgramArguments</key>\n  <array>\n    <string>${options.bunPath}</string>\n    <string>run</string>\n    <string>${options.daemonPath}</string>\n  </array>\n  <key>EnvironmentVariables</key>\n  <dict>\n    <key>GOOPSPEC_DAEMON_PORT</key>\n    <string>${options.port}</string>\n  </dict>\n  <key>RunAtLoad</key>\n  <true/>\n  <key>KeepAlive</key>\n  <true/>\n  <key>StandardOutPath</key>\n  <string>${home}/.goopspec/daemon.log</string>\n  <key>StandardErrorPath</key>\n  <string>${home}/.goopspec/daemon-error.log</string>\n</dict>\n</plist>\n`;
  }
}

async function exec(
  cmd: string,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  try {
    const result = await execAsync(cmd);
    if (typeof result === "string") {
      return {
        stdout: result,
        stderr: "",
        exitCode: 0,
      };
    }

    return {
      stdout: result.stdout ?? "",
      stderr: result.stderr ?? "",
      exitCode: 0,
    };
  } catch (error) {
    const details = error as {
      stdout?: string;
      stderr?: string;
      code?: number | string;
    };

    return {
      stdout: details.stdout ?? "",
      stderr: details.stderr ?? (error instanceof Error ? error.message : ""),
      exitCode: typeof details.code === "number" ? details.code : 1,
    };
  }
}
