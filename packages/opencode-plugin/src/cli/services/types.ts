/**
 * Service management types for GoopSpec daemon.
 * Platform adapters implement ServiceAdapter to manage the daemon as a system service.
 */

export type ServiceStatus = "running" | "stopped" | "not-installed" | "unknown";

export interface ServiceInfo {
  status: ServiceStatus;
  pid?: number;
  uptime?: number;
  message?: string;
}

export interface InstallOptions {
  /** Path to the bun executable */
  bunPath: string;
  /** Path to the daemon entry point (daemon's index.ts or compiled binary) */
  daemonPath: string;
  /** Port the daemon listens on */
  port: number;
  /** Host the daemon listens on */
  host: string;
}

export interface ServiceOperationResult {
  success: boolean;
  message: string;
}

/**
 * Abstract interface for platform-specific service management.
 * All service operations are async and must not throw.
 */
export interface ServiceAdapter {
  /** Unique name for this adapter */
  readonly platform: string;

  /** Install the daemon as a system service (idempotent) */
  install(options: InstallOptions): Promise<ServiceOperationResult>;

  /** Remove the service registration */
  uninstall(): Promise<ServiceOperationResult>;

  /** Start the service (must be installed first) */
  start(): Promise<ServiceOperationResult>;

  /** Stop the running service */
  stop(): Promise<ServiceOperationResult>;

  /** Get current service status */
  status(): Promise<ServiceInfo>;

  /** Check if service is installed */
  isInstalled(): Promise<boolean>;
}
