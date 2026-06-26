import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { DashboardState } from "./dashboard-state.js";
import { getDashboardState } from "./dashboard-state.js";

export interface StartResult {
  success: boolean;
  pid?: number;
  port: number;
  alreadyRunning: boolean;
  error?: string;
}

export interface StopResult {
  success: boolean;
  wasRunning: boolean;
  error?: string;
}

const DASHBOARD_PORT = 5173;
const DASHBOARD_URL = `http://localhost:${DASHBOARD_PORT}`;

function getPidPath(): string {
  return join(process.cwd(), ".goopspec", "dashboard.pid");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isErrnoException(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}

async function waitForDashboard(url: string): Promise<void> {
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    try {
      await fetch(url, { signal: AbortSignal.timeout(500) });
      return;
    } catch {
      await Bun.sleep(150);
    }
  }
}

async function writePidFile(pid: number): Promise<void> {
  const pidPath = getPidPath();
  await mkdir(dirname(pidPath), { recursive: true });
  await writeFile(
    pidPath,
    `${JSON.stringify({ pid, startedAt: new Date().toISOString() })}\n`,
    "utf8",
  );
}

export async function startDashboard(): Promise<StartResult> {
  const state: DashboardState = await getDashboardState();
  if (state.running && state.pid) {
    return { success: true, pid: state.pid, port: state.port, alreadyRunning: true };
  }

  try {
    const webfrontPath = join(process.cwd(), "packages", "webfront");
    const proc = Bun.spawn(["bun", "--cwd", webfrontPath, "dev"], {
      detached: true,
      stdout: "ignore",
      stderr: "ignore",
    });
    proc.unref();

    await writePidFile(proc.pid);
    await waitForDashboard(DASHBOARD_URL);

    return { success: true, pid: proc.pid, port: DASHBOARD_PORT, alreadyRunning: false };
  } catch (error) {
    return {
      success: false,
      port: DASHBOARD_PORT,
      alreadyRunning: false,
      error: errorMessage(error),
    };
  }
}

export async function stopDashboard(): Promise<StopResult> {
  const state = await getDashboardState();
  const pidPath = getPidPath();

  if (!state.pid) {
    await rm(pidPath, { force: true });
    return { success: true, wasRunning: false };
  }

  try {
    process.kill(state.pid, "SIGTERM");
  } catch (error) {
    if (!isErrnoException(error, "ESRCH")) {
      return { success: false, wasRunning: state.running, error: errorMessage(error) };
    }
  }

  await rm(pidPath, { force: true });
  return { success: true, wasRunning: true };
}

export async function openDashboard(port = DASHBOARD_PORT): Promise<void> {
  const url = `http://localhost:${port}`;
  if (process.platform === "linux") {
    Bun.spawn(["xdg-open", url], { stdout: "ignore", stderr: "ignore" }).unref();
    return;
  }

  if (process.platform === "darwin") {
    Bun.spawn(["open", url], { stdout: "ignore", stderr: "ignore" }).unref();
    return;
  }

  throw new Error(`Opening the dashboard is not supported on ${process.platform}`);
}
