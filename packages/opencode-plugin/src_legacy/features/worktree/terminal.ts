import * as fs from "node:fs/promises";
import * as fsSync from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { z } from "zod";
import { log, logError } from "../../shared/logger.js";

const SHELL_FORBIDDEN_CHARS = /[\x00]/;

export function assertShellSafe(value: string, context: string): void {
  if (SHELL_FORBIDDEN_CHARS.test(value)) {
    throw new Error(
      `${context} contains null bytes which cannot be safely escaped for shell execution`,
    );
  }
}

export function escapeBash(str: string): string {
  assertShellSafe(str, "Bash argument");
  return str
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\$/g, "\\$")
    .replace(/`/g, "\\`")
    .replace(/!/g, "\\!")
    .replace(/\n/g, " ")
    .replace(/\r/g, " ");
}

export function escapeAppleScript(str: string): string {
  assertShellSafe(str, "AppleScript argument");
  return str.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, " ").replace(/\r/g, " ");
}

export function escapeBatch(str: string): string {
  assertShellSafe(str, "Batch argument");
  return str
    .replace(/%/g, "%%")
    .replace(/\^/g, "^^")
    .replace(/&/g, "^&")
    .replace(/</g, "^<")
    .replace(/>/g, "^>")
    .replace(/\|/g, "^|");
}

export class Mutex {
  private locked = false;
  private queue: Array<() => void> = [];

  async acquire(): Promise<void> {
    if (!this.locked) {
      this.locked = true;
      return;
    }

    return new Promise<void>((resolve) => {
      this.queue.push(resolve);
    });
  }

  release(): void {
    const next = this.queue.shift();
    if (next) {
      next();
      return;
    }

    this.locked = false;
  }

  async runExclusive<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }
}

export function getTempDir(): string {
  return fsSync.realpathSync.native(os.tmpdir());
}

export function isInsideTmux(): boolean {
  return Boolean(process.env.TMUX);
}

export function wrapWithSelfCleanup(script: string): string {
  return `#!/bin/bash
trap 'rm -f "$0"' EXIT INT TERM
${script}`;
}

export function wrapBatchWithSelfCleanup(script: string): string {
  return `@echo off
${script}
(goto) 2>nul & del "%~f0"`;
}

export type TerminalType = "tmux" | "macos" | "windows" | "linux-desktop";

export interface TerminalResult {
  success: boolean;
  error?: string;
}

const tmuxMutex = new Mutex();
const STABILIZATION_DELAY_MS = 150;

const wslEnvSchema = z.object({
  WSL_DISTRO_NAME: z.string().optional(),
  WSLENV: z.string().optional(),
});

const linuxTerminalEnvSchema = z.object({
  KITTY_WINDOW_ID: z.string().optional(),
  WEZTERM_PANE: z.string().optional(),
  ALACRITTY_WINDOW_ID: z.string().optional(),
  GHOSTTY_RESOURCES_DIR: z.string().optional(),
  TERM_PROGRAM: z.string().optional(),
  GNOME_TERMINAL_SERVICE: z.string().optional(),
  KONSOLE_VERSION: z.string().optional(),
});

const macTerminalEnvSchema = z.object({
  TERM_PROGRAM: z.string().optional(),
  GHOSTTY_RESOURCES_DIR: z.string().optional(),
  ITERM_SESSION_ID: z.string().optional(),
  KITTY_WINDOW_ID: z.string().optional(),
  ALACRITTY_WINDOW_ID: z.string().optional(),
  __CFBundleIdentifier: z.string().optional(),
});

type LinuxTerminal =
  | "kitty"
  | "wezterm"
  | "alacritty"
  | "ghostty"
  | "foot"
  | "gnome-terminal"
  | "konsole"
  | "xfce4-terminal"
  | "xdg-terminal-exec"
  | "x-terminal-emulator"
  | "xterm";

type MacTerminal = "ghostty" | "iterm" | "warp" | "kitty" | "alacritty" | "terminal";

function isInsideWSL(): boolean {
  const parsed = wslEnvSchema.safeParse(process.env);
  if (parsed.success && (parsed.data.WSL_DISTRO_NAME || parsed.data.WSLENV)) {
    return true;
  }

  try {
    return os.release().toLowerCase().includes("microsoft");
  } catch {
    return false;
  }
}

