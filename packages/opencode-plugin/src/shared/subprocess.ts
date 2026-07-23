import { logError } from "./logger.js";

export interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * Runs an argument-array command; spawn failures return exitCode -1 and the error in stderr.
 */
export async function executeCommand(args: string[], cwd?: string): Promise<CommandResult> {
  try {
    const proc = Bun.spawn(args, {
      cwd,
      stdout: "pipe",
      stderr: "pipe",
    });

    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);

    return { stdout, stderr, exitCode };
  } catch (error) {
    logError("Failed to spawn command", error);

    return {
      stdout: "",
      stderr: error instanceof Error ? error.message : String(error),
      exitCode: -1,
    };
  }
}
