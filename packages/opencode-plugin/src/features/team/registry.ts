/**
 * Agent registry operations for team coordination.
 *
 * @module features/team/registry
 */

import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "fs";
import { join } from "path";
import { getProjectGoopspecDir } from "../../shared/paths.js";
import { logError } from "../../shared/logger.js";
import type {
  AgentRegistration,
  AgentRegistry,
  RegistryOperationResult,
} from "./types.js";

const REGISTRY_VERSION = 1;
const REGISTRY_DIR = "team";
const REGISTRY_FILE = "registry.json";
const LOCK_FILE = "registry.lock";
const DEFAULT_LOCK_TIMEOUT_MS = 2000;
const DEFAULT_RETRY_DELAY_MS = 25;

function getRegistryPaths(projectDir: string): {
  teamDir: string;
  registryPath: string;
  lockPath: string;
} {
  const goopspecDir = getProjectGoopspecDir(projectDir);
  const teamDir = join(goopspecDir, REGISTRY_DIR);
  return {
    teamDir,
    registryPath: join(teamDir, REGISTRY_FILE),
    lockPath: join(teamDir, LOCK_FILE),
  };
}

function ensureTeamDir(teamDir: string): void {
  if (!existsSync(teamDir)) {
    mkdirSync(teamDir, { recursive: true });
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Atomic write: write to temp file, then rename.
 *
 * NOTE: We intentionally use a lockfile + atomic rename pattern here because
 * goop_state is scoped to workflow state.json operations and doesn't expose a
 * generic atomic registry API. This keeps registry read-modify-write sequences
 * race-condition safe without changing the goop_state surface area.
 */
function atomicWriteFile(path: string, content: string): void {
  const tempPath = `${path}.tmp.${Date.now()}`;
  writeFileSync(tempPath, content, "utf-8");
  renameSync(tempPath, path);
}

function safeReadFile(path: string): string | null {
  try {
    if (!existsSync(path)) {
      return null;
    }
    return readFileSync(path, "utf-8");
  } catch (error) {
    logError(`Failed to read registry file: ${path}`, error);
    return null;
  }
}

function createDefaultRegistry(): AgentRegistry {
  return {
    version: REGISTRY_VERSION,
    agents: {},
  };
}

function normalizeRegistry(raw: unknown): AgentRegistry {
  if (!raw || typeof raw !== "object") {
    return createDefaultRegistry();
  }

  const parsed = raw as Partial<AgentRegistry>;
  const version = typeof parsed.version === "number" ? parsed.version : REGISTRY_VERSION;
  const agents = parsed.agents && typeof parsed.agents === "object"
    ? (parsed.agents as Record<string, AgentRegistration>)
    : {};

  return { version, agents };
}

function readRegistry(projectDir: string): AgentRegistry {
  const { registryPath } = getRegistryPaths(projectDir);
  const content = safeReadFile(registryPath);
  if (!content) {
    return createDefaultRegistry();
  }

  try {
    const parsed = JSON.parse(content) as unknown;
    return normalizeRegistry(parsed);
  } catch (error) {
    logError("Failed to parse registry file, using default", error);
    return createDefaultRegistry();
  }
}

function writeRegistry(projectDir: string, registry: AgentRegistry): void {
  const { teamDir, registryPath } = getRegistryPaths(projectDir);
  ensureTeamDir(teamDir);
  atomicWriteFile(registryPath, JSON.stringify(registry, null, 2));
}

async function acquireLock(lockPath: string, timeoutMs: number): Promise<number> {
  const start = Date.now();
  while (true) {
    try {
      return openSync(lockPath, "wx");
    } catch (error) {
      const code = error instanceof Error && "code" in error
        ? String((error as NodeJS.ErrnoException).code)
        : "";

      if (code !== "EEXIST") {
        throw error;
      }

      if (Date.now() - start >= timeoutMs) {
        throw new Error(`Timeout acquiring registry lock at ${lockPath}`);
      }

      await sleep(DEFAULT_RETRY_DELAY_MS);
    }
  }
}

function releaseLock(lockPath: string, fd: number | null): void {
  if (fd !== null) {
    try {
      closeSync(fd);
    } catch (error) {
      logError(`Failed to close registry lock file: ${lockPath}`, error);
    }
    try {
      if (existsSync(lockPath)) {
        unlinkSync(lockPath);
      }
    } catch (error) {
      logError(`Failed to release registry lock: ${lockPath}`, error);
    }
  }
}

async function withRegistryLock<T>(
  projectDir: string,
  operation: () => Promise<T> | T,
  timeoutMs: number = DEFAULT_LOCK_TIMEOUT_MS
): Promise<T> {
  const { teamDir, lockPath } = getRegistryPaths(projectDir);
  ensureTeamDir(teamDir);

  let fd: number | null = null;
  try {
    fd = await acquireLock(lockPath, timeoutMs);
    return await operation();
  } finally {
    releaseLock(lockPath, fd);
  }
}

function getProjectDir(): string {
  return process.cwd();
}

export async function getRegistry(): Promise<AgentRegistry> {
  return readRegistry(getProjectDir());
}

export async function registerAgent(
  registration: AgentRegistration
): Promise<RegistryOperationResult> {
  try {
    const projectDir = getProjectDir();
    return await withRegistryLock(projectDir, () => {
      const registry = readRegistry(projectDir);
      const entry: AgentRegistration = {
        ...registration,
        startedAt: registration.startedAt || Date.now(),
      };

      const updated: AgentRegistry = {
        ...registry,
        agents: {
          ...registry.agents,
          [entry.id]: entry,
        },
      };

      writeRegistry(projectDir, updated);
      return { ok: true, registry: updated };
    });
  } catch (error) {
    logError("Failed to register agent", error);
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function deregisterAgent(
  agentId: string
): Promise<RegistryOperationResult> {
  try {
    const projectDir = getProjectDir();
    return await withRegistryLock(projectDir, () => {
      const registry = readRegistry(projectDir);
      if (!registry.agents[agentId]) {
        return { ok: false, error: `Agent '${agentId}' not found in registry` };
      }

      const updatedAgents = { ...registry.agents };
      delete updatedAgents[agentId];

      const updated: AgentRegistry = {
        ...registry,
        agents: updatedAgents,
      };

      writeRegistry(projectDir, updated);
      return { ok: true, registry: updated };
    });
  } catch (error) {
    logError("Failed to deregister agent", error);
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function getActiveAgents(): Promise<AgentRegistration[]> {
  const registry = await getRegistry();
  return Object.values(registry.agents);
}

export async function getAgentsByType(type: string): Promise<AgentRegistration[]> {
  const agents = await getActiveAgents();
  return agents.filter(agent => agent.type === type);
}

export async function isFileClaimed(filePath: string): Promise<boolean> {
  const agents = await getActiveAgents();
  return agents.some(agent => agent.claimedFiles.includes(filePath));
}
