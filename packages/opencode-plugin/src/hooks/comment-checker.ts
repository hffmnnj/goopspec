/**
 * Comment Checker Hook — quality gate that flags excessive or low-value
 * comments in code written by write/edit tool calls. Appends warnings to
 * tool output; never blocks execution.
 *
 * Uses tool.execute.before to capture pending write/edit calls, then
 * tool.execute.after to analyse the content and append warnings.
 */

import type { PluginContext } from "../core/types.js";
import type { HookFactory, Hooks } from "./types.js";
import { safeHandler } from "./utils.js";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const WARN_THRESHOLD = 0.2;
const EXCESSIVE_THRESHOLD = 0.3;

const EXCLUDED_EXTENSIONS = new Set([
  ".md",
  ".json",
  ".yaml",
  ".yml",
  ".txt",
  ".toml",
  ".lock",
  ".csv",
  ".html",
  ".xml",
  ".svg",
  ".css",
]);

// ---------------------------------------------------------------------------
// Slop comment patterns — conservative heuristics
// ---------------------------------------------------------------------------

const SLOP_PATTERNS: RegExp[] = [
  // Restates the function/variable name: "// This function does X"
  /^\s*\/\/\s*This\s+(function|method|class|variable|constant|module)\s+(does|is|will|returns|handles)/i,
  // Generic filler: "// Import dependencies"
  /^\s*\/\/\s*Import\s+(dependencies|modules|packages|libraries)/i,
  // Obvious section markers: "// --- Helper functions ---"
  /^\s*\/\/\s*-{3,}\s*\w/,
  // Auto-generated boilerplate: "// TODO: implement" or "// TODO: Add proper"
  /^\s*\/\/\s*TODO:\s*(implement|add proper|fix this|handle|complete)/i,
  // Restates the obvious: "// Set the value to X"
  /^\s*\/\/\s*Set\s+the\s+\w+\s+to\b/i,
  // "// Return the result"
  /^\s*\/\/\s*Return\s+the\s+(result|value|response|data|output)/i,
  // "// Initialize variables"
  /^\s*\/\/\s*Initialize\s+(variables|state|the)/i,
  // "// Check if X"
  /^\s*\/\/\s*Check\s+if\s+/i,
  // "// Loop through X"
  /^\s*\/\/\s*Loop\s+(through|over)\s+/i,
  // "// Create a new X"
  /^\s*\/\/\s*Create\s+a?\s*new\s+/i,
];

// ---------------------------------------------------------------------------
// Comment analysis
// ---------------------------------------------------------------------------

interface CommentPatterns {
  line?: string;
  blockStart?: string;
  blockEnd?: string;
}

const COMMENT_PATTERNS: Record<string, CommentPatterns> = {
  ts: { line: "//", blockStart: "/*", blockEnd: "*/" },
  tsx: { line: "//", blockStart: "/*", blockEnd: "*/" },
  js: { line: "//", blockStart: "/*", blockEnd: "*/" },
  jsx: { line: "//", blockStart: "/*", blockEnd: "*/" },
  py: { line: "#", blockStart: '"""', blockEnd: '"""' },
  rb: { line: "#", blockStart: "=begin", blockEnd: "=end" },
  go: { line: "//", blockStart: "/*", blockEnd: "*/" },
  rs: { line: "//", blockStart: "/*", blockEnd: "*/" },
  java: { line: "//", blockStart: "/*", blockEnd: "*/" },
  sh: { line: "#" },
  bash: { line: "#" },
  scss: { line: "//", blockStart: "/*", blockEnd: "*/" },
  sql: { line: "--", blockStart: "/*", blockEnd: "*/" },
};

function getCommentPatterns(filePath: string): CommentPatterns {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  return COMMENT_PATTERNS[ext] ?? { line: "//" };
}

export interface CommentAnalysis {
  filePath: string;
  totalLines: number;
  codeLines: number;
  commentLines: number;
  blankLines: number;
  commentRatio: number;
  slopComments: string[];
  excessive: boolean;
}

export function analyzeComments(filePath: string, content: string): CommentAnalysis {
  const lines = content.split("\n");
  const patterns = getCommentPatterns(filePath);
  let codeLines = 0;
  let commentLines = 0;
  let blankLines = 0;
  let inBlockComment = false;
  const slopComments: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed === "") {
      blankLines++;
      continue;
    }

    if (patterns.blockStart && trimmed.includes(patterns.blockStart)) {
      inBlockComment = true;
    }

    if (inBlockComment) {
      commentLines++;
      if (patterns.blockEnd && trimmed.includes(patterns.blockEnd)) {
        inBlockComment = false;
      }
      continue;
    }

    if (patterns.line && trimmed.startsWith(patterns.line)) {
      commentLines++;
      // Check for slop patterns
      for (const pattern of SLOP_PATTERNS) {
        if (pattern.test(line)) {
          slopComments.push(trimmed);
          break;
        }
      }
      continue;
    }

    codeLines++;
  }

  const nonBlank = codeLines + commentLines;
  const commentRatio = nonBlank > 0 ? commentLines / nonBlank : 0;

  return {
    filePath,
    totalLines: lines.length,
    codeLines,
    commentLines,
    blankLines,
    commentRatio,
    slopComments,
    excessive: commentRatio > EXCESSIVE_THRESHOLD,
  };
}

