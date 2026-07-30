export const JOB_STATES = ["running", "exited", "cancelled", "timed-out"] as const;

export type JobState = (typeof JOB_STATES)[number];

export interface JobRecord {
  id: string;
  pid: number;
  pgid: number;
  command: string;
  cwd: string;
  logDir: string;
  state: JobState;
  exitCode: number | null;
  startedAt: number;
  deadline: number;
  proc?: Bun.Subprocess;
  timer?: Timer;
}
