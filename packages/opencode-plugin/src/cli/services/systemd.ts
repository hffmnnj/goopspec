import { existsSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { exec as execCallback } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import type {
  InstallOptions,
  ServiceAdapter,
  ServiceInfo,
  ServiceOperationResult,
} from "./types.js";

const execAsync = promisify(execCallback);

const SERVICE_NAME = "goopspec-daemon";
const SERVICE_FILE = "goopspec-daemon.service";

export class SystemdAdapter implements ServiceAdapter {
  readonly platform = "systemd";

  async install(options: InstallOptions): Promise<ServiceOperationResult> {
    try {
      const unitDir = this.getUnitDir();
      await mkdir(unitDir, { recursive: true });
      await writeFile(this.getServicePath(), this.buildServiceFile(options), "utf8");

      const reload = await exec(`systemctl --user daemon-reload`);
      if (reload.exitCode !== 0) {
        return { success: false, message: reload.stderr || "Failed to reload systemd user daemon" };
      }

      const enable = await exec(`systemctl --user enable ${SERVICE_NAME}`);
      if (enable.exitCode !== 0) {
        return { success: false, message: enable.stderr || "Failed to enable service" };
      }

      return { success: true, message: "Installed systemd user service" };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : "Failed to install systemd service",
      };
    }
  }

  async uninstall(): Promise<ServiceOperationResult> {
    try {
      await exec(`systemctl --user disable ${SERVICE_NAME}`);
      await rm(this.getServicePath(), { force: true });

      const reload = await exec(`systemctl --user daemon-reload`);
      if (reload.exitCode !== 0) {
        return { success: false, message: reload.stderr || "Failed to reload systemd user daemon" };
      }

      return { success: true, message: "Uninstalled systemd user service" };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : "Failed to uninstall systemd service",
      };
    }
  }

  async start(): Promise<ServiceOperationResult> {
    try {
      const result = await exec(`systemctl --user start ${SERVICE_NAME}`);
      if (result.exitCode !== 0) {
        return { success: false, message: result.stderr || "Failed to start service" };
      }

      return { success: true, message: "Started systemd user service" };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : "Failed to start systemd service",
      };
    }
  }

  async stop(): Promise<ServiceOperationResult> {
    try {
      const result = await exec(`systemctl --user stop ${SERVICE_NAME}`);
      if (result.exitCode !== 0) {
        return { success: false, message: result.stderr || "Failed to stop service" };
      }

      return { success: true, message: "Stopped systemd user service" };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : "Failed to stop systemd service",
      };
    }
  }

  async status(): Promise<ServiceInfo> {
    try {
      const result = await exec(`systemctl --user is-active ${SERVICE_NAME}`);
      const state = result.stdout.trim().toLowerCase();

      if (state === "active") {
        return { status: "running", message: "Service is active" };
      }

      if (
        state === "inactive" ||
        state === "failed" ||
        state === "deactivating" ||
        state === "activating"
      ) {
        return { status: "stopped", message: state };
      }

      if (result.exitCode !== 0) {
        const errorText = `${result.stdout} ${result.stderr}`.toLowerCase();
        if (errorText.includes("not found") || errorText.includes("could not be found")) {
          return { status: "not-installed", message: "Service is not installed" };
        }
      }

      return {
        status: "unknown",
        message: result.stderr || result.stdout || "Unable to determine service status",
      };
    } catch (error) {
      return {
        status: "unknown",
        message: error instanceof Error ? error.message : "Failed to get service status",
      };
    }
  }

  async isInstalled(): Promise<boolean> {
    try {
      return existsSync(this.getServicePath());
    } catch {
      return false;
    }
  }

  private getUnitDir(): string {
    return join(homedir(), ".config", "systemd", "user");
  }

  private getServicePath(): string {
    return join(this.getUnitDir(), SERVICE_FILE);
  }

  private buildServiceFile(options: InstallOptions): string {
    return `[Unit]\nDescription=GoopSpec Daemon\nAfter=network.target\n\n[Service]\nType=simple\nExecStart=${options.bunPath} run ${options.daemonPath}\nEnvironment=GOOPSPEC_DAEMON_PORT=${options.port}\nRestart=on-failure\nRestartSec=5\n\n[Install]\nWantedBy=default.target\n`;
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
