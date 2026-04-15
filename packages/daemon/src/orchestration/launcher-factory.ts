import type { WorkflowLauncher } from "./launcher.js";
import { CliLauncher } from "./cli-launcher.js";
import { SdkLauncher } from "./sdk-launcher.js";

export async function createLauncher(): Promise<WorkflowLauncher> {
  const sdkLauncher = new SdkLauncher();
  if (await sdkLauncher.isAvailable()) {
    return sdkLauncher;
  }

  return new CliLauncher();
}

export { SdkLauncher, CliLauncher };
export type { WorkflowLauncher };
