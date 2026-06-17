import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";

import pc from "picocolors";

import { DEFAULT_CONFIG } from "../../core/config.js";
import type { GoopSpecConfig, McpConfig } from "../../core/types.js";
import { detectEnvironment } from "../../features/setup/index.js";
import {
  cancel,
  intro,
  isCancel,
  multiselect,
  outro,
  sectionHeader,
  select,
  showBanner,
  showError,
  showInfo,
  showSuccess,
  showWarning,
  formatTable,
} from "../ui.js";

export const MCP_CATEGORIES = {
  search: "Search providers used for web and code lookup.",
  documentation: "Documentation and API reference retrieval tools.",
  memory: "Memory provider selections surfaced in MCP UI.",
  automation: "Browser automation and end-to-end interaction tools.",
  data: "Data access and repository integration tools.",
} as const;

export type McpCategory = keyof typeof MCP_CATEGORIES;

export type McpExclusionGroup = "search-provider" | "memory-provider";

export type McpConfigKey = keyof McpConfig | "searchProvider" | "memoryProvider";

export type McpServerInfo = {
  name: string;
  displayName: string;
  description: string;
  category: McpCategory;
  configKey: McpConfigKey;
  exclusionGroup?: McpExclusionGroup;
  note?: string;
};

export const MCP_SERVER_REGISTRY: readonly McpServerInfo[] = [
  {
    name: "brave",
    displayName: "Brave Search",
    description: "Search provider option used instead of Exa.",
    category: "search",
    configKey: "searchProvider",
    exclusionGroup: "search-provider",
    note: "Special-cased: active when searchProvider is 'brave' and mcp.exa is false.",
  },
  {
    name: "exa",
    displayName: "Exa",
    description: "Semantic web and code search provider.",
    category: "search",
    configKey: "exa",
    exclusionGroup: "search-provider",
    note: "Provider switching should also keep searchProvider aligned to 'exa'.",
  },
  {
    name: "context7",
    displayName: "Context7",
    description: "Library documentation resolver and query tools.",
    category: "documentation",
    configKey: "context7",
  },
  {
    name: "memory-local",
    displayName: "Memory (Local)",
    description: "Local embedding provider for memory retrieval.",
    category: "memory",
    configKey: "memoryProvider",
    exclusionGroup: "memory-provider",
    note: "Provider selection only; not a standalone MCP server toggle.",
  },
  {
    name: "memory-openai",
    displayName: "Memory (OpenAI)",
    description: "OpenAI embedding provider for memory retrieval.",
    category: "memory",
    configKey: "memoryProvider",
    exclusionGroup: "memory-provider",
    note: "Provider selection only; not a standalone MCP server toggle.",
  },
  {
    name: "memory-ollama",
    displayName: "Memory (Ollama)",
    description: "Ollama embedding provider for memory retrieval.",
    category: "memory",
    configKey: "memoryProvider",
    exclusionGroup: "memory-provider",
    note: "Provider selection only; not a standalone MCP server toggle.",
  },
  {
    name: "playwright",
    displayName: "Playwright",
    description: "Browser automation and interaction tooling.",
    category: "automation",
    configKey: "playwright",
  },
  {
    name: "github",
    displayName: "GitHub",
    description: "Repository APIs for issues, pull requests, and metadata.",
    category: "data",
    configKey: "github",
  },
  {
    name: "sqlite",
    displayName: "SQLite",
    description: "Local SQLite data access utilities.",
    category: "data",
    configKey: "sqlite",
  },
  {
    name: "memory",
    displayName: "Memory MCP",
    description: "Persistent memory storage and retrieval tools.",
    category: "memory",
    configKey: "memory",
    note: "This toggle controls MCP memory server availability.",
  },
] as const;

type ConfigJson = GoopSpecConfig;
type ToggleableServerKey = keyof McpConfig;
type MemoryProvider = "local" | "openai" | "ollama";

export const TOGGLEABLE_SERVER_KEYS: readonly ToggleableServerKey[] = [
  "context7",
  "exa",
  "playwright",
  "memory",
  "github",
  "sqlite",
];

function handleCancel<T>(value: T | symbol): asserts value is T {
  if (isCancel(value)) {
    cancel("MCP configuration cancelled.");
    process.exit(0);
  }
}

function readConfig(configPath: string): ConfigJson {
  try {
    if (!existsSync(configPath)) {
      return {};
    }
    return JSON.parse(readFileSync(configPath, "utf-8")) as ConfigJson;
  } catch {
    return {};
  }
}

function writeConfig(configPath: string, config: ConfigJson): void {
  writeFileSync(configPath, JSON.stringify(config, null, 2));
}

function resolveConfigPath(env: Awaited<ReturnType<typeof detectEnvironment>>): string | null {
  if (env.hasProjectGoopSpecConfig) {
    return env.projectConfigPath;
  }
  if (env.hasGlobalGoopSpecConfig) {
    return env.globalConfigPath;
  }
  return null;
}

export function getMcpState(config: ConfigJson): McpConfig {
  return {
    ...DEFAULT_CONFIG.mcp,
    ...(config.mcp ?? {}),
  };
}

export function getSearchProvider(config: ConfigJson): "brave" | "exa" {
  const exaEnabled = getMcpState(config).exa ?? false;
  return exaEnabled ? "exa" : "brave";
}

export function getMemoryProvider(config: ConfigJson): MemoryProvider {
  return config.memory?.embeddings?.provider ?? "local";
}

