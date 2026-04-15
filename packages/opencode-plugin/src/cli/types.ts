export const CLI_COMMANDS = [
  "init",
  "register",
  "daemon",
  "models",
  "mcp",
  "memory",
  "status",
  "verify",
  "reset",
] as const;

export type CliCommand = (typeof CLI_COMMANDS)[number];

export interface CliArgs {
  command: CliCommand | null;
  flags: Record<string, string | boolean>;
  args: string[];
}

export interface CommandMeta {
  name: CliCommand;
  description: string;
  usage: string;
  examples?: string[];
  group: "setup" | "project" | "daemon" | "tools";
}

export const COMMAND_META: CommandMeta[] = [
  {
    name: "init",
    description: "Initialize GoopSpec in a project",
    usage: "goopspec init [--reset-password]",
    examples: ["goopspec init", "goopspec init --reset-password"],
    group: "setup",
  },
  {
    name: "register",
    description: "Register this project with the daemon",
    usage: "goopspec register [--name <n>] [--description <d>]",
    examples: ["goopspec register", "goopspec register --name my-app"],
    group: "project",
  },
  {
    name: "daemon",
    description: "Manage the GoopSpec daemon service",
    usage: "goopspec daemon <start|stop|status|install|uninstall>",
    examples: ["goopspec daemon status", "goopspec daemon start"],
    group: "daemon",
  },
  {
    name: "status",
    description: "Show GoopSpec and daemon status",
    usage: "goopspec status",
    group: "tools",
  },
  {
    name: "models",
    description: "Manage AI model configurations",
    usage: "goopspec models",
    group: "tools",
  },
  {
    name: "mcp",
    description: "Configure MCP server settings",
    usage: "goopspec mcp",
    group: "tools",
  },
  {
    name: "memory",
    description: "Manage the memory system",
    usage: "goopspec memory",
    group: "tools",
  },
  {
    name: "verify",
    description: "Verify GoopSpec installation",
    usage: "goopspec verify",
    group: "setup",
  },
  {
    name: "reset",
    description: "Reset GoopSpec configuration",
    usage: "goopspec reset",
    group: "setup",
  },
];
