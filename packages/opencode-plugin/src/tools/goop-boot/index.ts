import { MEMORY_TYPES } from "../../core/constants.js";
import { tool } from "../../core/sdk-compat.js";
import type { ToolContext, ToolDefinition } from "../../core/sdk-compat.js";
import type { MemorySearchResult, PluginContext, ResolvedResource } from "../../core/types.js";
import { DOC_TYPES } from "../../features/db/types.js";
import type { DocType, FieldNoteRow } from "../../features/db/types.js";

function formatNote(note: FieldNoteRow, full: boolean): string {
  let tags: string;
  try {
    tags = (JSON.parse(note.tags) as string[]).join(", ");
  } catch {
    tags = note.tags;
  }

  const body = full || note.body.length <= 200 ? note.body : `${note.body.slice(0, 200)}...`;
  return `### ${note.id} — ${note.title}\n**Tags:** ${tags} | **Importance:** ${note.importance}/10 | **Agent:** ${note.source_agent}\n${body}`;
}

function formatMemory(result: MemorySearchResult, index: number): string {
  const { memory, score, matchType } = result;
  const lines = [
    `### [${index + 1}] ${memory.title}`,
    `**Type:** ${memory.type} | **Score:** ${score.toFixed(2)} (${matchType}) | **Date:** ${new Date(memory.createdAt).toLocaleDateString()}`,
    "",
    memory.content.length > 500 ? `${memory.content.slice(0, 500)}...` : memory.content,
  ];

  if (memory.facts?.length)
    lines.push("", "**Facts:**", ...memory.facts.map((fact) => `- ${fact}`));
  if (memory.concepts?.length) lines.push("", `**Concepts:** ${memory.concepts.join(", ")}`);
  if (memory.sourceFiles?.length) lines.push("", `**Files:** ${memory.sourceFiles.join(", ")}`);
  return lines.join("\n");
}

