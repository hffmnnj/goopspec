/**
 * Distillation Configuration
 * Configures session distillation using existing LLM config
 * @module features/setup/distillation-config
 */

export interface DistillationConfig {
  enabled: boolean;
  trigger: "session-end" | "manual" | "both";
  model?: string;
  minEventsToDistill: number;
}

export const DEFAULT_DISTILLATION_CONFIG: DistillationConfig = {
  enabled: true,
  trigger: "session-end",
  minEventsToDistill: 5,
};

/**
 * Get the model to use for distillation
 * Priority: explicit config > goop-librarian model > default model
 */
export function getDistillationModel(
  distillConfig: DistillationConfig,
  agentModels: Record<string, string>,
  defaultModel: string
): string {
  if (distillConfig.model) return distillConfig.model;
  if (agentModels["goop-librarian"]) return agentModels["goop-librarian"];
  return defaultModel;
}

/**
 * Create distillation config from setup options
 */
export function createDistillationConfig(
  enabled: boolean = true,
  trigger: DistillationConfig["trigger"] = "session-end"
): DistillationConfig {
  return {
    ...DEFAULT_DISTILLATION_CONFIG,
    enabled,
    trigger,
  };
}

/**
 * Merge distillation config into memory config
 */
export function mergeDistillationConfig(
  memoryConfig: Record<string, unknown>,
  distillConfig: DistillationConfig
): Record<string, unknown> {
  return {
    ...memoryConfig,
    distillation: {
      enabled: distillConfig.enabled,
      trigger: distillConfig.trigger,
      minEvents: distillConfig.minEventsToDistill,
    },
  };
}

/**
 * Format distillation config for display
 */
export function formatDistillationConfig(config: DistillationConfig, model?: string): string {
  const lines: string[] = ["## Session Distillation"];
  
  if (!config.enabled) {
    lines.push("Status: Disabled");
    return lines.join("\n");
  }
  
  lines.push("Status: Enabled");
  lines.push(`Trigger: ${formatTrigger(config.trigger)}`);
  lines.push(`Min events: ${config.minEventsToDistill}`);
  if (model) {
    lines.push(`Model: ${model}`);
  }
  
  return lines.join("\n");
}

function formatTrigger(trigger: DistillationConfig["trigger"]): string {
  switch (trigger) {
    case "session-end":
      return "At end of session";
    case "manual":
      return "Manual only";
    case "both":
      return "Session end + manual";
    default:
      return trigger;
  }
}
