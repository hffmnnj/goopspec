/**
 * Memory Worker Entry Point
 * Standalone background service for memory operations
 * @module features/memory/worker
 */

import { createApp, initializeStorage } from "./server.js";
import * as fs from "fs";
import * as path from "path";
import { memLog, memError, isDebugEnabled } from "../logger.js";

// Configuration from environment
const PORT = parseInt(process.env.MEMORY_PORT ?? "37777");
const PROJECT_ROOT = process.env.PROJECT_ROOT ?? process.cwd();
const MEMORY_DIR = path.join(PROJECT_ROOT, ".goopspec", "memory");
const DB_PATH = path.join(MEMORY_DIR, "memory.db");
const PID_FILE = path.join(MEMORY_DIR, "worker.pid");

/**
 * Ensure memory directory exists
 */
function ensureDirectory(): void {
  if (!fs.existsSync(MEMORY_DIR)) {
    fs.mkdirSync(MEMORY_DIR, { recursive: true });
    memLog(`[Memory Worker] Created directory: ${MEMORY_DIR}`);
  }
}

/**
 * Write PID file
 */
function writePidFile(): void {
  fs.writeFileSync(PID_FILE, process.pid.toString());
  memLog(`[Memory Worker] PID file written: ${PID_FILE}`);
}

/**
 * Remove PID file on exit
 */
function cleanupPidFile(): void {
  try {
    if (fs.existsSync(PID_FILE)) {
      fs.unlinkSync(PID_FILE);
    }
  } catch {
    // Ignore cleanup errors
  }
}

/**
 * Setup logging to file (legacy - now handled by logger.ts)
 */
function setupLogging(): void {
  // Logging is now handled by the centralized logger in logger.ts
  // which respects GOOPSPEC_DEBUG for console output
}

/**
 * Main worker startup
 */
async function main(): Promise<void> {
  if (isDebugEnabled()) {
    memLog("============================================");
    memLog("[Memory Worker] Starting...");
    memLog(`[Memory Worker] Port: ${PORT}`);
    memLog(`[Memory Worker] Project: ${PROJECT_ROOT}`);
    memLog(`[Memory Worker] Database: ${DB_PATH}`);
    memLog("============================================");
  }

  // Setup
  ensureDirectory();
  setupLogging();
  writePidFile();

  // Pre-initialize storage
  await initializeStorage({ dbPath: DB_PATH });

  // Create and start server
  const app = createApp({ dbPath: DB_PATH });

  const server = Bun.serve({
    port: PORT,
    fetch: app.fetch,
  });

  memLog(`[Memory Worker] Server listening on http://localhost:${PORT}`);

  // Handle shutdown signals
  process.on("SIGINT", () => {
    memLog("[Memory Worker] Received SIGINT, shutting down...");
    cleanupPidFile();
    server.stop();
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    memLog("[Memory Worker] Received SIGTERM, shutting down...");
    cleanupPidFile();
    server.stop();
    process.exit(0);
  });

  // Handle uncaught errors
  process.on("uncaughtException", (error) => {
    memError("[Memory Worker] Uncaught exception:", error);
    cleanupPidFile();
    process.exit(1);
  });

  process.on("unhandledRejection", (reason) => {
    memError("[Memory Worker] Unhandled rejection:", reason);
  });
}

// Start the worker
main().catch((error) => {
  memError("[Memory Worker] Fatal error:", error);
  cleanupPidFile();
  process.exit(1);
});
