import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import {
  parseAgentMarkdown,
  parseCommandMarkdown,
  type LoadedAgent,
  type LoadedCommand,
} from "./index.js";

export const AGENTS_DIR = join(import.meta.dirname, "../../../agents");
export const COMMANDS_DIR = join(import.meta.dirname, "../../../commands");

export interface RealAgentPrompt {
  file: string;
  path: string;
  raw: string;
  parsed: LoadedAgent | null;
}

export interface RealCommandPrompt {
  file: string;
  path: string;
  raw: string;
  parsed: LoadedCommand | null;
}

function markdownFiles(directory: string): string[] {
  return readdirSync(directory)
    .filter((file) => file.endsWith(".md"))
    .sort();
}

export function loadRealAgents(): RealAgentPrompt[] {
  return markdownFiles(AGENTS_DIR).map((file) => {
    const path = join(AGENTS_DIR, file);
    const raw = readFileSync(path, "utf8");
    return { file, path, raw, parsed: parseAgentMarkdown(raw) };
  });
}

export function loadRealCommands(): RealCommandPrompt[] {
  return markdownFiles(COMMANDS_DIR).map((file) => {
    const path = join(COMMANDS_DIR, file);
    const raw = readFileSync(path, "utf8");
    return { file, path, raw, parsed: parseCommandMarkdown(raw) };
  });
}
