import { logError } from "../../shared/logger.js";
import type { JobRecord } from "./types.js";

const KILL_GRACE_PERIOD_MS = 2_000;

function isAlreadyDead(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ESRCH";
}

function ensurePgid(pgid: number): void {
  if (!Number.isSafeInteger(pgid) || pgid <= 0) {
    throw new Error("A job process group ID must be a positive integer");
  }
}

export function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (isAlreadyDead(error)) return false;
    throw error;
  }
}

export function killJobGroup(pgid: number): void {
  ensurePgid(pgid);
  const groupId = -pgid;

  try {
    process.kill(groupId, "SIGTERM");
  } catch (error) {
    if (!isAlreadyDead(error)) throw error;
    return;
  }

  const escalationTimer = setTimeout(() => {
    try {
      if (!isAlive(groupId)) return;
      process.kill(groupId, "SIGKILL");
    } catch (error) {
      if (!isAlreadyDead(error)) {
        logError("Failed to escalate background job process group termination", error);
      }
    }
  }, KILL_GRACE_PERIOD_MS);
  escalationTimer.unref();
}

export function startExpiryTimer(job: JobRecord, onExpire: (job: JobRecord) => void): Timer {
  const ttlMs = Math.max(0, job.deadline - Date.now());
  const timer = setTimeout(() => onExpire(job), ttlMs);
  timer.unref();
  job.timer = timer;
  return timer;
}

export function sweepIfExpired(job: JobRecord): boolean {
  return Date.now() > job.deadline;
}
