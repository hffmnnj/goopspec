import { existsSync } from "node:fs";
import { join } from "node:path";

export interface DashboardState {
  running: boolean;
  pid?: number;
  port: number;
  uptimeMs?: number;
}

const GOOPSPEC_DIR = ".goopspec";
const PID_FILENAME = "dashboard.pid";
const DEFAULT_PORT = 5173;

export async function getDashboardState(): Promise<DashboardState> {
  const pidPath = join(process.cwd(), GOOPSPEC_DIR, PID_FILENAME);
  if (!existsSync(pidPath)) {
    return { running: false, port: DEFAULT_PORT };
  }

  try {
    const text = await Bun.file(pidPath).text();
    const pid = Number.parseInt(text.trim(), 10);
    if (Number.isNaN(pid) || pid <= 0) {
      return { running: false, port: DEFAULT_PORT };
    }

    try {
      process.kill(pid, 0);
      return { running: true, pid, port: DEFAULT_PORT };
    } catch {
      return { running: false, port: DEFAULT_PORT };
    }
  } catch {
    return { running: false, port: DEFAULT_PORT };
  }
}
