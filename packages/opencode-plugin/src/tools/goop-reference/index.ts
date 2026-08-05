/**
 * goop_reference — Load reference documents and templates.
 *
 * Supports single-name, multi-name (MH10), listing, type filtering,
 * and section extraction. Multi-reference loading reduces tool-call
 * count by returning multiple documents in one response.
 */

import { RESOURCE_TYPES } from "../../core/constants.js";
import type { ResourceType } from "../../core/constants.js";
import { tool } from "../../core/sdk-compat.js";
import type { ToolDefinition } from "../../core/sdk-compat.js";
import type { PluginContext, ResolvedResource } from "../../core/types.js";

/**
 * Extract a named section (## heading) from markdown content.
 *
 * Returns the section body (including the heading line) or `null` if
 * the heading is not found. Matching is case-insensitive.
 */
function extractSection(content: string, sectionName: string): string | null {
  const lines = content.split("\n");
  const target = sectionName.toLowerCase();
  let startIdx = -1;
  let startLevel = 0;

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^(#{1,6})\s+(.+)/);
    if (!match) continue;

    const level = match[1].length;
    const heading = match[2].trim().toLowerCase();

    if (startIdx === -1) {
      if (heading === target) {
        startIdx = i;
        startLevel = level;
      }
    } else if (level <= startLevel) {
      return lines.slice(startIdx, i).join("\n").trimEnd();
    }
  }

  if (startIdx !== -1) {
    return lines.slice(startIdx).join("\n").trimEnd();
  }

  return null;
}

/**
 * Format a single resolved resource for output.
 */
function formatResource(resource: ResolvedResource, section?: string): string {
  const header = `## Reference: ${resource.name}`;
  const typeTag = `**Type:** ${resource.type}`;

  if (section) {
    const extracted = extractSection(resource.content, section);
    if (extracted) {
      return `${header}\n${typeTag}\n\n${extracted}`;
    }
    return `${header}\n${typeTag}\n\n> Section "${section}" not found in ${resource.name}. Returning full content.\n\n${resource.content}`;
  }

  return `${header}\n${typeTag}\n\n${resource.content}`;
}

export function createGoopReferenceTool(ctx: PluginContext): ToolDefinition {
  return tool({
    description:
      "Load bundled reference documents or templates from disk. WHEN TO USE: To read a reference (e.g. core-protocol, tool-reference) or template, or list what is available. WHEN NOT TO USE: goop_read_db for workflow documents; goop_search_docs to search stored docs. MODES: single = name; multi = names[] (loads each, lists any not-found); list = list:true (optionally filtered by type). RETURNS: Rendered markdown per resource, or an inventory. CAVEATS: section extracts one heading and needs an EXACT, case-insensitive match of the full heading text (not a substring or prefix); a miss returns the whole resource with a 'not found' note, not an error. type defaults to 'reference' with template fallback.",
    args: {
      name: tool.schema
        .string()
        .optional()
        .describe("Single resource name; omit when using names[] or list."),
      names: tool.schema
        .array(tool.schema.string())
        .optional()
        .describe("Multiple resource names for a multi-load; takes precedence over name."),
      type: tool.schema
        .enum(RESOURCE_TYPES)
        .optional()
        .describe("Filter by type: 'reference' or 'template'; defaults to reference with template fallback."),
      list: tool.schema
        .boolean()
        .optional()
        .describe("List available resource names instead of loading; combine with type to filter."),
      section: tool.schema
        .string()
        .optional()
        .describe("Heading text to extract; must match the full heading exactly, case-insensitively."),
    },
    async execute(args): Promise<string> {
      try {
        const resolver = ctx.resolver;

        // --- List mode ---
        if (args.list) {
          const resourceType: ResourceType | undefined = args.type;
          if (resourceType) {
            const names = resolver.listNames(resourceType);
            if (names.length === 0) {
              return `No ${resourceType}s found.`;
            }
            return `## Available ${resourceType}s\n\n${names.map((n) => `- ${n}`).join("\n")}`;
          }

          // List all types
          const sections: string[] = [];
          for (const rt of RESOURCE_TYPES) {
            const names = resolver.listNames(rt);
            if (names.length > 0) {
              sections.push(`## Available ${rt}s\n\n${names.map((n) => `- ${n}`).join("\n")}`);
            }
          }
          return sections.length > 0
            ? sections.join("\n\n---\n\n")
            : "No references or templates found.";
        }

        // --- Multi-load mode (MH10) ---
        if (args.names && args.names.length > 0) {
          const resolved = resolver.resolveMany(args.names);
          const resolvedNames = new Set(resolved.map((r) => r.name));
          const notFound = args.names.filter((n) => !resolvedNames.has(n));

          const parts: string[] = [];

          for (const resource of resolved) {
            parts.push(formatResource(resource, args.section));
          }

          if (notFound.length > 0) {
            parts.push(
              `## Not Found\n\nThe following references were not found: ${notFound.map((n) => `\`${n}\``).join(", ")}`,
            );
          }

          if (parts.length === 0) {
            return `No references found for: ${args.names.map((n) => `\`${n}\``).join(", ")}`;
          }

          return parts.join("\n\n---\n\n");
        }

        // --- Single-load mode ---
        if (args.name) {
          const resourceType: ResourceType = args.type ?? "reference";
          const resource = resolver.resolve(resourceType, args.name);

          if (!resource) {
            // Try the other type as fallback
            const fallbackType: ResourceType =
              resourceType === "reference" ? "template" : "reference";
            const fallback = resolver.resolve(fallbackType, args.name);
            if (fallback) {
              return formatResource(fallback, args.section);
            }
            return `Reference "${args.name}" not found. Use \`list: true\` to see available references.`;
          }

          return formatResource(resource, args.section);
        }

        // --- No arguments: show help ---
        return [
          "## goop_reference",
          "",
          "Load reference documents or templates.",
          "",
          "**Usage:**",
          '- `name: "executor-core"` — Load a single reference',
          '- `names: ["executor-core", "git-workflow"]` — Load multiple references (MH10)',
          "- `list: true` — List available references",
          '- `type: "template"` — Filter by type',
          '- `section: "Commit Format"` — Extract a specific section',
        ].join("\n");
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return `Error loading reference: ${message}`;
      }
    },
  });
}
