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
  replacement?: string;
  replacementOffsets?: {
    start: number;
    end: number;
  };
}

type AstGrepResult = AstGrepMatch[];

// ---------------------------------------------------------------------------
// Result formatting
// ---------------------------------------------------------------------------

function formatMatches(matches: AstGrepMatch[], mode: "search" | "rewrite" = "search"): string {
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
  const verb = mode === "rewrite" ? "rewrite" : "match";
  lines.push(`Found ${matches.length} ${verb}${matches.length === 1 ? "" : "es"}:`);
  lines.push("");

  for (const [file, fileMatches] of byFile) {
    lines.push(`## ${file}`);
    for (const match of fileMatches) {
      const { start, end } = match.range;
      lines.push(`- [${start.line}:${start.column} -> ${end.line}:${end.column}] ${match.text}`);
      if (match.replacement !== undefined) {
        lines.push(`  replacement: ${match.replacement}`);
      }
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

function countModifiedFiles(matches: AstGrepMatch[]): number {
  return new Set(matches.map((m) => m.file)).size;
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
      "Structural code search and rewrite via the external ast-grep CLI. " +
      "WHEN TO USE: Find or refactor code by AST pattern where line-level regex is unreliable — renaming, restructuring, or bulk edits across files. " +
      "WHEN NOT TO USE: difftastic for a structural diff between two files; scip for semantic symbol references and definitions; grep for literal text search. " +
      "MODES: search — send pattern + language, omit rewrite; returns matches. rewrite dry-run — add rewrite, omit apply; previews replacements and modifies nothing. rewrite apply — add rewrite AND apply:true; rewrites files in place (-U). apply:true without rewrite is ignored: -U is only added when rewrite is present, so apply alone cannot turn a search into a mutation. " +
      "RETURNS: Matches grouped by file, or a dry-run preview plus the exact apply call to issue next, or a count of files modified. " +
      "CAVEATS: Resolves the ast-grep binary via PATH or binaryPaths.ast-grep in goopspec.json; a missing binary returns an install-hint string (not a throw), distinguishable from a real 'No matches found.' result. paths defaults to ['.']. language takes precedence over the lang alias when both are supplied.",
    args: {
      pattern: tool.schema
        .string()
        .describe("ast-grep pattern to search for. Required in every mode."),
      language: tool.schema.string().describe(
        "Target language identifier for ast-grep (e.g. ts, js, python, rust). " +
          "Takes precedence over the lang alias when both are supplied.",
      ),
      lang: tool.schema
        .string()
        .optional()
        .describe(
          "Optional alias for language; used only when language is absent. " +
            "Prefer language for clarity.",
        ),
      paths: tool.schema
        .array(
          tool.schema.string().describe("A single search path, relative to the project directory."),
        )
        .optional()
        .describe(
          "Paths to search, relative to the project directory. Omit to default to ['.'] " +
            "(the current project directory).",
        ),
      rewrite: tool.schema.string().optional().describe(
        "Replacement string that activates rewrite mode (ast-grep -r). " +
          "Omit for search mode; do not pass an empty string.",
      ),
      apply: tool.schema.boolean().optional().describe(
        "Set to true alongside rewrite to apply the rewrite in place (ast-grep -U). " +
          "Defaults to false (dry-run). Has no effect unless rewrite is also supplied.",
      ),
    },
    async execute(
      args: {
        pattern: string;
        language?: string;
        lang?: string;
        paths?: string[];
        rewrite?: string;
        apply?: boolean;
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
        const rewriteMode = args.rewrite !== undefined;
        const apply = args.apply ?? false;
        const commandArgs = rewriteMode
          ? [
              binaryPath,
              "run",
              "-p",
              args.pattern,
              "-l",
              language,
              "-r",
              args.rewrite,
              ...(apply ? ["-U"] : []),
              "--json=compact",
              ...paths,
            ]
          : [binaryPath, "run", "-p", args.pattern, "-l", language, "--json=compact", ...paths];
        const filteredCommandArgs = commandArgs.filter((arg): arg is string => arg !== undefined);

        const result = await executeCommand(filteredCommandArgs, ctx.sdk.directory);

        if (result.exitCode === 1) {
          return result.stdout.trim()
            ? formatMatches(safeParseMatches(result.stdout), rewriteMode ? "rewrite" : "search")
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

        const matches = safeParseMatches(result.stdout);
        if (rewriteMode && !apply) {
          const preview = formatMatches(matches, "rewrite");
          return `${preview}\n\nNo files were modified (dry-run). Pass \`apply: true\` to apply this rewrite in-place.`.trimStart();
        }

        if (rewriteMode && apply) {
          const modifiedCount = countModifiedFiles(matches);
          const preview = formatMatches(matches, "rewrite");
          return (
            `${preview}\n\n` +
            `Rewrite applied. Modified ${modifiedCount} file${modifiedCount === 1 ? "" : "s"}.`
          ).trimStart();
        }

        return formatMatches(matches, "search");
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
