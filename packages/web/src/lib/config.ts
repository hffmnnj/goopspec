/**
 * Unified daemon URL resolution for the web panel.
 *
 * Priority: DAEMON_URL env > PUBLIC_DAEMON_URL env > config file > default.
 * Config file reading only runs in SSR context (not in browser).
 *
 * Node.js built-ins are loaded lazily to avoid Vite client-bundle errors.
 */

const DEFAULT_DAEMON_URL = "http://localhost:7331";

interface DaemonConfig {
  host?: string;
  port?: number;
}

interface GoopspecConfig {
  daemon?: DaemonConfig;
}

/** Cached result so we only read the config file once per process. */
let cachedConfigUrl: string | null | undefined;

function readDaemonUrlFromConfigSync(): string | null {
  if (cachedConfigUrl !== undefined) {
    return cachedConfigUrl;
  }

  // Only attempt file reads in a Node.js / Bun SSR context
  if (typeof globalThis.process === "undefined") {
    cachedConfigUrl = null;
    return null;
  }

  try {
    // Use globalThis.process to access Node built-ins without top-level imports
    // that would break the Vite client bundle.
    /* eslint-disable @typescript-eslint/no-require-imports */
    const fs: typeof import("node:fs") = require("node:fs");
    const os: typeof import("node:os") = require("node:os");
    const path: typeof import("node:path") = require("node:path");
    /* eslint-enable @typescript-eslint/no-require-imports */

    const configPath = path.join(os.homedir(), ".goopspec", "config.json");
    const raw = fs.readFileSync(configPath, "utf-8");
    const config = JSON.parse(raw) as GoopspecConfig;

    if (config.daemon?.host && config.daemon?.port) {
      cachedConfigUrl = `http://${config.daemon.host}:${config.daemon.port}`;
    } else if (config.daemon?.port) {
      cachedConfigUrl = `http://localhost:${config.daemon.port}`;
    } else if (config.daemon?.host) {
      cachedConfigUrl = `http://${config.daemon.host}:7331`;
    } else {
      cachedConfigUrl = null;
    }

    return cachedConfigUrl;
  } catch {
    cachedConfigUrl = null;
    return null;
  }
}

/** Resolve the daemon base URL from env vars, config file, or default. */
export function getDaemonUrl(): string {
  if (import.meta.env.DAEMON_URL) {
    return import.meta.env.DAEMON_URL as string;
  }

  if (import.meta.env.PUBLIC_DAEMON_URL) {
    return import.meta.env.PUBLIC_DAEMON_URL as string;
  }

  const fromConfig = readDaemonUrlFromConfigSync();
  if (fromConfig) {
    return fromConfig;
  }

  return DEFAULT_DAEMON_URL;
}
