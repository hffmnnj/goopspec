import { mkdir } from "node:fs/promises";
import * as path from "node:path";
import { log, logError } from "../../shared/logger.js";

interface OkResult<T> {
  readonly ok: true;
  readonly value: T;
}

interface ErrResult<E> {
  readonly ok: false;
  readonly error: E;
}

type Result<T, E> = OkResult<T> | ErrResult<E>;

const Result = {
  ok: <T>(value: T): OkResult<T> => ({ ok: true, value }),
  err: <E>(error: E): ErrResult<E> => ({ ok: false, error }),
};

async function git(args: string[], cwd: string): Promise<Result<string, string>> {
  try {
    log("Running git command", { args: args.join(" "), cwd });
    const proc = Bun.spawn(["git", ...args], {
      cwd,
      stdout: "pipe",
      stderr: "pipe",
    });

    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);

    if (exitCode !== 0) {
      const error = stderr.trim() || `git ${args[0]} failed`;
      logError("Git command failed", { args: args.join(" "), cwd, error });
      return Result.err(error);
    }

    return Result.ok(stdout.trim());
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logError("Failed to execute git command", { args: args.join(" "), cwd, error: message });
    return Result.err(message);
  }
}

function getWorktreePath(repoRoot: string, branch: string): string {
  const sanitized = branch.replace(/\//g, "-");
  return path.join(path.dirname(repoRoot), sanitized);
}

async function branchExists(cwd: string, branch: string): Promise<boolean> {
  const result = await git(["rev-parse", "--verify", branch], cwd);
  return result.ok;
}

async function createWorktree(
  repoRoot: string,
  branch: string,
  baseBranch?: string,
): Promise<Result<string, string>> {
  const worktreePath = getWorktreePath(repoRoot, branch);

  await mkdir(path.dirname(worktreePath), { recursive: true });

  const exists = await branchExists(repoRoot, branch);
  if (exists) {
    const result = await git(["worktree", "add", worktreePath, branch], repoRoot);
    return result.ok ? Result.ok(worktreePath) : result;
  }

  const base = baseBranch ?? "HEAD";
  const result = await git(["worktree", "add", "-b", branch, worktreePath, base], repoRoot);
  return result.ok ? Result.ok(worktreePath) : result;
}

async function removeWorktree(
  repoRoot: string,
  worktreePath: string,
): Promise<Result<void, string>> {
  const result = await git(["worktree", "remove", "--force", worktreePath], repoRoot);
  return result.ok ? Result.ok(undefined) : Result.err(result.error);
}

export type { Result };
export { git, branchExists, createWorktree, removeWorktree };
