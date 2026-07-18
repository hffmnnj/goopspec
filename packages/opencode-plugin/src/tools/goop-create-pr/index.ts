/**
 * goop_create_pr — MCP tool that gates PR creation through the GoopSpec
 * terminology sanitizer before calling `gh pr create`.
 *
 * Scans the PR title, body, and branch name for GoopSpec-internal terms.
 * If any error-severity violations are found, the PR is blocked and a
 * detailed violation report is returned. Warnings are logged but do not
 * block creation.
 *
 * @module tools/goop-create-pr
 */

import { tool } from "../../core/sdk-compat.js";
import type { ToolContext, ToolDefinition } from "../../core/sdk-compat.js";
import type { PluginContext } from "../../core/types.js";
import { scanForViolations } from "../../features/pr-sanitizer/index.js";
import type { Violation } from "../../features/pr-sanitizer/index.js";
import { log, logError } from "../../shared/logger.js";

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function formatViolation(v: Violation): string {
  return `  Line ${v.line}, col ${v.column}: "${v.match}" → use "${v.replacement}" instead`;
}

function formatBlockedReport(errors: Violation[], warnings: Violation[]): string {
  const lines: string[] = [];

  lines.push("## PR Creation Blocked");
  lines.push("");
  lines.push("Forbidden GoopSpec terminology detected. Fix the following before creating the PR:");
  lines.push("");

  lines.push("### Errors (blocking)");
  for (const v of errors) {
    lines.push(formatViolation(v));
  }

  if (warnings.length > 0) {
    lines.push("");
    lines.push("### Warnings (non-blocking)");
    for (const w of warnings) {
      lines.push(formatViolation(w));
    }
  }

  lines.push("");
  lines.push("Fix the title, body, or branch and try again.");

  return lines.join("\n");
}

function formatWarnings(warnings: Violation[]): string {
  const lines: string[] = [];
  lines.push("Terminology warnings (non-blocking):");
  for (const w of warnings) {
    lines.push(formatViolation(w));
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Tool factory
// ---------------------------------------------------------------------------

export function createGoopCreatePrTool(ctx: PluginContext): ToolDefinition {
  return tool({
    description:
      "Create a GitHub PR with a mandatory GoopSpec terminology gate. " +
      "Scans title, body, and branch for internal terms; blocks on violations.",
    args: {
      title: tool.schema.string().describe("PR title"),
      body: tool.schema.string().describe("PR body/description"),
      branch: tool.schema.string().describe("Source branch (head)"),
      base: tool.schema.string().optional().describe("Target branch (default: main)"),
      draft: tool.schema.boolean().optional().describe("Create as draft PR"),
    },
    async execute(
      args: {
        title: string;
        body: string;
        branch: string;
        base?: string;
        draft?: boolean;
      },
      _context: ToolContext,
    ): Promise<string> {
      try {
        const base = args.base ?? "main";
        const draft = args.draft ?? false;

        // 1. Combine content for scanning
        const contentToScan = `${args.title}\n${args.body}\n${args.branch}`;

        // 2. Scan for violations
        const violations = scanForViolations(contentToScan);
        const errors = violations.filter((v) => v.severity === "error");
        const warnings = violations.filter((v) => v.severity === "warn");

        // 3. Block on error-severity violations
        if (errors.length > 0) {
          log("PR blocked due to terminology violations", { errors });
          return formatBlockedReport(errors, warnings);
        }

        // 4. Log warnings (non-blocking)
        if (warnings.length > 0) {
          log("PR terminology warnings (proceeding)", { warnings });
        }

        // 5. Build gh command args
        const ghArgs = [
          "gh",
          "pr",
          "create",
          "--base",
          base,
          "--head",
          args.branch,
          "--title",
          args.title,
          "--body",
          args.body,
          ...(draft ? ["--draft"] : []),
        ];

        log("Running gh pr create", { ghArgs });

        // 6. Execute via Bun.spawn
        const proc = Bun.spawn(ghArgs, {
          cwd: ctx.sdk.directory,
          stdout: "pipe",
          stderr: "pipe",
        });

        const [stdout, stderr] = await Promise.all([
          new Response(proc.stdout).text(),
          new Response(proc.stderr).text(),
        ]);

        const exitCode = await proc.exited;

        if (exitCode !== 0) {
          logError("gh pr create failed", { exitCode, stderr: stderr.trim() });

          const result: string[] = [];
          result.push("## PR Creation Failed");
          result.push("");
          result.push(`\`gh pr create\` exited with code ${exitCode}.`);
          if (stderr.trim()) {
            result.push("");
            result.push("```");
            result.push(stderr.trim());
            result.push("```");
          }
          return result.join("\n");
        }

        // 7. Parse PR URL from stdout
        const prUrl = stdout
          .trim()
          .split("\n")
          .find((line) => line.startsWith("https://github.com/"));

        const resultLines: string[] = [];
        resultLines.push("## PR Created");
        resultLines.push("");

        if (prUrl) {
          resultLines.push(`**URL:** ${prUrl}`);
        } else {
          resultLines.push("PR created successfully.");
          if (stdout.trim()) {
            resultLines.push("");
            resultLines.push("```");
            resultLines.push(stdout.trim());
            resultLines.push("```");
          }
        }

        if (warnings.length > 0) {
          resultLines.push("");
          resultLines.push(formatWarnings(warnings));
        }

        return resultLines.join("\n");
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        logError("goop_create_pr failed", error);
        return `## PR Creation Error\n\n**Error:** ${msg}\n\nEnsure \`gh\` CLI is installed and authenticated.`;
      }
    },
  });
}