export function detectTerminalType(): TerminalType {
  const override = process.env.GOOPSPEC_TERM;
  if (
    override === "tmux" ||
    override === "macos" ||
    override === "windows" ||
    override === "linux-desktop"
  ) {
    return override;
  }

  if (isInsideTmux()) {
    return "tmux";
  }

  if (process.platform === "linux" && isInsideWSL()) {
    return "windows";
  }

  switch (process.platform) {
    case "darwin":
      return "macos";
    case "win32":
      return "windows";
    case "linux":
      return "linux-desktop";
    default:
      return "linux-desktop";
  }
}

export async function withTempScript<T>(
  scriptContent: string,
  fn: (scriptPath: string) => Promise<T>,
  extension = ".sh",
): Promise<T> {
  const scriptPath = path.join(
    getTempDir(),
    `worktree-${Date.now()}-${Math.random().toString(36).slice(2)}${extension}`,
  );

  await Bun.write(scriptPath, scriptContent);
  await fs.chmod(scriptPath, 0o755);

  try {
    return await fn(scriptPath);
  } finally {
    try {
      await fs.rm(scriptPath, { force: true });
    } catch (cleanupError) {
      logError("Failed to cleanup temp script", { scriptPath, cleanupError });
    }
  }
}

export async function openTmuxWindow(options: {
  sessionName?: string;
  windowName: string;
  cwd: string;
  command?: string;
}): Promise<TerminalResult> {
  const { sessionName, windowName, cwd, command } = options;

  return tmuxMutex.runExclusive(async () => {
    try {
      const tmuxArgs = ["new-window", "-n", windowName, "-c", cwd, "-P", "-F", "#{pane_id}"];
      if (sessionName) {
        tmuxArgs.splice(1, 0, "-t", sessionName);
      }

      if (command) {
        const scriptPath = path.join(getTempDir(), `worktree-${Bun.randomUUIDv7()}.sh`);
        const escapedCwd = escapeBash(cwd);
        const escapedCommand = escapeBash(command);
        const scriptContent = wrapWithSelfCleanup(`cd "${escapedCwd}" || exit 1
${escapedCommand}
exec $SHELL`);
        await Bun.write(scriptPath, scriptContent);
        await fs.chmod(scriptPath, 0o755);
        tmuxArgs.push("--", "bash", scriptPath);
      }

      const createResult = Bun.spawnSync(["tmux", ...tmuxArgs]);
      if (createResult.exitCode !== 0) {
        return {
          success: false,
          error: `Failed to create tmux window: ${createResult.stderr.toString()}`,
        };
      }

      await Bun.sleep(STABILIZATION_DELAY_MS);
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
}

function detectCurrentMacTerminal(): MacTerminal {
  const env = macTerminalEnvSchema.parse(process.env);
  if (env.GHOSTTY_RESOURCES_DIR) return "ghostty";
  if (env.ITERM_SESSION_ID) return "iterm";
  if (env.KITTY_WINDOW_ID) return "kitty";
  if (env.ALACRITTY_WINDOW_ID) return "alacritty";
  if (env.__CFBundleIdentifier === "dev.warp.Warp-Stable") return "warp";

  const termProgram = env.TERM_PROGRAM?.toLowerCase();
  switch (termProgram) {
    case "ghostty":
      return "ghostty";
    case "iterm.app":
      return "iterm";
    case "warpterm":
      return "warp";
    case "apple_terminal":
      return "terminal";
    default:
      return "terminal";
  }
}

export async function openMacOSTerminal(cwd: string, command?: string): Promise<TerminalResult> {
  if (!cwd) {
    return { success: false, error: "Working directory is required" };
  }

  const escapedCwd = escapeBash(cwd);
  const escapedCommand = command ? escapeBash(command) : "";
  const scriptContent = wrapWithSelfCleanup(
    command ? `cd "${escapedCwd}" && ${escapedCommand}\nexec bash` : `cd "${escapedCwd}"\nexec bash`,
  );

  const terminal = detectCurrentMacTerminal();
  let detachedScriptPath: string | null = null;

  try {
    switch (terminal) {
      case "ghostty": {
        const proc = Bun.spawn(
          [
            "open",
            "-na",
            "Ghostty.app",
            "--args",
            `--working-directory=${cwd}`,
            "-e",
            "bash",
            "-c",
            command ? `cd "${escapedCwd}" && ${escapedCommand}` : `cd "${escapedCwd}"`,
          ],
          { detached: true, stdio: ["ignore", "ignore", "ignore"] },
        );
        proc.unref();
        return { success: true };
      }
      case "kitty": {
        const remoteResult = await withTempScript(scriptContent, async (scriptPath) => {
          const result = Bun.spawnSync([
            "kitty",
            "@",
            "launch",
            "--type",
            "tab",
            "--cwd",
            cwd,
            "--",
            "bash",
            scriptPath,
          ]);
          return result.exitCode === 0;
        });

        if (remoteResult) {
          return { success: true };
        }

        detachedScriptPath = path.join(
          getTempDir(),
          `worktree-${Date.now()}-${Math.random().toString(36).slice(2)}.sh`,
        );
        await Bun.write(detachedScriptPath, scriptContent);
        await fs.chmod(detachedScriptPath, 0o755);
        const kittyProc = Bun.spawn(["kitty", "--directory", cwd, "-e", "bash", detachedScriptPath], {
          detached: true,
          stdio: ["ignore", "ignore", "ignore"],
        });
        kittyProc.unref();
        detachedScriptPath = null;
        return { success: true };
      }
      case "alacritty": {
        detachedScriptPath = path.join(
          getTempDir(),
          `worktree-${Date.now()}-${Math.random().toString(36).slice(2)}.sh`,
        );
        await Bun.write(detachedScriptPath, scriptContent);
        await fs.chmod(detachedScriptPath, 0o755);
        const proc = Bun.spawn(["alacritty", "--working-directory", cwd, "-e", "bash", detachedScriptPath], {
          detached: true,
          stdio: ["ignore", "ignore", "ignore"],
        });
        proc.unref();
        detachedScriptPath = null;
        return { success: true };
      }
      case "warp": {
        detachedScriptPath = path.join(
          getTempDir(),
          `worktree-${Date.now()}-${Math.random().toString(36).slice(2)}.sh`,
        );
        await Bun.write(detachedScriptPath, scriptContent);
        await fs.chmod(detachedScriptPath, 0o755);
        const proc = Bun.spawn(["open", "-b", "dev.warp.Warp-Stable", detachedScriptPath], {
          detached: true,
          stdio: ["ignore", "ignore", "ignore"],
        });
        proc.unref();
        detachedScriptPath = null;
        return { success: true };
      }
      case "iterm": {
        detachedScriptPath = path.join(
          getTempDir(),
          `worktree-${Date.now()}-${Math.random().toString(36).slice(2)}.sh`,
        );
        await Bun.write(detachedScriptPath, scriptContent);
        await fs.chmod(detachedScriptPath, 0o755);
        const escapedPath = escapeAppleScript(detachedScriptPath);
        const appleScript = `
          tell application "iTerm"
            if not (exists window 1) then
              reopen
            else
              tell current window
                create tab with default profile
              end tell
            end if
            activate
            tell first session of current tab of current window
              write text "${escapedPath}"
            end tell
          end tell
        `;
        const result = Bun.spawnSync(["osascript", "-e", appleScript]);
        if (result.exitCode !== 0) {
          return { success: false, error: `iTerm AppleScript failed: ${result.stderr.toString()}` };
        }
        detachedScriptPath = null;
        return { success: true };
      }
      default:
        return withTempScript(scriptContent, async (scriptPath) => {
          const proc = Bun.spawn(["open", "-a", "Terminal", scriptPath], {
            stdio: ["ignore", "ignore", "pipe"],
          });
          const exitCode = await proc.exited;
          if (exitCode !== 0) {
            const stderr = await new Response(proc.stderr).text();
            return { success: false, error: `Failed to open Terminal: ${stderr}` };
          }
          return { success: true };
        });
    }
  } catch (error) {
    if (detachedScriptPath) {
      await fs.rm(detachedScriptPath, { force: true }).catch(() => undefined);
    }

    return {
      success: false,
      error: `Failed to open terminal: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

function detectCurrentLinuxTerminal(): LinuxTerminal | null {
  const env = linuxTerminalEnvSchema.parse(process.env);
  if (env.KITTY_WINDOW_ID) return "kitty";
  if (env.WEZTERM_PANE) return "wezterm";
  if (env.ALACRITTY_WINDOW_ID) return "alacritty";
  if (env.GHOSTTY_RESOURCES_DIR) return "ghostty";
  if (env.GNOME_TERMINAL_SERVICE) return "gnome-terminal";
  if (env.KONSOLE_VERSION) return "konsole";

  const termProgram = env.TERM_PROGRAM?.toLowerCase();
  if (termProgram === "foot") return "foot";
  return null;
}

export async function openLinuxTerminal(cwd: string, command?: string): Promise<TerminalResult> {
  if (!cwd) {
    return { success: false, error: "Working directory is required" };
  }

  const escapedCwd = escapeBash(cwd);
  const escapedCommand = command ? escapeBash(command) : "";
  const scriptContent = wrapWithSelfCleanup(
    command ? `cd "${escapedCwd}" && ${escapedCommand}\nexec bash` : `cd "${escapedCwd}"\nexec bash`,
  );

  const scriptPath = path.join(
    getTempDir(),
    `worktree-${Date.now()}-${Math.random().toString(36).slice(2)}.sh`,
  );
  await Bun.write(scriptPath, scriptContent);
  await fs.chmod(scriptPath, 0o755);

  try {
    const tryTerminal = async (
      name: string,
      args: string[],
    ): Promise<{ tried: boolean; success: boolean }> => {
      const check = Bun.spawnSync(["which", name]);
      if (check.exitCode !== 0) {
        return { tried: false, success: false };
      }

      try {
        const proc = Bun.spawn(args, {
          detached: true,
          stdio: ["ignore", "ignore", "ignore"],
        });
        proc.unref();
        return { tried: true, success: true };
      } catch {
        return { tried: true, success: false };
      }
    };

    const currentTerminal = detectCurrentLinuxTerminal();
    if (currentTerminal) {
      let result: { tried: boolean; success: boolean } = { tried: false, success: false };

      switch (currentTerminal) {
        case "kitty": {
          const kittyRemote = Bun.spawnSync([
            "kitty",
            "@",
            "launch",
            "--type",
            "tab",
            "--cwd",
            cwd,
            "--",
            "bash",
            scriptPath,
          ]);
          if (kittyRemote.exitCode === 0) {
            return { success: true };
          }
          result = await tryTerminal("kitty", ["kitty", "--directory", cwd, "-e", "bash", scriptPath]);
          break;
        }
        case "wezterm":
          result = await tryTerminal("wezterm", [
            "wezterm",
            "cli",
            "spawn",
            "--cwd",
            cwd,
            "--",
            "bash",
            scriptPath,
          ]);
          break;
        case "alacritty":
          result = await tryTerminal("alacritty", [
            "alacritty",
            "--working-directory",
            cwd,
            "-e",
            "bash",
            scriptPath,
          ]);
          break;
        case "ghostty":
          result = await tryTerminal("ghostty", ["ghostty", "-e", "bash", scriptPath]);
          break;
        case "foot":
          result = await tryTerminal("foot", ["foot", "--working-directory", cwd, "bash", scriptPath]);
          break;
        case "gnome-terminal":
          result = await tryTerminal("gnome-terminal", [
            "gnome-terminal",
            "--working-directory",
            cwd,
            "--",
            "bash",
            scriptPath,
          ]);
          break;
        case "konsole":
          result = await tryTerminal("konsole", ["konsole", "--workdir", cwd, "-e", "bash", scriptPath]);
          break;
      }

      if (result.success) {
        return { success: true };
      }
    }

    const xdgResult = await tryTerminal("xdg-terminal-exec", ["xdg-terminal-exec", "--", "bash", scriptPath]);
    if (xdgResult.success) return { success: true };

    const xteResult = await tryTerminal("x-terminal-emulator", [
      "x-terminal-emulator",
      "-e",
      "bash",
      scriptPath,
    ]);
    if (xteResult.success) return { success: true };

    const modernTerminals: Array<{ name: LinuxTerminal; args: string[] }> = [
      { name: "kitty", args: ["kitty", "--directory", cwd, "-e", "bash", scriptPath] },
      {
        name: "alacritty",
        args: ["alacritty", "--working-directory", cwd, "-e", "bash", scriptPath],
      },
      {
        name: "wezterm",
        args: ["wezterm", "cli", "spawn", "--cwd", cwd, "--", "bash", scriptPath],
      },
      { name: "ghostty", args: ["ghostty", "-e", "bash", scriptPath] },
      { name: "foot", args: ["foot", "--working-directory", cwd, "bash", scriptPath] },
    ];

    for (const terminal of modernTerminals) {
      const result = await tryTerminal(terminal.name, terminal.args);
      if (result.success) return { success: true };
    }

    const deTerminals: Array<{ name: LinuxTerminal; args: string[] }> = [
      {
        name: "gnome-terminal",
        args: ["gnome-terminal", "--working-directory", cwd, "--", "bash", scriptPath],
      },
      { name: "konsole", args: ["konsole", "--workdir", cwd, "-e", "bash", scriptPath] },
      {
        name: "xfce4-terminal",
        args: ["xfce4-terminal", "--working-directory", cwd, "-x", "bash", scriptPath],
      },
    ];

    for (const terminal of deTerminals) {
      const result = await tryTerminal(terminal.name, terminal.args);
      if (result.success) return { success: true };
    }

    const xtermResult = await tryTerminal("xterm", ["xterm", "-e", "bash", scriptPath]);
    if (xtermResult.success) return { success: true };

    await fs.rm(scriptPath, { force: true }).catch(() => undefined);
    return { success: false, error: "No terminal emulator found" };
  } catch (error) {
    logError("Failed to spawn Linux terminal", error);
    return {
      success: false,
      error: `Failed to spawn terminal: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

export async function openWindowsTerminal(cwd: string, command?: string): Promise<TerminalResult> {
  if (!cwd) {
    return { success: false, error: "Working directory is required" };
  }

  const escapedCwd = escapeBatch(cwd);
  const escapedCommand = command ? escapeBatch(command) : "";
  const scriptContent = wrapBatchWithSelfCleanup(
    command ? `cd /d "${escapedCwd}"\r\n${escapedCommand}\r\ncmd /k` : `cd /d "${escapedCwd}"\r\ncmd /k`,
  );

  const scriptPath = path.join(
    getTempDir(),
    `worktree-${Date.now()}-${Math.random().toString(36).slice(2)}.bat`,
  );
  await Bun.write(scriptPath, scriptContent);
  await fs.chmod(scriptPath, 0o755);

  try {
    const wtCheck = Bun.spawnSync(["where", "wt"], {
      stdout: "pipe",
      stderr: "pipe",
    });

    if (wtCheck.exitCode === 0) {
      try {
        const proc = Bun.spawn(["wt.exe", "-d", cwd, "cmd", "/k", scriptPath], {
          detached: true,
          stdio: ["ignore", "ignore", "ignore"],
        });
        proc.unref();
        return { success: true };
      } catch {
        // fall through to cmd
      }
    }

    try {
      const proc = Bun.spawn(["cmd", "/c", "start", "", scriptPath], {
        detached: true,
        stdio: ["ignore", "ignore", "ignore"],
      });
      proc.unref();
      return { success: true };
    } catch (error) {
      await fs.rm(scriptPath, { force: true }).catch(() => undefined);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  } catch (error) {
    return {
      success: false,
      error: `Failed to spawn terminal: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

export async function openWSLTerminal(cwd: string, command?: string): Promise<TerminalResult> {
  if (!cwd) {
    return { success: false, error: "Working directory is required" };
  }

  const escapedCwd = escapeBash(cwd);
  const escapedCommand = command ? escapeBash(command) : "";
  const scriptContent = wrapWithSelfCleanup(
    command ? `cd "${escapedCwd}" && ${escapedCommand}\nexec bash` : `cd "${escapedCwd}"\nexec bash`,
  );

  const scriptPath = path.join(
    getTempDir(),
    `worktree-${Date.now()}-${Math.random().toString(36).slice(2)}.sh`,
  );
  await Bun.write(scriptPath, scriptContent);
  await fs.chmod(scriptPath, 0o755);

  try {
    const wtResult = Bun.spawnSync(["which", "wt.exe"]);
    if (wtResult.exitCode === 0) {
      try {
        const proc = Bun.spawn(["wt.exe", "-d", cwd, "bash", scriptPath], {
          detached: true,
          stdio: ["ignore", "ignore", "ignore"],
        });
        proc.unref();
        return { success: true };
      } catch {
        // fall through
      }
    }

    try {
      const proc = Bun.spawn(["bash", scriptPath], {
        cwd,
        detached: true,
        stdio: ["ignore", "ignore", "ignore"],
      });
      proc.unref();
      return { success: true };
    } catch (error) {
      await fs.rm(scriptPath, { force: true }).catch(() => undefined);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  } catch (error) {
    return {
      success: false,
      error: `Failed to spawn terminal: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

export async function openTerminal(
  cwd: string,
  command?: string,
  windowName?: string,
): Promise<TerminalResult> {
  const terminalType = detectTerminalType();
  log("Opening terminal", { terminalType, cwd, hasCommand: Boolean(command) });

  switch (terminalType) {
    case "tmux":
      return openTmuxWindow({
        windowName: windowName ?? "worktree",
        cwd,
        command,
      });
    case "macos":
      return openMacOSTerminal(cwd, command);
    case "windows":
      if (process.platform === "linux" && isInsideWSL()) {
        return openWSLTerminal(cwd, command);
      }
      return openWindowsTerminal(cwd, command);
    case "linux-desktop":
      return openLinuxTerminal(cwd, command);
    default:
      return { success: false, error: `Unsupported terminal type: ${terminalType}` };
  }
}
