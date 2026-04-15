import { copyFile, mkdir, rm, stat, symlink } from "node:fs/promises";
import * as path from "node:path";
import { z } from "zod";
import { log, logError } from "../../shared/logger.js";

const worktreeConfigSchema = z.object({
  sync: z
    .object({
      copyFiles: z.array(z.string()).default([]),
      symlinkDirs: z.array(z.string()).default([]),
      exclude: z.array(z.string()).default([]),
    })
    .default(() => ({ copyFiles: [], symlinkDirs: [], exclude: [] })),
  hooks: z
    .object({
      postCreate: z.array(z.string()).default([]),
      preDelete: z.array(z.string()).default([]),
    })
    .default(() => ({ postCreate: [], preDelete: [] })),
});

type WorktreeConfig = z.infer<typeof worktreeConfigSchema>;

function parseJsoncContent(content: string): unknown {
  const stripped = content
    .replace(/\/\/.*$/gm, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/,(\s*[}\]])/g, "$1");
  return JSON.parse(stripped);
}

function isPathSafe(filePath: string, baseDir: string): boolean {
  if (path.isAbsolute(filePath)) {
    log("Rejected absolute path in worktree sync", { filePath });
    return false;
  }

  if (filePath.includes("..")) {
    log("Rejected path traversal in worktree sync", { filePath });
    return false;
  }

  const resolved = path.resolve(baseDir, filePath);
  if (!resolved.startsWith(baseDir + path.sep) && resolved !== baseDir) {
    log("Rejected path escape in worktree sync", { filePath });
    return false;
  }

  return true;
}

async function copyFiles(sourceDir: string, targetDir: string, files: string[]): Promise<void> {
  for (const file of files) {
    if (!isPathSafe(file, sourceDir)) {
      continue;
    }

    const sourcePath = path.join(sourceDir, file);
    const targetPath = path.join(targetDir, file);

    try {
      const sourceStat = await stat(sourcePath);
      if (!sourceStat.isFile()) {
        continue;
      }

      await mkdir(path.dirname(targetPath), { recursive: true });
      await copyFile(sourcePath, targetPath);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("ENOENT") || message.includes("no such file")) {
        continue;
      }
      logError("Failed to copy worktree sync file", { file, message });
    }
  }
}

async function symlinkDirs(sourceDir: string, targetDir: string, dirs: string[]): Promise<void> {
  for (const dir of dirs) {
    if (!isPathSafe(dir, sourceDir)) {
      continue;
    }

    const sourcePath = path.join(sourceDir, dir);
    const targetPath = path.join(targetDir, dir);

    try {
      const sourceStat = await stat(sourcePath);
      if (!sourceStat.isDirectory()) {
        continue;
      }

      await mkdir(path.dirname(targetPath), { recursive: true });
      await rm(targetPath, { recursive: true, force: true });
      await symlink(sourcePath, targetPath, "dir");
    } catch (error) {
      logError("Failed to symlink worktree sync directory", { dir, error });
    }
  }
}

async function runHooks(cwd: string, commands: string[]): Promise<void> {
  for (const command of commands) {
    try {
      const result = Bun.spawnSync(["bash", "-c", command], {
        cwd,
        stdout: "inherit",
        stderr: "pipe",
      });

      if (result.exitCode !== 0) {
        logError("Worktree hook failed", {
          command,
          exitCode: result.exitCode,
          stderr: result.stderr.toString(),
        });
      }
    } catch (error) {
      logError("Worktree hook execution failed", { command, error });
    }
  }
}

async function loadWorktreeConfig(directory: string): Promise<WorktreeConfig> {
  const configPath = path.join(directory, ".opencode", "worktree.jsonc");

  try {
    const file = Bun.file(configPath);
    if (!(await file.exists())) {
      const defaultConfig = `{
  "sync": {
    "copyFiles": [],
    "symlinkDirs": [],
    "exclude": []
  },
  "hooks": {
    "postCreate": [],
    "preDelete": []
  }
}\n`;

      await mkdir(path.join(directory, ".opencode"), { recursive: true });
      await Bun.write(configPath, defaultConfig);
      return worktreeConfigSchema.parse({});
    }

    const content = await file.text();
    const parsed = parseJsoncContent(content);
    return worktreeConfigSchema.parse(parsed);
  } catch (error) {
    logError("Failed to load worktree config, using defaults", error);
    return worktreeConfigSchema.parse({});
  }
}

export type { WorktreeConfig };
export {
  copyFiles,
  isPathSafe,
  loadWorktreeConfig,
  runHooks,
  symlinkDirs,
  worktreeConfigSchema,
};