// ---------------------------------------------------------------------------
// Pending call tracking
// ---------------------------------------------------------------------------

interface PendingCall {
  filePath: string;
  content?: string;
  timestamp: number;
}

const PENDING_TTL = 30_000;

// ---------------------------------------------------------------------------
// Hook factory
// ---------------------------------------------------------------------------

export function createCommentCheckerHook(_ctx: PluginContext): Partial<Hooks> {
  const pendingCalls = new Map<string, PendingCall>();

  // Periodic cleanup of stale pending calls
  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [callID, call] of pendingCalls) {
      if (now - call.timestamp > PENDING_TTL) {
        pendingCalls.delete(callID);
      }
    }
  }, 15_000);

  // Allow GC to collect the interval if the hook is dereferenced
  if (typeof cleanupInterval === "object" && "unref" in cleanupInterval) {
    cleanupInterval.unref();
  }

  const beforeHandler: NonNullable<Hooks["tool.execute.before"]> = safeHandler(
    "comment-checker:before",
    async (
      input: { tool: string; sessionID: string; callID: string },
      output: { args: Record<string, unknown> },
    ): Promise<void> => {
      const toolLower = input.tool.toLowerCase().replace(/^mcp_/, "");
      if (toolLower !== "write" && toolLower !== "edit") return;

      const filePath = (output.args.filePath ?? output.args.file_path ?? output.args.path) as
        | string
        | undefined;
      if (!filePath) return;

      // Skip non-code files
      const ext = `.${filePath.split(".").pop()?.toLowerCase() ?? ""}`;
      if (EXCLUDED_EXTENSIONS.has(ext)) return;

      const content = (output.args.content ?? output.args.newString) as string | undefined;

      pendingCalls.set(input.callID, {
        filePath,
        content,
        timestamp: Date.now(),
      });
    },
  );

  const afterHandler: NonNullable<Hooks["tool.execute.after"]> = safeHandler(
    "comment-checker:after",
    async (
      input: { tool: string; sessionID: string; callID: string },
      output: { title: string; output: string; metadata: unknown },
    ): Promise<void> => {
      const pending = pendingCalls.get(input.callID);
      if (!pending) return;
      pendingCalls.delete(input.callID);

      // Skip if tool execution failed
      if (output.output.toLowerCase().includes("error:")) return;

      // Only analyse full writes with content (edits are partial, less useful)
      if (!pending.content) return;

      const analysis = analyzeComments(pending.filePath, pending.content);

      // Build warning if ratio exceeds threshold or slop comments found
      const warnings: string[] = [];

      if (analysis.excessive) {
        warnings.push(
          `Comment ratio ${(analysis.commentRatio * 100).toFixed(0)}% exceeds ${(EXCESSIVE_THRESHOLD * 100).toFixed(0)}% threshold.`,
        );
      } else if (analysis.commentRatio > WARN_THRESHOLD) {
        warnings.push(
          `Comment ratio ${(analysis.commentRatio * 100).toFixed(0)}% is above ${(WARN_THRESHOLD * 100).toFixed(0)}% — consider trimming.`,
        );
      }

      if (analysis.slopComments.length > 0) {
        warnings.push(
          `Found ${analysis.slopComments.length} low-value comment(s) that restate obvious code intent.`,
        );
      }

      if (warnings.length === 0) return;

      // Append warning to output — flag, don't block
      const warningBlock = [
        "",
        "",
        "---",
        `**Comment Quality Notice** (\`${pending.filePath}\`)`,
        ...warnings.map((w) => `- ${w}`),
        "AI-generated code should be clean and self-documenting. Focus comments on *why*, not *what*.",
      ].join("\n");

      output.output += warningBlock;
    },
  );

  return {
    "tool.execute.before": beforeHandler,
    "tool.execute.after": afterHandler,
  };
}

export const commentCheckerFactory: HookFactory = createCommentCheckerHook;

// Exported for testing
export { WARN_THRESHOLD, EXCESSIVE_THRESHOLD, SLOP_PATTERNS };
