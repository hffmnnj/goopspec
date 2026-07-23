import { tool } from "../../core/sdk-compat.js";
import type { ToolContext, ToolDefinition } from "../../core/sdk-compat.js";
import type { PluginContext } from "../../core/types.js";
import { loadMergedConfig } from "../../features/setup/index.js";
import { resolveBinary } from "../../shared/binary-resolver.js";
import { installHint } from "../../shared/install-hints.js";
import { logError } from "../../shared/logger.js";
import { executeCommand } from "../../shared/subprocess.js";

// ---------------------------------------------------------------------------
// difftastic JSON output types
// ---------------------------------------------------------------------------

interface DifftasticChange {
  start: number;
  end: number;
  content: string;
  highlight: string;
}

interface DifftasticSide {
  line_number: number;
  changes: DifftasticChange[];
}

interface DifftasticLine {
  lhs?: DifftasticSide;
  rhs?: DifftasticSide;
}

type DifftasticChunk = DifftasticLine[];

interface DifftasticFile {
  language: string;
  path: string;
  status: string;
  chunks?: DifftasticChunk[];
}

// ---------------------------------------------------------------------------
// Result formatting
// ---------------------------------------------------------------------------

function formatChange(side: DifftasticSide | undefined): string {
  if (!side) {
    return "";
  }

  return side.changes.map((change) => change.content).join(" ");
}

function formatLine(line: DifftasticLine): string {
  const oldNumber = line.lhs?.line_number ?? "-";
  const newNumber = line.rhs?.line_number ?? "-";
  const oldText = formatChange(line.lhs);
  const newText = formatChange(line.rhs);

  if (oldText && newText) {
    return `  ${oldNumber}:${newNumber}  \`${oldText}\` → \`${newText}\``;
  }

  if (oldText) {
    return `  ${oldNumber}:${newNumber}  removed \`${oldText}\``;
  }

  if (newText) {
    return `  ${oldNumber}:${newNumber}  added \`${newText}\``;
  }

  return `  ${oldNumber}:${newNumber}  (structural change)`;
}

function formatDiff(file: DifftasticFile): string {
  const lines: string[] = [];
  lines.push(`Language: ${file.language ?? "unknown"}`);
  lines.push(`Path: ${file.path ?? "unknown"}`);
  lines.push(`Status: ${file.status ?? "unknown"}`);

  const chunks = file.chunks ?? [];
  if (chunks.length === 0) {
    lines.push("No structural change chunks.");
    return lines.join("\n");
  }

  lines.push(`Chunks: ${chunks.length}`);

  for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
    const chunk = chunks[chunkIndex];
    if (!chunk || chunk.length === 0) {
      continue;
    }

    lines.push(`\nChunk ${chunkIndex + 1}:`);
    for (const line of chunk) {
      lines.push(formatLine(line));
    }
  }

  return lines.join("\n");
}

function safeParseFile(stdout: string): DifftasticFile | undefined {
  const trimmed = stdout.trim();
  if (!trimmed) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(trimmed) as DifftasticFile | DifftasticFile[];
    const file = Array.isArray(parsed) ? parsed[0] : parsed;
    return file && typeof file === "object" ? file : undefined;
  } catch (error: unknown) {
    logError("Failed to parse difftastic JSON output", error);
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Tool factory
// ---------------------------------------------------------------------------

export function createDifftasticTool(ctx: PluginContext): ToolDefinition {
  return tool({
    description:
      "Structural (AST-aware) diff between two files using difftastic. " +
      "Reports a `meaningfully_changed` boolean derived from difftastic's exit code.",
    args: {
      old: tool.schema.string().optional().describe("Original file path (alias for oldPath)"),
      oldPath: tool.schema.string().optional().describe("Original file path"),
      new: tool.schema.string().optional().describe("Changed file path (alias for newPath)"),
      newPath: tool.schema.string().optional().describe("Changed file path"),
      checkOnly: tool.schema
        .boolean()
        .optional()
        .default(false)
        .describe("Fast boolean-only check; skips full diff output"),
    },
    async execute(
      args: {
        old?: string;
        oldPath?: string;
        new?: string;
        newPath?: string;
        checkOnly?: boolean;
      },
      _context: ToolContext,
    ): Promise<string> {
      try {
        const oldPath = args.old ?? args.oldPath;
        const newPath = args.new ?? args.newPath;

        if (!oldPath) {
          return "An original file path is required. Provide `old` or `oldPath`.";
        }

        if (!newPath) {
          return "A changed file path is required. Provide `new` or `newPath`.";
        }

        const configured = loadMergedConfig(ctx.sdk.directory).binaryPaths?.difft;
        const resolved = await resolveBinary("difft", {
          projectDir: ctx.sdk.directory,
          configuredPath: configured,
        });

        if (!("path" in resolved)) {
          return installHint("difft");
        }

        const binaryPath = resolved.path;
        const checkOnly = args.checkOnly ?? false;

        if (checkOnly) {
          const result = await executeCommand(
            [binaryPath, "--check-only", "--exit-code", oldPath, newPath],
            ctx.sdk.directory,
          );

          if (result.exitCode === -1 || result.exitCode === 2) {
            return `difftastic failed (exit ${result.exitCode}):${result.stderr ? `\n\n${result.stderr}` : ""}`;
          }

          const changed = result.exitCode === 1;
          return `meaningfully_changed: ${changed}\n${changed ? "Structural/syntactic changes detected." : "No meaningful structural changes."}`;
        }

        const result = await executeCommand(
          [binaryPath, "--display", "json", "--exit-code", oldPath, newPath],
          ctx.sdk.directory,
        );

        if (result.exitCode === -1 || result.exitCode === 2) {
          return `difftastic failed (exit ${result.exitCode}):${result.stderr ? `\n\n${result.stderr}` : ""}`;
        }

        const changed = result.exitCode === 1;
        const file = safeParseFile(result.stdout);
        const summary = file ? formatDiff(file) : "No parseable structural diff output.";

        return `meaningfully_changed: ${changed}\n\n${summary}`;
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        logError("difftastic tool failed", error);
        return `difftastic error: ${msg}`;
      }
    },
  });
}
