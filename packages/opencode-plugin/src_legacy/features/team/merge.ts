/**
 * Utilities for merging per-agent outputs into canonical files.
 *
 * @module features/team/merge
 */

import { readFile, unlink, writeFile } from "fs/promises";
import { logError } from "../../shared/logger.js";
import { extractAgentId, findAgentFiles, getCanonicalPath } from "./file-patterns.js";
import { getRegistry } from "./registry.js";
import type { AgentRegistration } from "./types.js";

export interface MergeOptions {
  basePath: string;
  outputPath?: string;
  cleanup?: boolean;
  headerTemplate?: string;
}

export interface MergeResult {
  outputPath: string;
  mergedCount: number;
  sourceFiles: string[];
  cleanedUp: boolean;
}

const DEFAULT_HEADER_TEMPLATE = "## Agent {{agentId}}\n\nTask: {{task}}";
const DEFAULT_SECTION_SEPARATOR = "\n\n---\n\n";
const DEFAULT_TASK_LABEL = "Task not available";

const normalizeId = (value: string): string => {
  return value.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
};

const findRegistration = (
  shortId: string,
  registrations: AgentRegistration[]
): AgentRegistration | undefined => {
  const normalizedShort = normalizeId(shortId);
  if (!normalizedShort) {
    return undefined;
  }

  return registrations.find(registration =>
    normalizeId(registration.id).startsWith(normalizedShort)
  );
};

const renderHeader = (
  template: string,
  agentId: string,
  taskDescription: string
): string => {
  return template
    .replace(/\{\{agentId\}\}/g, agentId)
    .replace(/\{\{task\}\}/g, taskDescription);
};

const formatSection = (header: string, content: string): string => {
  const trimmedContent = content.trim();
  if (!trimmedContent) {
    return header;
  }

  return `${header}\n\n${trimmedContent}`;
};

const safeUnlink = async (filePath: string): Promise<boolean> => {
  try {
    await unlink(filePath);
    return true;
  } catch (error) {
    logError(`Failed to delete agent output: ${filePath}`, error);
    return false;
  }
};

export async function mergeAgentOutputs(options: MergeOptions): Promise<MergeResult> {
  const canonicalBasePath = getCanonicalPath(options.basePath);
  const outputPath = options.outputPath ?? canonicalBasePath;
  const sourceFiles = findAgentFiles(canonicalBasePath).sort();

  if (sourceFiles.length === 0) {
    return {
      outputPath,
      mergedCount: 0,
      sourceFiles: [],
      cleanedUp: false,
    };
  }

  try {
    const registry = await getRegistry();
    const registrations = Object.values(registry.agents);
    const template = options.headerTemplate ?? DEFAULT_HEADER_TEMPLATE;

    const sections = await Promise.all(
      sourceFiles.map(async filePath => {
        const content = await readFile(filePath, "utf-8");
        const shortId = extractAgentId(filePath) ?? "unknown";
        const registration = findRegistration(shortId, registrations);
        const agentId = registration?.id ?? shortId;
        const taskDescription = registration?.task ?? DEFAULT_TASK_LABEL;
        const header = renderHeader(template, agentId, taskDescription);

        return formatSection(header, content);
      })
    );

    const mergedContent = sections.join(DEFAULT_SECTION_SEPARATOR).trimEnd();
    await writeFile(outputPath, mergedContent ? `${mergedContent}\n` : "", "utf-8");

    let cleanedUp = false;
    if (options.cleanup) {
      const results = await Promise.all(sourceFiles.map(filePath => safeUnlink(filePath)));
      cleanedUp = results.every(Boolean);
    }

    return {
      outputPath,
      mergedCount: sourceFiles.length,
      sourceFiles,
      cleanedUp,
    };
  } catch (error) {
    logError("Failed to merge agent outputs", error);
    return {
      outputPath,
      mergedCount: 0,
      sourceFiles,
      cleanedUp: false,
    };
  }
}
