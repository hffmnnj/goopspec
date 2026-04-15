export interface DaemonHealth {
  status: "ok" | "degraded" | "error";
  uptime: number;
  version: string;
  projectCount: number;
  activeWorkflows: number;
  timestamp: string;
}

export interface DaemonConfig {
  port: number;
  host: string;
  dbPath: string;
  logLevel: "debug" | "info" | "warn" | "error";
}
