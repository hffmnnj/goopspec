import { exec as execCallback } from "node:child_process";
import { promisify } from "node:util";

import type {
  InstallOptions,
  ServiceAdapter,
  ServiceInfo,
  ServiceOperationResult,
} from "./types.js";

const execAsync = promisify(execCallback);

const TASK_NAME = "GoopSpec Daemon";

export class WindowsAdapter implements ServiceAdapter {
  readonly platform = "scm";

  async install(options: InstallOptions): Promise<ServiceOperationResult> {
    try {
      const command = `schtasks /Create /TN "${TASK_NAME}" /TR "${options.bunPath} run ${options.daemonPath}" /SC ONLOGON /RU "" /F`;
      const result = await exec(command);

      if (result.exitCode !== 0) {
        return { success: false, message: result.stderr || "Failed to create scheduled task" };
      }

      return { success: true, message: "Installed Windows scheduled task" };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : "Failed to install scheduled task",
      };
    }
  }

  async uninstall(): Promise<ServiceOperationResult> {
    try {
      const result = await exec(`schtasks /Delete /TN "${TASK_NAME}" /F`);
      if (result.exitCode !== 0) {
        return { success: false, message: result.stderr || "Failed to delete scheduled task" };
      }

      return { success: true, message: "Uninstalled Windows scheduled task" };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : "Failed to uninstall scheduled task",
      };
    }
  }

  async start(): Promise<ServiceOperationResult> {
    try {
      const result = await exec(`schtasks /Run /TN "${TASK_NAME}"`);
      if (result.exitCode !== 0) {
        return { success: false, message: result.stderr || "Failed to run scheduled task" };
      }

      return { success: true, message: "Started Windows scheduled task" };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : "Failed to start scheduled task",
      };
    }
  }

  async stop(): Promise<ServiceOperationResult> {
    try {
      const result = await exec(`schtasks /End /TN "${TASK_NAME}"`);
      if (result.exitCode !== 0) {
        return { success: false, message: result.stderr || "Failed to end scheduled task" };
      }

      return { success: true, message: "Stopped Windows scheduled task" };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : "Failed to stop scheduled task",
      };
    }
  }

  async status(): Promise<ServiceInfo> {
    try {
      const result = await exec(`schtasks /Query /TN "${TASK_NAME}" /FO LIST`);

      if (result.exitCode !== 0) {
        const errorText = `${result.stdout} ${result.stderr}`.toLowerCase();
        if (errorText.includes("cannot find") || errorText.includes("not exist")) {
          return { status: "not-installed", message: "Task not found" };
        }

        return { status: "unknown", message: result.stderr || "Failed to query task status" };
      }

      const statusLine = result.stdout
        .split("\n")
        .find((line) => line.toLowerCase().startsWith("status:"));
      const value = statusLine?.split(":")[1]?.trim().toLowerCase() ?? "";

      if (value.includes("running")) {
        return { status: "running", message: "Task is running" };
      }

      if (
        value.includes("ready") ||
        value.includes("queued") ||
        value.includes("could not start") ||
        value.includes("not yet run")
      ) {
        return { status: "stopped", message: value || "Task is not running" };
      }

      return { status: "unknown", message: value || "Unable to determine task status" };
    } catch (error) {
      return {
        status: "unknown",
        message: error instanceof Error ? error.message : "Failed to get task status",
      };
    }
  }

  async isInstalled(): Promise<boolean> {
    try {
      const result = await exec(`schtasks /Query /TN "${TASK_NAME}"`);
      return result.exitCode === 0;
    } catch {
      return false;
    }
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
