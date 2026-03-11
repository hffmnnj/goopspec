import type { DaemonConfig } from "@goopspec/core";

const DEFAULT_PORT = 7331;
const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_DB_PATH = ".goopspec-daemon.db";
const DEFAULT_LOG_LEVEL: DaemonConfig["logLevel"] = "info";

function parsePort(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? String(DEFAULT_PORT), 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    return DEFAULT_PORT;
  }
  return parsed;
}

function parseLogLevel(value: string | undefined): DaemonConfig["logLevel"] {
  if (value === "debug" || value === "info" || value === "warn" || value === "error") {
    return value;
  }
  return DEFAULT_LOG_LEVEL;
}

export function getConfig(): DaemonConfig {
  return {
    port: parsePort(process.env.GOOPSPEC_DAEMON_PORT),
    host: process.env.GOOPSPEC_DAEMON_HOST ?? DEFAULT_HOST,
    dbPath: process.env.GOOPSPEC_DAEMON_DB ?? DEFAULT_DB_PATH,
    logLevel: parseLogLevel(process.env.GOOPSPEC_DAEMON_LOG_LEVEL),
  };
}

export const DEFAULT_CONFIG = getConfig();
