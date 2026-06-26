import { existsSync } from "node:fs";
import { join } from "node:path";
import type { GoopConfig } from "./types.js";

export type { GoopConfig };

const GOOPSPEC_DIR = ".goopspec";
const CONFIG_FILENAME = "config.json";

export function getConfigPath(): string {
  return join(process.cwd(), GOOPSPEC_DIR, CONFIG_FILENAME);
}

export async function readConfig(): Promise<GoopConfig | null> {
  const path = getConfigPath();
  if (!existsSync(path)) return null;

  try {
    const contents = await Bun.file(path).text();
    const parsed = JSON.parse(contents) as GoopConfig;
    return parsed;
  } catch {
    return null;
  }
}
