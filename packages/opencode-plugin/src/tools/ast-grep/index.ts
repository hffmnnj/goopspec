import { tool } from "../../core/sdk-compat.js";
import type { ToolContext, ToolDefinition } from "../../core/sdk-compat.js";
import type { PluginContext } from "../../core/types.js";
import { loadMergedConfig } from "../../features/setup/index.js";
import { resolveBinary } from "../../shared/binary-resolver.js";
import { installHint } from "../../shared/install-hints.js";
import { logError } from "../../shared/logger.js";
import { executeCommand } from "../../shared/subprocess.js";

// ---------------------------------------------------------------------------
// ast-grep JSON output types
// ---------------------------------------------------------------------------

interface AstGrepRange {
  byteOffset: {
    start: number;
    end: number;
  };
  start: {
    line: number;
    column: number;
  };
  end: {
    line: number;
    column: number;
  };
}

interface AstGrepMatch {
  text: string;
  range: AstGrepRange;
  file: string;
  lines: string;
  language: string;
  metaVariables?: Record<string, unknown>;
}

type AstGrepResult = AstGrepMatch[];

// ---------------------------------------------------------------------------
// Result formatting
// ---------------------------------------------------------------------------

function formatMatches(matches: AstGrepMatch[]): string {
  if (matches.length === 0) {
    return "No matches found.";
  }

  const byFile = new Map<string, AstGrepMatch[]>();
  for (const match of matches) {
    const list = byFile.get(match.file) ?? [];
    list.push(match);
    byFile.set(match.file, list);
  }

  const lines: string[] = [];
  lines.push(`Found ${matches.length} match${matches.length === 1 ? "" : "es"}:`);
  lines.push("");

  for (const [file, fileMatches] of byFile) {
    lines.push(`## ${file}`);
    for (const match of fileMatches) {
      const { start, end } = match.range;
      lines.push(`- [${start.line}:${start.column} -> ${end.line}:${end.column}] ${match.text}`);
      if (match.lines.trim()) {
        for (const sourceLine of match.lines.split("\n")) {
          lines.push(`    ${sourceLine}`);
        }
      }
    }
    lines.push("");
  }

  return lines.join("\n").trimEnd();
}

function isMissingBinaryError(stderr: string): boolean {
  const lower = stderr.toLowerCase();
  return (
    lower.includes("no such file") ||
    lower.includes("command not found") ||
    lower.includes("not found") ||
    lower.includes("cannot find") ||
    lower.includes("failed to spawn")
  );
}

// ---------------------------------------------------------------------------
// Tool factory
// ---------------------------------------------------------------------------

export function createAstGrepTool(ctx: PluginContext): ToolDefinition {
  return tool({
    description:
      "Structural code search with ast-grep. " +
      "Find matches for an AST pattern in a given language and paths.",
    args: {
      pattern: tool.schema.string().describe("ast-grep pattern to search for"),
      language: tool.schema
        .string()
        .describe("Target language identifier (e.g. ts, js, python, rust)"),
      lang: tool.schema
        .string()
        .optional()
        .describe("Alias for language; language takes precedence"),
      paths: tool.schema
        .array(tool.schema.string())
        .optional()
        .describe("Paths to search (default: current project directory)"),
    },
    async execute(
      args: {
        pattern: string;
        language?: string;
        lang?: string;
        paths?: string[];
      },
      _context: ToolContext,
    ): Promise<string> {
      try {
        const language = args.language ?? args.lang;
        if (!language) {
          return "A language is required. Provide `language` (or `lang`).";
        }

        const configured = loadMergedConfig(ctx.sdk.directory).binaryPaths?.["ast-grep"];
        const resolved = await resolveBinary("ast-grep", {
          projectDir: ctx.sdk.directory,
          configuredPath: configured,
        });

        if (!("path" in resolved)) {
          return installHint("ast-grep");
        }

        const binaryPath = resolved.path;
        const paths = args.paths ?? ["."];
        const commandArgs = [
          binaryPath,
          "run",
          "-p",
          args.pattern,
          "-l",
          language,
          "--json=compact",
          ...paths,
        ];

        const result = await executeCommand(commandArgs, ctx.sdk.directory);

        if (result.exitCode === 1) {
          return result.stdout.trim()
            ? formatMatches(safeParseMatches(result.stdout))
            : "No matches found.";
        }

        if (result.exitCode !== 0) {
          const stderr = result.stderr.trim();
          const hint =
            isMissingBinaryError(stderr) || result.exitCode === -1
              ? `\n\n${installHint("ast-grep")}`
              : "";
          return `ast-grep failed (exit ${result.exitCode}):${stderr ? `\n\n${stderr}` : ""}${hint}`;
        }

        return formatMatches(safeParseMatches(result.stdout));
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        logError("ast_grep tool failed", error);
        return `ast_grep error: ${msg}`;
      }
    },
  });
}

function safeParseMatches(stdout: string): AstGrepMatch[] {
  const trimmed = stdout.trim();
  if (!trimmed) {
    return [];
  }

  try {
    const parsed = JSON.parse(trimmed) as AstGrepResult;
    return Array.isArray(parsed) ? parsed : [];
  } catch (error: unknown) {
    logError("Failed to parse ast-grep JSON output", error);
    return [];
  }
}
