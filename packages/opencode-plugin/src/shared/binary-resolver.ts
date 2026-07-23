import { logError } from "./logger.js";
import { executeCommand } from "./subprocess.js";

export interface ResolvedBinary {
  key: string;
  path: string;
  source: "config" | "path";
}

export interface UnresolvedBinary {
  key: string;
  found: false;
}

async function isExecutable(filePath: string): Promise<boolean> {
  try {
    const stat = await Bun.file(filePath).stat();
    if (!stat.isFile) return false;

    const mode = stat.mode;
    if (mode === undefined) {
      return true;
    }

    const ownerExec = (mode & 0o100) !== 0;
    const groupExec = (mode & 0o010) !== 0;
    const otherExec = (mode & 0o001) !== 0;

    return ownerExec || groupExec || otherExec;
  } catch {
    return false;
  }
}

async function resolveOnPath(binaryName: string): Promise<string | undefined> {
  const pathEnv = process.env.PATH ?? "";
  if (!pathEnv) return undefined;

  const extensions = process.platform === "win32" ? [".exe", ".cmd", ".bat", ""] : [""];
  const directories = pathEnv.split(process.platform === "win32" ? ";" : ":");

  for (const dir of directories) {
    if (!dir) continue;

    for (const ext of extensions) {
      const candidate = `${dir}/${binaryName}${ext}`;
      if (await isExecutable(candidate)) {
        return candidate;
      }
    }
  }

  return undefined;
}

async function resolveViaWhich(binaryName: string): Promise<string | undefined> {
  const shellFlag = process.platform === "win32" ? "/c" : "-c";
  const command = process.platform === "win32" ? `where ${binaryName}` : `command -v ${binaryName}`;

  const result = await executeCommand([
    process.platform === "win32" ? "cmd" : "sh",
    shellFlag,
    command,
  ]);
  if (result.exitCode !== 0) return undefined;

  const trimmed = result.stdout.trim().split("\n")[0];
  if (!trimmed) return undefined;

  return trimmed;
}

/**
 * Resolves an external binary for a structural tool.
 *
 * Resolution order:
 * 1. If `configuredPath` is provided and points to an executable file, return it as `source:"config"`.
 * 2. Otherwise, look up the bare binary name on `PATH` and return the first executable match as `source:"path"`.
 * 3. If neither succeeds, return `{ key, found: false }`.
 *
 * The caller is responsible for supplying `configuredPath` (typically from `loadMergedConfig(projectDir).binaryPaths?.[key]`).
 * Keeping config loading outside this module makes it trivial to test and avoids hidden coupling to `features/setup`.
 */
export async function resolveBinary(
  key: string,
  opts: { projectDir: string; configuredPath?: string },
): Promise<ResolvedBinary | UnresolvedBinary> {
  if (opts.configuredPath) {
    if (await isExecutable(opts.configuredPath)) {
      return { key, path: opts.configuredPath, source: "config" };
    }

    logError(`Configured binary path for "${key}" is not executable`, opts.configuredPath);
  }

  const whichResult = await resolveViaWhich(key);
  if (whichResult) {
    return { key, path: whichResult, source: "path" };
  }

  const pathResult = await resolveOnPath(key);
  if (pathResult) {
    return { key, path: pathResult, source: "path" };
  }

  return { key, found: false };
}
