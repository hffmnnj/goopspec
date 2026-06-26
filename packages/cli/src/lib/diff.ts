import type { GoopConfig } from "./config.js";

export interface ConfigDiff {
  key: string;
  before: string | undefined;
  after: string | undefined;
}

function serializeValue(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

/**
 * Compute field-level diff between two configs.
 * Returns only fields that changed.
 */
export function computeConfigDiff(
  before: GoopConfig,
  after: GoopConfig,
): ConfigDiff[] {
  const changed: ConfigDiff[] = [];
  const allKeys = new Set([
    ...Object.keys(before),
    ...Object.keys(after),
  ]) as Set<keyof GoopConfig>;

  for (const key of allKeys) {
    const beforeValue = serializeValue(before[key]);
    const afterValue = serializeValue(after[key]);

    if (beforeValue !== afterValue) {
      changed.push({ key, before: beforeValue, after: afterValue });
    }
  }

  return changed;
}

/**
 * Format a ConfigDiff[] as a human-readable string for display in the CLI.
 *
 * Format: "projectName: undefined -> myproject"
 * For nested objects (agentModels), changed keys are listed individually.
 */
export function formatDiff(diffs: ConfigDiff[]): string {
  if (diffs.length === 0) {
    return "No changes.";
  }

  const lines = diffs.map((diff) => {
    const beforeText = diff.before === undefined ? "undefined" : diff.before;
    const afterText = diff.after === undefined ? "undefined" : diff.after;
    return `${diff.key}: ${beforeText} -> ${afterText}`;
  });

  return lines.join("\n");
}
