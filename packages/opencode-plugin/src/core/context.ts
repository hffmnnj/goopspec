/**
 * PluginContext factory — assembles all subsystems into the shared context
 * object that every GoopSpec tool and hook receives.
 *
 * Construction is resilient: individual subsystem failures are logged but
 * never propagate — the factory always returns a usable context.
 */

import { mkdirSync } from "node:fs";

import type { PluginInput } from "./sdk-compat.js";
import type { PluginContext, SessionInfo } from "./types.js";

import { GoopSpecDB } from "../features/db/index.js";
import { SqliteMemoryManager } from "../features/memory/index.js";
import { createResourceResolver, defaultReferencePaths } from "../features/resolver/index.js";
import { createSessionManager } from "../features/session/index.js";
import { createStateManager } from "../features/state-manager/index.js";
import { log, logError } from "../shared/logger.js";
import { getDbPath, getGoopspecDir, getMemoryDbPath, getPackageRoot } from "../shared/paths.js";

/**
 * Build a complete PluginContext from the SDK's PluginInput.
 *
 * Subsystem construction order:
 *   1. SdkEssentials (from PluginInput fields)
 *   2. StateManager (file-backed, project-scoped)
 *   3. MemoryManager (SQLite, project-scoped)
 *   4. ResourceResolver (file-backed, package-scoped)
 *   5. SessionManager (in-memory)
 *   6. SessionInfo (minimal initial record)
 */
export async function createPluginContext(input: PluginInput): Promise<PluginContext> {
  const directory = input.directory || process.cwd();
  const worktree = input.worktree || directory;

  log("Creating plugin context", { directory, worktree });

  const sdk = {
    client: input.client,
    directory,
    worktree,
    $: input.$,
  };

  // -- GoopSpec database ----------------------------------------------------
  const goopspecDir = getGoopspecDir(directory);
  try {
    mkdirSync(goopspecDir, { recursive: true });
  } catch (err) {
    logError("Failed to create .goopspec directory", err);
  }

  const db = new GoopSpecDB(getDbPath(directory));
  log("GoopSpec database initialised");

  // -- State manager -------------------------------------------------------
  const stateManager = createStateManager({ projectDir: directory, db });
  log("State manager initialised");

  // -- Memory manager ------------------------------------------------------
  let memory: PluginContext["memory"];
  try {
    memory = new SqliteMemoryManager({ dbPath: getMemoryDbPath(directory) });
    log("Memory manager initialised");
  } catch (err) {
    logError("Memory manager failed to initialise — using no-op fallback", err);
    memory = createNoOpMemory();
  }

  // -- Resource resolver ---------------------------------------------------
  let resolver: PluginContext["resolver"];
  try {
    const packageRoot = getPackageRoot();
    resolver = createResourceResolver(defaultReferencePaths(packageRoot));
    log("Resource resolver initialised", { packageRoot });
  } catch (err) {
    logError("Resource resolver failed to initialise — using no-op fallback", err);
    resolver = createNoOpResolver();
  }

  // -- Session manager -----------------------------------------------------
  const sessionManager = createSessionManager();

  // -- Session info --------------------------------------------------------
  const session: SessionInfo = {
    id: "",
    startedAt: new Date().toISOString(),
  };

  return {
    sdk,
    db,
    stateManager,
    memory,
    resolver,
    session,
    sessionManager,
  };
}

// ---------------------------------------------------------------------------
// No-op fallbacks for graceful degradation
// ---------------------------------------------------------------------------

function createNoOpMemory(): PluginContext["memory"] {
  const empty = {
    id: 0,
    type: "note" as const,
    title: "",
    content: "",
    importance: 0,
    createdAt: 0,
  };
  return {
    save: async (input) => ({ ...empty, ...input, id: 0, createdAt: Date.now() }),
    search: async () => [],
    getById: async () => null,
    forget: async () => false,
    forgetByQuery: async () => 0,
  };
}

function createNoOpResolver(): PluginContext["resolver"] {
  return {
    resolve: () => null,
    resolveMany: () => [],
    resolveAll: () => [],
    listNames: () => [],
  };
}
