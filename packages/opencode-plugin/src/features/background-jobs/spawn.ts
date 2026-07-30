import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { logError } from "../../shared/logger.js";
import {
  type BackgroundJobRegistry,
  transitionJobToExited,
} from "./registry.js";
import type { JobRecord } from "./types.js";

/**
 * Bun supports detached processes at runtime, but its published SpawnOptions
 * type does not yet declare it. Delete this local extension when it does.
 */
type DetachedSpawnOptions = Parameters<typeof Bun.spawn>[1] & {
  detached: true;
};

export interface SpawnBackgroundJobOptions {
  id: string;
  command: string;
  cwd: string;
  projectDir: string;
  deadline: number;
}

export function spawnBackgroundJob(
  registry: BackgroundJobRegistry,
  options: SpawnBackgroundJobOptions,
): JobRecord {
  const logDir = join(options.projectDir, ".goopspec", "background-jobs", options.id);
  mkdirSync(logDir, { recursive: true });

  const spawnOptions: DetachedSpawnOptions = {
    cwd: options.cwd,
    detached: true,
    stdin: "ignore",
    stdout: Bun.file(join(logDir, "stdout.log")),
    stderr: Bun.file(join(logDir, "stderr.log")),
  };
  // sh -c intentionally preserves shell composition and the command's exit code.
  const proc = Bun.spawn(["sh", "-c", options.command], spawnOptions);
  const job: JobRecord = {
    id: options.id,
    pid: proc.pid,
    pgid: proc.pid,
    command: options.command,
    cwd: options.cwd,
    logDir,
    state: "running",
    exitCode: null,
    startedAt: Date.now(),
    deadline: options.deadline,
    proc,
  };

  registry.register(job);
  void proc.exited
    .then((exitCode) => {
      try {
        const currentJob = registry.get(job.id);
        if (currentJob) {
          const exitedJob = transitionJobToExited(currentJob, exitCode);
          registry.update(job.id, {
            state: exitedJob.state,
            exitCode: exitedJob.exitCode,
          });
        }
      } catch (error) {
        logError("Failed to update exited background job state", error);
      }

      try {
        writeFileSync(join(logDir, "exit.code"), String(exitCode));
      } catch (error) {
        logError("Failed to write background job exit code", error);
      }
    })
    .catch((error) => {
      logError("Failed to process background job exit", error);
    });

  return job;
}
