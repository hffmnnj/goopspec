import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { log, logError } from "./logger.js";
import { getGlobalConfigPath, getGoopspecRootFilePath } from "./paths.js";

function isMissingFileError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "ENOENT"
  );
}

async function removeStaleSidecar(sidecarPath: string): Promise<void> {
  try {
    await unlink(sidecarPath);
  } catch (error) {
    if (!isMissingFileError(error)) {
      logError("Failed to remove stale global config sidecar", error);
    }
  }
}

function parseGlobalConfig(content: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(content) as unknown;
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Invalid global config should degrade to an unavailable sidecar.
  }

  return null;
}

export async function syncGlobalConfigSidecar(projectDir: string): Promise<void> {
  const globalConfigPath = getGlobalConfigPath();
  const sidecarPath = getGoopspecRootFilePath(projectDir, "global-config.json");

  try {
    const content = await readFile(globalConfigPath, "utf-8");
    const parsed = parseGlobalConfig(content);

    if (!parsed) {
      await removeStaleSidecar(sidecarPath);
      log("Global GoopSpec config is invalid; sidecar removed", {
        globalConfigPath,
        sidecarPath,
      });
      return;
    }

    await mkdir(dirname(sidecarPath), { recursive: true });
    await writeFile(sidecarPath, `${JSON.stringify(parsed, null, 2)}\n`, "utf-8");
    log("Global GoopSpec config sidecar synced", {
      globalConfigPath,
      sidecarPath,
    });
  } catch (error) {
    if (!isMissingFileError(error)) {
      logError("Failed to sync global GoopSpec config sidecar", error);
    }
    await removeStaleSidecar(sidecarPath);
  }
}
