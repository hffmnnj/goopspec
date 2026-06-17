/**
 * Shared HTTP client for communicating with the GoopSpec daemon.
 * All daemon tools use this client instead of calling fetch directly.
 *
 * @module features/daemon/client
 */

import { getConfig } from "../../cli/config.js";

const DEFAULT_BASE_URL = "http://localhost:7331";
const REQUEST_TIMEOUT_MS = 5000;

/**
 * Thrown when the daemon process is unreachable (network error or timeout).
 */
export class DaemonUnavailableError extends Error {
  constructor(message = "GoopSpec daemon is not reachable") {
    super(message);
    this.name = "DaemonUnavailableError";
  }
}

/**
 * Thrown when the daemon returns a non-2xx HTTP response.
 */
export class DaemonApiError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "DaemonApiError";
  }
}

/**
 * Lightweight HTTP client for the GoopSpec daemon REST API.
 *
 * - Enforces a per-request timeout via AbortController.
 * - Converts network / timeout failures into DaemonUnavailableError.
 * - Converts non-2xx responses into DaemonApiError.
 */
export class DaemonClient {
  private readonly baseUrl: string;

  constructor(baseUrl: string = DEFAULT_BASE_URL) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
  }

  /**
   * Returns the base URL this client is configured to connect to.
   */
  getBaseUrl(): string {
    return this.baseUrl;
  }

  /**
   * Returns true when the daemon /health endpoint responds with 2xx.
   */
  async isAvailable(): Promise<boolean> {
    try {
      await this.get<unknown>("/health");
      return true;
    } catch {
      return false;
    }
  }

  async get<T>(path: string): Promise<T> {
    return this.request<T>("GET", path);
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>("POST", path, body);
  }

  async put<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>("PUT", path, body);
  }

  async delete(path: string): Promise<void> {
    await this.request<unknown>("DELETE", path);
  }

  // ── internal ──────────────────────────────────────────────────────────

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const init: RequestInit = {
        method,
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
      };

      if (body !== undefined) {
        init.body = JSON.stringify(body);
      }

      const res = await fetch(url, init);

      if (!res.ok) {
        let message = `Daemon returned ${res.status}`;
        try {
          const text = await res.text();
          if (text) message = text;
        } catch {
          // ignore body read failures
        }
        throw new DaemonApiError(res.status, message);
      }

      if (res.status === 204) {
        return undefined as T;
      }

      return (await res.json()) as T;
    } catch (error) {
      if (error instanceof DaemonApiError) throw error;
      throw new DaemonUnavailableError(
        error instanceof Error ? error.message : "GoopSpec daemon is not reachable",
      );
    } finally {
      clearTimeout(timer);
    }
  }
}

export async function createDaemonClient(): Promise<DaemonClient> {
  const config = await getConfig();
  return new DaemonClient(config.daemonUrl);
}
