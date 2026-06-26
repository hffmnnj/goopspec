/**
 * Self-contained shared types for the GoopSpec CLI. Intentionally NOT imported
 * from packages/opencode-plugin so the CLI package remains independent and
 * globally installable without depending on the plugin workspace package.
 */

/** Persisted project-level config stored in `.goopspec/config.json`. */
export interface GoopConfig {
  projectName?: string;
  defaultModel?: string;
  agentModels?: Partial<Record<string, string>>;
  agentThinkingBudgets?: Partial<Record<string, number>>;
  memoryEnabled?: boolean;
  gitignoreGoopspec?: boolean;
}
