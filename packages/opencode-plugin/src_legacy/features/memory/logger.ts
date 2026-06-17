/**
 * Memory System Logger
 * Debug-aware logging for the memory worker and related components
 * @module features/memory/logger
 */

import { appendFileSync } from "fs";
import { join } from "path";

const DEBUG = process.env.GOOPSPEC_DEBUG === "true";
const PROJECT_ROOT = process.env.PROJECT_ROOT ?? process.cwd();
const LOG_FILE = join(PROJECT_ROOT, ".goopspec", "memory", "worker.log");

/**
 * Write to log file (always writes to file, console only in debug mode)
 */
function writeLog(level: string, message: string, data?: unknown): void {
  const timestamp = new Date().toISOString();
  const dataStr = data !== undefined ? ` ${JSON.stringify(data)}` : "";
  const line = `[${timestamp}] [${level}] ${message}${dataStr}\n`;

  // Always write to log file
  try {
    appendFileSync(LOG_FILE, line);
  } catch {
    // Ignore file write errors (directory may not exist yet)
  }

  // Only output to console in debug mode
  if (DEBUG) {
    if (level === "ERROR") {
      console.error(message, data ?? "");
    } else if (level === "WARN") {
      console.warn(message, data ?? "");
    } else {
      console.log(message, data ?? "");
    }
  }
}

/**
 * Log a debug message (file always, console only in debug mode)
 */
export function memLog(message: string, data?: unknown): void {
  writeLog("INFO", message, data);
}

/**
 * Log a warning (file always, console only in debug mode)
 */
export function memWarn(message: string, data?: unknown): void {
  writeLog("WARN", message, data);
}

/**
 * Log an error (file always, console only in debug mode)
 */
export function memError(message: string, data?: unknown): void {
  writeLog("ERROR", message, data);
}

/**
 * Check if debug mode is enabled
 */
export function isDebugEnabled(): boolean {
  return DEBUG;
}
