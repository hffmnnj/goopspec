import { resolve } from "node:path";

import { tool } from "../../core/sdk-compat.js";
import type { ToolContext, ToolDefinition } from "../../core/sdk-compat.js";
import type { PluginContext } from "../../core/types.js";
import { loadMergedConfig } from "../../features/setup/index.js";
import { resolveBinary } from "../../shared/binary-resolver.js";
import { installHint } from "../../shared/install-hints.js";
import { logError } from "../../shared/logger.js";
import { executeCommand } from "../../shared/subprocess.js";

const SCIP_ACTIONS = ["index", "definitions", "references", "implementations"] as const;
type ScipAction = (typeof SCIP_ACTIONS)[number];

const DEFINITION_ROLE = 0x1;

interface ScipRelationship {
  symbol: string;
  isImplementation?: boolean;
}

interface ScipSymbolInformation {
  symbol: string;
  relationships?: ScipRelationship[];
}

interface ScipOccurrence {
  range: number[];
  symbol: string;
  symbolRoles?: number;
  symbol_roles?: number;
}

interface ScipDocument {
  relativePath: string;
  occurrences?: ScipOccurrence[];
  symbols?: ScipSymbolInformation[];
}

interface ScipIndex {
  documents: ScipDocument[];
}

interface ScipLocation {
  file: string;
  range: number[];
  symbol: string;
}

/**
 * Queries scan the JSON dump linearly. This is acceptable for the single-project MVP;
 * a future implementation can replace it with a cached protobuf-backed index.
 */
export function createScipTool(ctx: PluginContext): ToolDefinition {
  return tool({
    description:
      "Query a SCIP code-intelligence index for symbol definitions, references, or implementations; or generate the index. " +
      "WHEN TO USE: Navigate code semantically — who calls a function, where a type is defined or implemented. " +
      "WHEN NOT TO USE: ast_grep for pattern-based structural search; grep for literal text. " +
      "MODES: index — generates index.scip via the scip-typescript binary; symbol and index_path are ignored. definitions/references/implementations — require symbol and query an existing index via the scip binary. " +
      "RETURNS: For index, the generated index path. For queries, a list of file:line:column locations (UTF-16 columns) or a no-results message. " +
      "CAVEATS: index resolves the scip-typescript binary; queries resolve the scip binary — each via PATH or the matching binaryPaths key (scip-typescript / scip) in goopspec.json, and a missing binary returns an install-hint string, not a throw. Query actions also require an existing index file (run index first) or they return guidance instead of spawning. index_path defaults to index.scip in the project root and is ignored by index.",
    args: {
      action: tool.schema
        .enum(SCIP_ACTIONS)
        .describe("SCIP action to perform. index generates the index; the other three query it."),
      symbol: tool.schema.string().optional().describe(
        "Exact SCIP symbol string to look up. Required for definitions, references, and " +
          "implementations; ignored by index. Omit entirely for index; do not pass an empty string.",
      ),
      index_path: tool.schema.string().optional().describe(
        "Path to the SCIP index file. Defaults to index.scip in the project root. " +
          "Used only by query actions; ignored by index.",
      ),
    },
    async execute(
      args: { action: ScipAction; symbol?: string; index_path?: string },
      _context: ToolContext,
    ): Promise<string> {
      try {
        if (args.action === "index") {
          return generateIndex(ctx);
        }

        if (!args.symbol) {
          return `A SCIP symbol is required for the ${args.action} action.`;
        }

        const indexPath = resolve(ctx.sdk.directory, args.index_path ?? "index.scip");
        if (!(await Bun.file(indexPath).exists())) {
          return noIndexGuidance(indexPath);
        }

        const configuredPath = loadMergedConfig(ctx.sdk.directory).binaryPaths?.scip;
        const resolved = await resolveBinary("scip", {
          projectDir: ctx.sdk.directory,
          configuredPath,
        });
        if (!("path" in resolved)) {
          return installHint("scip");
        }

        const result = await executeCommand(
          [resolved.path, "print", "--json", indexPath],
          ctx.sdk.directory,
        );
        if (result.exitCode !== 0) {
          const stderr = result.stderr.trim();
          return `scip print failed (exit ${result.exitCode}):${stderr ? `\n\n${stderr}` : ""}`;
        }

        const parsed = parseScipIndex(result.stdout);
        if ("error" in parsed) {
          return parsed.error;
        }

        return formatQueryResult(parsed.index, args.action, args.symbol);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        logError("scip tool failed", error);
        return `scip error: ${message}`;
      }
    },
  });
}

