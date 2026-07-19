/**
 * goop_spec tool — read, list, or validate SPEC.md and BLUEPRINT.md.
 *
 * Reads workflow-scoped documents from `.goopspec/<workflowId>/`.
 * Validation checks for required sections and traceability mapping.
 *
 * @module tools/goop-spec
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { GOOPSPEC_DIR } from "../../core/constants.js";
import { tool } from "../../core/sdk-compat.js";
import type { ToolContext, ToolDefinition } from "../../core/sdk-compat.js";
import type { PluginContext } from "../../core/types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Resolve the document directory for the active workflow. */
function resolveDocDir(ctx: PluginContext): string {
  const wfId = ctx.stateManager.getActiveWorkflowId();
  const base = join(ctx.sdk.directory, GOOPSPEC_DIR);
  return wfId === "default" ? base : join(base, wfId);
}

/** Safely read a file, returning null on any failure. */
function safeRead(filePath: string): string | null {
  try {
    if (!existsSync(filePath)) return null;
    return readFileSync(filePath, "utf-8");
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

function listWorkflowDocs(ctx: PluginContext): string {
  const goopDir = join(ctx.sdk.directory, GOOPSPEC_DIR);
  if (!existsSync(goopDir)) {
    return "No .goopspec directory found. Run `/goop-setup` first.";
  }

  const wfIds = ctx.stateManager.listWorkflowIds();
  if (wfIds.length === 0) {
    return "No workflows found.";
  }

  const activeId = ctx.stateManager.getActiveWorkflowId();
  const lines = ["# Workflow Documents\n"];

  for (const id of wfIds) {
    const dir = id === "default" ? goopDir : join(goopDir, id);
    const hasSpec = existsSync(join(dir, "SPEC.md"));
    const hasPlan = existsSync(join(dir, "BLUEPRINT.md"));
    const marker = id === activeId ? " ← active" : "";
    lines.push(
      `- **${id}**${marker}: ${hasSpec ? "SPEC.md" : ""}${hasSpec && hasPlan ? " · " : ""}${hasPlan ? "BLUEPRINT.md" : ""}${!hasSpec && !hasPlan ? "(no docs)" : ""}`,
    );
  }

  return lines.join("\n");
}

function readDocs(ctx: PluginContext, file: string): string {
  const docDir = resolveDocDir(ctx);
  const output: string[] = [];

  if (file === "spec" || file === "both") {
    const content = safeRead(join(docDir, "SPEC.md"));
    if (content) {
      output.push("# SPEC.md\n");
      output.push(content);
    } else {
      output.push("SPEC.md not found for the active workflow.");
    }
  }

  if (file === "plan" || file === "both") {
    const content = safeRead(join(docDir, "BLUEPRINT.md"));
    if (content) {
      if (output.length > 0) output.push("\n---\n");
      output.push("# BLUEPRINT.md\n");
      output.push(content);
    } else {
      output.push("BLUEPRINT.md not found for the active workflow.");
    }
  }

  return output.join("\n");
}

/** Required sections for SPEC.md validation. */
const SPEC_REQUIRED_SECTIONS = ["Must-Haves", "Out of Scope", "Acceptance Criteria"] as const;

/** Required sections for the blueprint's narrower non-wave shape. */
const BLUEPRINT_REQUIRED_SECTIONS = ["Overview", "Risk Assessment", "Deviation Protocol"] as const;

function validateDocs(ctx: PluginContext): string {
  const docDir = resolveDocDir(ctx);
  const workflowId = ctx.stateManager.getActiveWorkflowId();
  const issues: string[] = [];
  const lines = [`# Validation — ${workflowId}\n`];

  // --- SPEC.md ---
  const specContent = safeRead(join(docDir, "SPEC.md"));
  lines.push("## SPEC.md\n");
  if (specContent) {
    for (const section of SPEC_REQUIRED_SECTIONS) {
      if (!specContent.includes(section)) {
        issues.push(`SPEC.md: Missing required section "${section}"`);
      }
    }
    const hasMustHaves = /^###?\s+MH\d+/m.test(specContent);
    if (!hasMustHaves) {
      issues.push("SPEC.md: No must-have items found (expected MH1, MH2, …)");
    }
    lines.push(`- Found: ${specContent.length} chars`);
    lines.push(`- Must-have items: ${hasMustHaves ? "Yes" : "No"}`);
  } else {
    issues.push("SPEC.md not found");
    lines.push("- **NOT FOUND**");
  }

  // --- BLUEPRINT.md (non-wave planning narrative) ---
  const planContent = safeRead(join(docDir, "BLUEPRINT.md"));
  lines.push("\n## BLUEPRINT.md\n");
  if (planContent) {
    for (const section of BLUEPRINT_REQUIRED_SECTIONS) {
      if (!planContent.includes(section)) {
        issues.push(`BLUEPRINT.md: Missing required section "${section}"`);
      }
    }
    lines.push(`- Found: ${planContent.length} chars`);
    lines.push(
      `- Non-wave shape: ${issues.some((i) => i.startsWith("BLUEPRINT.md:")) ? "No" : "Yes"}`,
    );
  } else {
    issues.push("BLUEPRINT.md not found");
    lines.push("- **NOT FOUND**");
  }

  // --- Wave plan existence (substantive Spec gate) ---
  const waveRows = ctx.db.getWaves(workflowId);
  lines.push("\n## Wave Plan\n");
  if (waveRows.length === 0) {
    issues.push("No waves found. Use goop_write_wave to create a locked, traceable plan.");
    lines.push("- Waves: 0");
    lines.push("- Plan present: No");
  } else {
    lines.push(`- Waves: ${waveRows.length}`);
    lines.push("- Plan present: Yes");
  }

  // --- Summary ---
  lines.push("\n## Result\n");
  if (issues.length === 0) {
    lines.push("**VALID** — No issues found.");
  } else {
    lines.push("**ISSUES FOUND:**\n");
    for (const issue of issues) {
      lines.push(`- ${issue}`);
    }
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Tool factory
// ---------------------------------------------------------------------------

export function createGoopSpecTool(ctx: PluginContext): ToolDefinition {
  return tool({
    description: "Read, list, or validate SPEC.md and BLUEPRINT.md files.",
    args: {
      action: tool.schema.enum(["read", "list", "validate"]),
      file: tool.schema.enum(["spec", "plan", "both"]).optional(),
      phase: tool.schema.string().optional(),
    },
    async execute(
      args: {
        action: "read" | "list" | "validate";
        file?: "spec" | "plan" | "both";
        phase?: string;
      },
      _context: ToolContext,
    ): Promise<string> {
      try {
        switch (args.action) {
          case "list":
            return listWorkflowDocs(ctx);

          case "read":
            return readDocs(ctx, args.file ?? "both");

          case "validate":
            return validateDocs(ctx);

          default:
            return "Unknown action. Use: read, list, or validate.";
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return `Error in goop_spec: ${msg}`;
      }
    },
  });
}