function extractSection(content: string, sectionName: string): string | null {
  const lines = content.split("\n");
  const target = sectionName.toLowerCase();
  let start = -1;
  let level = 0;

  for (let index = 0; index < lines.length; index++) {
    const match = lines[index].match(/^(#{1,6})\s+(.+)/);
    if (!match) continue;
    if (start === -1 && match[2].trim().toLowerCase() === target) {
      start = index;
      level = match[1].length;
    } else if (start !== -1 && match[1].length <= level) {
      return lines.slice(start, index).join("\n").trimEnd();
    }
  }

  return start === -1 ? null : lines.slice(start).join("\n").trimEnd();
}

function formatReference(resource: ResolvedResource, section?: string): string {
  const header = `### ${resource.name}\n**Type:** ${resource.type}`;
  if (!section) return `${header}\n\n${resource.content}`;

  const extracted = extractSection(resource.content, section);
  return extracted
    ? `${header}\n\n${extracted}`
    : `${header}\n\n> Section "${section}" not found. Returning full content.\n\n${resource.content}`;
}

export function createGoopBootTool(ctx: PluginContext): ToolDefinition {
  return tool({
    description:
      "Assemble workflow state, documents, Field Notes, memory, and references in one call. WHEN TO USE: At the start of a turn to orient on the active workflow and prime context in one round-trip. WHEN NOT TO USE: goop_read_wave for wave or task detail; goop_status for a compact status line; the granular tools when you need only one block. RETURNS: One markdown document with a section per requested block (State, Documents, Field Notes, Memory, References). CAVEATS: Every block is opt-in. Documents load ONLY when doc_types is explicitly passed — there is no default document set, so omitting it returns no documents. Wave/task context is never included; fetch it separately via goop_read_wave.",
    args: {
      workflow_id: tool.schema
        .string()
        .optional()
        .describe("Target workflow id; omit to use the active workflow."),
      doc_types: tool.schema
        .array(tool.schema.string())
        .optional()
        .describe("Document types to load (opt-in); omit to load NO documents — there is no default set."),
      include_state: tool.schema
        .boolean()
        .optional()
        .describe("Include the State block (defaults to true)."),
      note_query: tool.schema
        .string()
        .optional()
        .describe("Field Notes search query; supplies the Field Notes block when set."),
      note_tags: tool.schema
        .array(tool.schema.string())
        .optional()
        .describe("Filter the Field Notes block to notes carrying these tags."),
      note_limit: tool.schema
        .number()
        .optional()
        .describe("Max Field Notes results (default 10, clamped to 50)."),
      note_full: tool.schema
        .boolean()
        .optional()
        .describe("Return full Field Note bodies instead of 200-char snippets."),
      memory_query: tool.schema
        .string()
        .optional()
        .describe("Memory search query; supplies the Memory block when set."),
      memory_limit: tool.schema
        .number()
        .optional()
        .describe("Max memory results (default 5, clamped to 20)."),
      memory_types: tool.schema
        .array(tool.schema.enum(MEMORY_TYPES))
        .optional()
        .describe("Filter memory results by type (observation, decision, note, todo)."),
      memory_concepts: tool.schema
        .array(tool.schema.string())
        .optional()
        .describe("Filter memory results by concept tags."),
      memory_min_importance: tool.schema
        .number()
        .optional()
        .describe("Minimum importance (1-10) for memory results."),
      references: tool.schema
        .array(tool.schema.string())
        .optional()
        .describe("Reference names to load; supplies the References block."),
      reference_section: tool.schema
        .string()
        .optional()
        .describe("Heading text to extract from each loaded reference; must match exactly, case-insensitively."),
    },
    async execute(
      args: {
        workflow_id?: string;
        doc_types?: string[];
        include_state?: boolean;
        note_query?: string;
        note_tags?: string[];
        note_limit?: number;
        note_full?: boolean;
        memory_query?: string;
        memory_limit?: number;
        memory_types?: (typeof MEMORY_TYPES)[number][];
        memory_concepts?: string[];
        memory_min_importance?: number;
        references?: string[];
        reference_section?: string;
      },
      _context: ToolContext,
    ): Promise<string> {
      const workflowId = args.workflow_id ?? ctx.stateManager.getState().activeWorkflowId;
      const sections: string[] = [];

      if (args.include_state ?? true) {
        try {
          const state = ctx.stateManager.getState();
          const workflow = state.workflows[workflowId];
          sections.push(
            `## State\n\n${JSON.stringify({ activeWorkflowId: state.activeWorkflowId, workflowId, workflow }, null, 2)}`,
          );
        } catch (error: unknown) {
          sections.push(
            `## State\n\nError loading state: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }

      if (args.doc_types !== undefined) {
        const docTypes = args.doc_types;
        const invalidDocTypes = docTypes.filter(
          (docType) => !DOC_TYPES.includes(docType as DocType),
        );
        if (invalidDocTypes.length > 0) {
          sections.push(
            `## Documents\n\nUnknown doc_type(s): ${invalidDocTypes.join(", ")}. Valid types: ${DOC_TYPES.join(", ")}`,
          );
        } else {
          try {
            const documents = docTypes.map((docType) => {
              const content = ctx.db.resolveDocumentContent(workflowId, docType as DocType);
              return `### ${docType}\n\n${content ?? `_(No ${docType} document found. Use goop_write_db to create it.)_`}`;
            });
            sections.push(`## Documents\n\n${documents.join("\n\n---\n\n")}`);
          } catch (error: unknown) {
            sections.push(
              `## Documents\n\nError loading documents: ${error instanceof Error ? error.message : String(error)}`,
            );
          }
        }
      }

      if (args.note_query !== undefined || args.note_tags?.length) {
        try {
          const results = ctx.db.searchNotes(args.note_query ?? "", {
            tags: args.note_tags,
            limit: Math.min(Math.max(args.note_limit ?? 10, 1), 50),
          });
          const content = results.length
            ? results.map((note) => formatNote(note, args.note_full ?? false)).join("\n\n---\n\n")
            : `No Field Notes found matching '${args.note_query ?? ""}'.`;
          sections.push(`## Field Notes\n\n${content}`);
        } catch (error: unknown) {
          sections.push(
            `## Field Notes\n\nError searching Field Notes: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }

      if (args.memory_query !== undefined) {
        try {
          const results = await ctx.memory.search({
            query: args.memory_query,
            limit: Math.min(Math.max(args.memory_limit ?? 5, 1), 20),
            types: args.memory_types,
            concepts: args.memory_concepts,
            minImportance: args.memory_min_importance,
          });
          const content = results.length
            ? results.map(formatMemory).join("\n\n---\n\n")
            : `No memories found matching: "${args.memory_query}"`;
          sections.push(`## Memory\n\n${content}`);
        } catch (error: unknown) {
          sections.push(
            `## Memory\n\nError searching memory: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }

      if (args.references?.length) {
        try {
          const resolved = ctx.resolver.resolveMany(args.references);
          const found = new Set(resolved.map((resource) => resource.name));
          const missing = args.references.filter((name) => !found.has(name));
          const parts = resolved.map((resource) =>
            formatReference(resource, args.reference_section),
          );
          if (missing.length)
            parts.push(`### Not Found\n\n${missing.map((name) => `\`${name}\``).join(", ")}`);
          sections.push(
            `## References\n\n${parts.length ? parts.join("\n\n---\n\n") : "No requested references found."}`,
          );
        } catch (error: unknown) {
          sections.push(
            `## References\n\nError loading references: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }

      return sections.join("\n\n---\n\n");
    },
  });
}
