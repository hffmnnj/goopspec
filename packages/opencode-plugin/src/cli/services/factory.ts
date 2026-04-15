import type { PlatformInfo } from "../../features/setup/platform.js";
import type {
  InstallOptions,
  ServiceAdapter,
  ServiceInfo,
  ServiceOperationResult,
} from "./types.js";

const NOT_SUPPORTED_MESSAGE = "Service management not supported on this platform";

/**
 * Create the appropriate ServiceAdapter for the current platform.
 * Returns a NullAdapter when the platform has no supported service manager.
 */
export function createServiceAdapter(platform: PlatformInfo): ServiceAdapter {
  if (platform.serviceManager === "systemd") {
    return new LazyAdapter("systemd", "./systemd.js", "SystemdAdapter");
  }

  if (platform.serviceManager === "launchd") {
    return new LazyAdapter("launchd", "./launchd.js", "LaunchdAdapter");
  }

  if (platform.serviceManager === "scm") {
    return new LazyAdapter("scm", "./windows.js", "WindowsAdapter");
  }

  return new NullAdapter();
}

/**
 * NullAdapter for unsupported platforms.
 * All operations return a helpful "not supported" message.
 */
class NullAdapter implements ServiceAdapter {
  readonly platform = "none";

  async install(_options: InstallOptions): Promise<ServiceOperationResult> {
    return { success: false, message: NOT_SUPPORTED_MESSAGE };
  }

  async uninstall(): Promise<ServiceOperationResult> {
    return { success: false, message: NOT_SUPPORTED_MESSAGE };
  }

  async start(): Promise<ServiceOperationResult> {
    return { success: false, message: NOT_SUPPORTED_MESSAGE };
  }

  async stop(): Promise<ServiceOperationResult> {
    return { success: false, message: NOT_SUPPORTED_MESSAGE };
  }

  async status(): Promise<ServiceInfo> {
    return { status: "unknown", message: NOT_SUPPORTED_MESSAGE };
  }

  async isInstalled(): Promise<boolean> {
    return false;
  }
}

class LazyAdapter implements ServiceAdapter {
  readonly platform: string;
  private adapterPromise?: Promise<ServiceAdapter>;

  constructor(
    platform: string,
    private readonly modulePath: string,
    private readonly exportName: string,
  ) {
    this.platform = platform;
  }

  async install(options: InstallOptions): Promise<ServiceOperationResult> {
    const adapter = await this.loadAdapter();
    if (!adapter) {
      return {
        success: false,
        message: `Service adapter for ${this.platform} is unavailable`,
      };
    }

    try {
      return await adapter.install(options);
    } catch (error) {
      return { success: false, message: this.getErrorMessage(error) };
    }
  }

  async uninstall(): Promise<ServiceOperationResult> {
    const adapter = await this.loadAdapter();
    if (!adapter) {
      return {
        success: false,
        message: `Service adapter for ${this.platform} is unavailable`,
      };
    }

    try {
      return await adapter.uninstall();
    } catch (error) {
      return { success: false, message: this.getErrorMessage(error) };
    }
  }

  async start(): Promise<ServiceOperationResult> {
    const adapter = await this.loadAdapter();
    if (!adapter) {
      return {
        success: false,
        message: `Service adapter for ${this.platform} is unavailable`,
      };
    }

    try {
      return await adapter.start();
    } catch (error) {
      return { success: false, message: this.getErrorMessage(error) };
    }
  }

  async stop(): Promise<ServiceOperationResult> {
    const adapter = await this.loadAdapter();
    if (!adapter) {
      return {
        success: false,
        message: `Service adapter for ${this.platform} is unavailable`,
      };
    }

    try {
      return await adapter.stop();
    } catch (error) {
      return { success: false, message: this.getErrorMessage(error) };
    }
  }

  async status(): Promise<ServiceInfo> {
    const adapter = await this.loadAdapter();
    if (!adapter) {
      return {
        status: "unknown",
        message: `Service adapter for ${this.platform} is unavailable`,
      };
    }

    try {
      return await adapter.status();
    } catch (error) {
      return { status: "unknown", message: this.getErrorMessage(error) };
    }
  }

  async isInstalled(): Promise<boolean> {
    const adapter = await this.loadAdapter();
    if (!adapter) {
      return false;
    }

    try {
      return await adapter.isInstalled();
    } catch {
      return false;
    }
  }

  private async loadAdapter(): Promise<ServiceAdapter | null> {
    if (!this.adapterPromise) {
      this.adapterPromise = this.instantiateAdapter();
    }

    try {
      return await this.adapterPromise;
    } catch {
      return null;
    }
  }

  private async instantiateAdapter(): Promise<ServiceAdapter> {
    const moduleExports = await import(this.modulePath);
    const candidate = moduleExports[this.exportName] ?? moduleExports.default;

    if (typeof candidate !== "function") {
      throw new Error(`Adapter export '${this.exportName}' not found in ${this.modulePath}`);
    }

    const adapter = new candidate() as ServiceAdapter;
    if (!adapter || typeof adapter !== "object") {
      throw new Error(`Adapter '${this.exportName}' could not be constructed`);
    }

    return adapter;
  }

  private getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : "Unknown service adapter error";
  }
}
