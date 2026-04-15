import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

import {
  DEFAULT_CONFIG,
  GoopspecConfigSchema,
  type GoopspecConfig,
} from "@goopspec/core";

const GOOPSPEC_DIR = ".goopspec";
const CONFIG_FILE = "config.json";

const FileConfigSchema = GoopspecConfigSchema.partial();

let cachedConfigPromise: Promise<GoopspecConfig> | null = null;

function getConfigPath(): string {
  return join(homedir(), GOOPSPEC_DIR, CONFIG_FILE);
}

function parseEnvPort(value: string | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    return undefined;
  }

  return parsed;
}

function applyEnvOverrides(config: GoopspecConfig): GoopspecConfig {
  const daemonUrl = process.env.GOOPSPEC_DAEMON_URL;
  const port = parseEnvPort(process.env.GOOPSPEC_DAEMON_PORT);
  const host = process.env.GOOPSPEC_DAEMON_HOST;

  const merged = {
    ...config,
    ...(daemonUrl ? { daemonUrl } : {}),
    ...(port !== undefined ? { port } : {}),
    ...(host ? { host } : {}),
  };

  const parsed = GoopspecConfigSchema.safeParse(merged);
  return parsed.success ? parsed.data : config;
}

export async function readConfig(): Promise<GoopspecConfig> {
  const configPath = getConfigPath();

  let fileConfig: Partial<GoopspecConfig> = {};
  try {
    const contents = await readFile(configPath, "utf8");
    const raw = JSON.parse(contents) as unknown;
    const parsed = FileConfigSchema.safeParse(raw);
    if (parsed.success) {
      fileConfig = parsed.data;
    }
  } catch {
    fileConfig = {};
  }

  const merged = {
    ...DEFAULT_CONFIG,
    ...fileConfig,
  };

  return applyEnvOverrides(GoopspecConfigSchema.parse(merged));
}

export async function writeConfig(config: GoopspecConfig): Promise<void> {
  const merged = GoopspecConfigSchema.parse({
    ...DEFAULT_CONFIG,
    ...config,
  });

  const configDir = join(homedir(), GOOPSPEC_DIR);
  await mkdir(configDir, { recursive: true });
  await writeFile(getConfigPath(), `${JSON.stringify(merged, null, 2)}\n`, "utf8");

  cachedConfigPromise = Promise.resolve(applyEnvOverrides(merged));
}

export async function getConfig(): Promise<GoopspecConfig> {
  if (!cachedConfigPromise) {
    cachedConfigPromise = readConfig();
  }

  return cachedConfigPromise;
}