export function isServerEnabled(config: ConfigJson, server: McpServerInfo): boolean {
  if (server.exclusionGroup === "search-provider") {
    return server.name === "exa" ? getSearchProvider(config) === "exa" : getSearchProvider(config) === "brave";
  }

  if (server.exclusionGroup === "memory-provider") {
    const provider = getMemoryProvider(config);
    return server.name === `memory-${provider}`;
  }

  if (typeof server.configKey === "string" && TOGGLEABLE_SERVER_KEYS.includes(server.configKey as ToggleableServerKey)) {
    return Boolean(getMcpState(config)[server.configKey as ToggleableServerKey]);
  }

  return false;
}

function getCategoryLabel(category: McpCategory): string {
  return category.charAt(0).toUpperCase() + category.slice(1);
}

function getServerRows(config: ConfigJson): string[][] {
  return MCP_SERVER_REGISTRY.map((server) => {
    const status = isServerEnabled(config, server) ? pc.green("enabled") : pc.dim("disabled");
    return [server.displayName, status, getCategoryLabel(server.category)];
  });
}

export function toggleServer(config: ConfigJson, key: ToggleableServerKey): void {
  const nextMcp: McpConfig = {
    ...getMcpState(config),
    [key]: !(getMcpState(config)[key] ?? false),
  };
  config.mcp = nextMcp;
}

export function setSearchProvider(config: ConfigJson, provider: "brave" | "exa"): void {
  config.mcp = {
    ...getMcpState(config),
    exa: provider === "exa",
  };
}

export function setMemoryProvider(config: ConfigJson, provider: MemoryProvider): void {
  const existingMemory = config.memory ?? {};
  config.memory = {
    ...existingMemory,
    embeddings: {
      ...existingMemory.embeddings,
      provider,
    },
  };
}

export async function runMcp(): Promise<void> {
  const projectDir = process.cwd();

  try {
    showBanner();
    console.log();
    intro(pc.bold("MCP Server Configuration"));

    const env = await detectEnvironment(projectDir);
    const configPath = resolveConfigPath(env);

    if (!configPath) {
      showWarning("No GoopSpec config found for this directory.");
      showWarning("Run 'goopspec init' first to create a config file.");
      outro("MCP servers not configured.");
      return;
    }

    const config = readConfig(configPath);

    while (true) {
      sectionHeader("Current MCP Server Status", "🧩");
      console.log(formatTable(["Server", "Status", "Category"], getServerRows(config)));
      console.log();
      console.log(pc.dim(`  Config: ${basename(configPath)} (${configPath})`));
      console.log();

      const action = await select({
        message: "Choose an action:",
        options: [
          { value: "toggle", label: "Toggle servers", hint: "Enable or disable specific MCP servers" },
          { value: "search", label: "Switch search provider", hint: "Brave or Exa" },
          { value: "memory", label: "Switch memory provider", hint: "local, OpenAI, or Ollama" },
          { value: "done", label: "Done", hint: "Save and exit" },
        ],
        initialValue: "done",
      });
      handleCancel(action);

      if (action === "done") {
        break;
      }

      if (action === "toggle") {
        const toggleableServers = MCP_SERVER_REGISTRY.filter(
          (server): server is McpServerInfo & { configKey: ToggleableServerKey } =>
            TOGGLEABLE_SERVER_KEYS.includes(server.configKey as ToggleableServerKey),
        );

        const selected = await multiselect({
          message: "Select servers to flip (selected entries will toggle):",
          options: toggleableServers.map((server) => ({
            value: server.configKey,
            label: server.displayName,
            hint: `currently ${isServerEnabled(config, server) ? "enabled" : "disabled"}`,
          })),
        });
        handleCancel(selected);

        for (const key of selected) {
          toggleServer(config, key);
        }

        writeConfig(configPath, config);
        showSuccess(`Toggled ${selected.length} server${selected.length === 1 ? "" : "s"}.`);
        continue;
      }

      if (action === "search") {
        const currentProvider = getSearchProvider(config);
        const provider = await select({
          message: "Select active search provider:",
          options: [
            { value: "brave", label: "Brave", hint: "Sets mcp.exa = false" },
            { value: "exa", label: "Exa", hint: "Sets mcp.exa = true" },
          ],
          initialValue: currentProvider,
        });
        handleCancel(provider);

        setSearchProvider(config, provider);
        writeConfig(configPath, config);
        showSuccess(`Search provider switched to ${provider === "exa" ? "Exa" : "Brave"}.`);
        continue;
      }

      const currentMemoryProvider = getMemoryProvider(config);
      const provider = await select({
        message: "Select memory embedding provider:",
        options: [
          { value: "local", label: "local" },
          { value: "openai", label: "OpenAI" },
          { value: "ollama", label: "Ollama" },
        ],
        initialValue: currentMemoryProvider,
      });
      handleCancel(provider);

      setMemoryProvider(config, provider);
      writeConfig(configPath, config);
      showSuccess(`Memory provider switched to ${provider}.`);
      showInfo("Updated memory.embeddings.provider in GoopSpec config.");
    }

    writeConfig(configPath, config);
    console.log();
    showSuccess(`Saved MCP configuration to ${basename(configPath)}.`);
    outro("MCP servers configured.");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    showError(message, "Check config file permissions and try again");
    process.exit(1);
  }
}