async function generateIndex(ctx: PluginContext): Promise<string> {
  const projectDir = ctx.sdk.directory;
  const configuredPath = loadMergedConfig(projectDir).binaryPaths?.["scip-typescript"];
  const resolved = await resolveBinary("scip-typescript", {
    projectDir,
    configuredPath,
  });
  if (!("path" in resolved)) {
    return installHint("scip-typescript");
  }

  const result = await executeCommand([resolved.path, "index"], projectDir);
  if (result.exitCode !== 0) {
    const stderr = result.stderr.trim();
    const failure = `scip-typescript index failed (exit ${result.exitCode}):${
      stderr ? `\n\n${stderr}` : ""
    }`;
    return isMissingBinaryFailure(result.exitCode, stderr)
      ? `${failure}\n\n${installHint("scip-typescript")}`
      : failure;
  }

  const indexPath = resolve(projectDir, "index.scip");
  return `Generated SCIP index at ${indexPath}.`;
}

function noIndexGuidance(indexPath: string): string {
  return [
    `No SCIP index found at ${indexPath}.`,
    "Run the SCIP tool with action `index` first (equivalent to `scip-typescript index` from the project root).",
  ].join("\n\n");
}

function isMissingBinaryFailure(exitCode: number, stderr: string): boolean {
  return exitCode === -1 || /\b(?:enoent|not found|no such file)\b/i.test(stderr);
}

function parseScipIndex(stdout: string): { index: ScipIndex } | { error: string } {
  const trimmed = stdout.trim();
  if (!trimmed) {
    return { error: "scip print returned no JSON output." };
  }

  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (!isScipIndex(parsed)) {
      return { error: "scip print returned JSON that is not a SCIP index." };
    }
    return { index: parsed };
  } catch (error: unknown) {
    logError("Failed to parse scip print JSON output", error);
    return { error: "scip print returned invalid JSON output." };
  }
}

function isScipIndex(value: unknown): value is ScipIndex {
  return (
    typeof value === "object" && value !== null && Array.isArray((value as ScipIndex).documents)
  );
}

function formatQueryResult(
  index: ScipIndex,
  action: Exclude<ScipAction, "index">,
  symbol: string,
): string {
  if (action === "implementations") {
    return formatImplementations(index, symbol);
  }

  const matches = findOccurrences(index, symbol, action === "definitions");
  const noun = action === "definitions" ? "definition" : "reference";
  if (matches.length === 0) {
    return `No ${noun}s found for SCIP symbol \`${symbol}\`.`;
  }
  return formatLocations(
    `Found ${matches.length} ${noun}${matches.length === 1 ? "" : "s"}:`,
    matches,
  );
}

function findOccurrences(
  index: ScipIndex,
  symbol: string,
  definitionsOnly: boolean,
): ScipLocation[] {
  const locations: ScipLocation[] = [];
  for (const document of index.documents) {
    for (const occurrence of document.occurrences ?? []) {
      if (occurrence.symbol !== symbol || isDefinition(occurrence) !== definitionsOnly) continue;
      locations.push({
        file: document.relativePath,
        range: occurrence.range,
        symbol: occurrence.symbol,
      });
    }
  }
  return locations;
}

function formatImplementations(index: ScipIndex, symbol: string): string {
  const implementationSymbols = new Set<string>();
  let hasImplementationRelationships = false;

  for (const document of index.documents) {
    for (const information of document.symbols ?? []) {
      for (const relationship of information.relationships ?? []) {
        if (!relationship.isImplementation) continue;
        hasImplementationRelationships = true;
        if (relationship.symbol === symbol) implementationSymbols.add(information.symbol);
      }
    }
  }

  if (!hasImplementationRelationships) {
    return "Implementation relationships are not available in this SCIP index.";
  }
  if (implementationSymbols.size === 0) {
    return `No implementations found for SCIP symbol \`${symbol}\`.`;
  }

  const locations: ScipLocation[] = [];
  for (const document of index.documents) {
    for (const occurrence of document.occurrences ?? []) {
      if (!implementationSymbols.has(occurrence.symbol) || !isDefinition(occurrence)) continue;
      locations.push({
        file: document.relativePath,
        range: occurrence.range,
        symbol: occurrence.symbol,
      });
    }
  }

  if (locations.length === 0) {
    return "Implementation relationships were found, but this index has no definition locations for them.";
  }
  return formatLocations(
    `Found ${locations.length} implementation${locations.length === 1 ? "" : "s"}:`,
    locations,
  );
}

function isDefinition(occurrence: ScipOccurrence): boolean {
  return ((occurrence.symbolRoles ?? occurrence.symbol_roles ?? 0) & DEFINITION_ROLE) !== 0;
}

function formatLocations(heading: string, locations: ScipLocation[]): string {
  const lines = [heading];
  for (const location of locations) {
    const [startLine, startColumn, endLine, endColumn] = expandRange(location.range);
    lines.push(
      `- ${location.file} [${startLine}:${startColumn} -> ${endLine}:${endColumn}] (UTF-16 columns)`,
    );
  }
  return lines.join("\n");
}

function expandRange(range: number[]): [number, number, number, number] {
  if (range.length === 3) {
    return [range[0], range[1], range[0], range[2]];
  }
  return [range[0], range[1], range[2], range[3]];
}
