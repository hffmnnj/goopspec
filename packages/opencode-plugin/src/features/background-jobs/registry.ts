import { killJobGroup } from "./kill.js";
import type { JobRecord } from "./types.js";

export interface BackgroundJobRegistry {
  register(job: JobRecord): void;
  get(id: string): JobRecord | undefined;
  list(): JobRecord[];
  update(id: string, changes: Omit<Partial<JobRecord>, "id">): JobRecord | undefined;
  delete(id: string): boolean;
  disposeAll(): Promise<void>;
}

const JOB_ID_SPACE = 0x1000000;
let nextJobSequence = Math.floor(Math.random() * JOB_ID_SPACE);

export function generateJobId(): string {
  const id = `job_${nextJobSequence.toString(16).padStart(6, "0")}`;
  nextJobSequence = (nextJobSequence + 1) % JOB_ID_SPACE;
  return id;
}

/**
 * Records an exit without allowing a cancellation or timeout to be overwritten.
 */
export function transitionJobToExited(job: JobRecord, exitCode: number): JobRecord {
  return {
    ...job,
    exitCode,
    state: job.state === "running" ? "exited" : job.state,
  };
}

export function createBackgroundJobRegistry(): BackgroundJobRegistry {
  const jobs = new Map<string, JobRecord>();

  return {
    register(job): void {
      jobs.set(job.id, job);
    },

    get(id): JobRecord | undefined {
      return jobs.get(id);
    },

    list(): JobRecord[] {
      return [...jobs.values()];
    },

    update(id, changes): JobRecord | undefined {
      const job = jobs.get(id);
      if (!job) return undefined;

      const updated = { ...job, ...changes };
      jobs.set(id, updated);
      return updated;
    },

    delete(id): boolean {
      return jobs.delete(id);
    },

    async disposeAll(): Promise<void> {
      for (const job of jobs.values()) {
        if (job.timer) {
          clearTimeout(job.timer);
        }

        if (job.state !== "running") continue;

        try {
          killJobGroup(job.pgid);
        } catch {
          // A failed group cleanup must not prevent remaining jobs from being swept.
        }
      }
      jobs.clear();
    },
  };
}
