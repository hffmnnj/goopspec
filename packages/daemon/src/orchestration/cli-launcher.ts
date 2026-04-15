import { generateId } from "@goopspec/core";
import type { LaunchOptions, LaunchResult, WorkflowLauncher } from "./launcher.js";

export class CliLauncher implements WorkflowLauncher {
  readonly name = "cli";

  async isAvailable(): Promise<boolean> {
    try {
      const result = Bun.spawnSync(["opencode", "--version"], { cwd: process.cwd() });
      return result.exitCode === 0;
    } catch {
      return false;
    }
  }

  async launch(options: LaunchOptions): Promise<LaunchResult> {
    const sessionId = generateId();

    try {
      const args = ["opencode"];

      if (options.model) {
        args.push("--model", options.model);
      }

      if (options.prompt) {
        args.push("-p", options.prompt);
      }

      const proc = Bun.spawn(args, {
        cwd: options.projectPath,
        env: {
          ...process.env,
          GOOPSPEC_WORKFLOW_ID: options.workflowId ?? "default",
          GOOPSPEC_WORK_ITEM_ID: options.workItemId ?? "",
        },
        stdout: "pipe",
        stderr: "pipe",
      });

      return {
        sessionId,
        pid: proc.pid,
        status: "started",
      };
    } catch (error) {
      return {
        sessionId,
        status: "failed",
        error: error instanceof Error ? error.message : "CLI launch failed",
      };
    }
  }
}
