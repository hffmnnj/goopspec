import type { SdkPermission } from "../../core/sdk-compat.js";

import { canonicalArgsHash } from "./normalize.js";

const RELEVANT_PERMISSION_TYPES = new Set(["write", "edit", "apply_patch", "bash"]);

export interface PermissionSignature {
  tool: string;
  argsSignature: string;
}

function stringsFromPattern(pattern: unknown): string[] {
  if (typeof pattern === "string") return [pattern];
  if (!Array.isArray(pattern)) return [];
  return pattern.filter((value): value is string => typeof value === "string");
}

function stringFromMetadata(metadata: unknown): string | undefined {
  if (metadata == null || typeof metadata !== "object" || Array.isArray(metadata)) {
    return undefined;
  }

  const record = metadata as Record<string, unknown>;
  for (const key of ["command", "args"] as const) {
    if (typeof record[key] === "string") return record[key];
  }

  const input = record.input;
  if (input == null || typeof input !== "object" || Array.isArray(input)) {
    return undefined;
  }

  const inputRecord = input as Record<string, unknown>;
  for (const key of ["command", "args"] as const) {
    if (typeof inputRecord[key] === "string") return inputRecord[key];
  }

  return undefined;
}

function extractBashCommand(permission: SdkPermission): string | undefined {
  const metadataCommand = stringFromMetadata(permission.metadata);
  if (metadataCommand) return metadataCommand;

  return stringsFromPattern(permission.pattern)[0];
}

/**
 * Derive the same tool/argument signature used by the completed-call tracker.
 *
 * Bash requests carry a command in host-dependent permission fields, while
 * file mutations use their requested path(s) as the best available basis.
 */
export function derivePermissionSignature(
  permission: SdkPermission,
): PermissionSignature | undefined {
  if (!RELEVANT_PERMISSION_TYPES.has(permission.type)) return undefined;

  if (permission.type === "bash") {
    const command = extractBashCommand(permission);
    if (!command) return undefined;
    return {
      tool: "bash",
      argsSignature: canonicalArgsHash("bash", { command }),
    };
  }

  const patterns = stringsFromPattern(permission.pattern);
  if (patterns.length === 0) return undefined;

  return {
    tool: permission.type,
    argsSignature: canonicalArgsHash(permission.type, { pattern: patterns }),
  };
}
