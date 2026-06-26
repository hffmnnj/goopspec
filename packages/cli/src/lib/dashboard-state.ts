import { existsSync } from "node:fs";
import { rm, stat } from "node:fs/promises";
import { join } from "node:path";

export interface DashboardState {
  running: boolean;
  pid?: number;
  port: number;
  uptimeMs?: number;
  startedAt?: Date;
}

const GOOPSPEC_DIR = ".goopspec";
const PID_FILENAME = "dashboard.pid";
const DEFAULT_PORT = 5173;

interface DashboardPidFile {
  pid: number;
  startedAt?: string;
}

function getDashboardPidPath(): string {
  return join(process.cwd(), GOOPSPEC_DIR, PID_FILENAME);
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function parsePidFile(text: string): DashboardPidFile | null {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return null;
  }

  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed) as Partial<DashboardPidFile>;
      if (typeof parsed.pid === "number" && Number.isInteger(parsed.pid) && parsed.pid > 0) {
        return { pid: parsed.pid, startedAt: parsed.startedAt };
      }
      return null;
    } catch {
      return null;
    }
  }

  const pid = Number.parseInt(trimmed, 10);
  if (Number.isNaN(pid) || pid <= 0) {
    return null;
  }
  return { pid };
}

async function readStartedAt(pidPath: string, startedAt?: string): Promise<Date | undefined> {
  if (startedAt) {
    const parsed = new Date(startedAt);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  try {
    const fileStat = await stat(pidPath);
    return fileStat.mtime;
  } catch {
    return undefined;
  }
}

export async function clearStalePid(pidPath: string): Promise<void> {
  if (!existsSync(pidPath)) {
    return;
  }

  try {
    const text = await Bun.file(pidPath).text();
    const parsed = parsePidFile(text);
    if (parsed && isProcessAlive(parsed.pid)) {
      return;
    }
  } catch {
    // If the PID file cannot be read, treat it as unusable state and remove it.
  }

  await rm(pidPath, { force: true });
}

export async function getDashboardState(): Promise<DashboardState> {
  const pidPath = getDashboardPidPath();
  if (!existsSync(pidPath)) {
    return { running: false, port: DEFAULT_PORT };
  }

  try {
    const text = await Bun.file(pidPath).text();
    const parsed = parsePidFile(text);
    if (!parsed) {
      await clearStalePid(pidPath);
      return { running: false, port: DEFAULT_PORT };
    }

    if (!isProcessAlive(parsed.pid)) {
      await clearStalePid(pidPath);
      return { running: false, port: DEFAULT_PORT };
    }

    const startedAt = await readStartedAt(pidPath, parsed.startedAt);
    const uptimeMs = startedAt ? Math.max(0, Date.now() - startedAt.getTime()) : undefined;
    return { running: true, pid: parsed.pid, port: DEFAULT_PORT, uptimeMs, startedAt };
  } catch {
    return { running: false, port: DEFAULT_PORT };
  }
}
