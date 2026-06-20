/**
 * Central sidecar renderer for workflow documents, active root copies, and status.
 */

import { existsSync, mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import type { PluginContext, WorkflowState } from "../core/types.js";
import { DOC_TYPES, type BlockerRow, type DocType, type TraceabilityRow } from "../features/db/types.js";
import { formatStatus } from "../tools/goop-status/index.js";
import { logError } from "./logger.js";
import { getGoopspecRootFilePath, getWorkflowDocPath } from "./paths.js";
import { buildTimeline, formatTimelineMarkdown } from "./timeline.js";

export const DOC_TYPE_FILENAMES: Record<DocType, string> = {
  spec: "SPEC.md",
  blueprint: "BLUEPRINT.md",
  chronicle: "CHRONICLE.md",
  adl: "ADL.md",
  handoff: "HANDOFF.md",
  requirements: "REQUIREMENTS.md",
  research: "RESEARCH.md",
};

interface RenderableDocument {
  docType: DocType;
  content: string;
}

function readRenderableDocument(ctx: PluginContext, workflowId: string, docType: DocType): string | null {
  const sections = ctx.db.getSections(workflowId, docType);
  if (sections.length > 0) {
    const assembled = ctx.db.assembleDocument(workflowId, docType);
    return assembled.length > 0 ? assembled : null;
  }

  const document = ctx.db.getDocument(workflowId, docType);
  if (!document || document.content.length === 0) return null;
  return document.content;
}

function safeWriteFile(filePath: string, content: string): void {
  try {
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, content, "utf-8");
  } catch (error: unknown) {
    logError(`Failed to render sidecar: ${filePath}`, error);
  }
}

function safeUnlink(filePath: string): void {
  try {
    if (existsSync(filePath)) unlinkSync(filePath);
  } catch (error: unknown) {
    logError(`Failed to prune sidecar: ${filePath}`, error);
  }
}

function collectRenderableDocuments(ctx: PluginContext, workflowId: string): RenderableDocument[] {
  const documents: RenderableDocument[] = [];

  for (const docType of DOC_TYPES) {
    try {
      const content = readRenderableDocument(ctx, workflowId, docType);
      if (content !== null) documents.push({ docType, content });
    } catch (error: unknown) {
      logError(`Failed to read ${docType} for workflow '${workflowId}'`, error);
    }
  }

  return documents;
}

function renderWorkflowDocuments(
  ctx: PluginContext,
  workflowId: string,
  documents: RenderableDocument[],
): void {
  for (const document of documents) {
    const filename = DOC_TYPE_FILENAMES[document.docType];
    const sidecarPath = getWorkflowDocPath(ctx.sdk.directory, workflowId, filename);
    safeWriteFile(sidecarPath, document.content);
  }
}

function renderActiveCopies(ctx: PluginContext, documents: RenderableDocument[]): void {
  const renderedTypes = new Set(documents.map((document) => document.docType));

  for (const document of documents) {
    const rootPath = getGoopspecRootFilePath(
      ctx.sdk.directory,
      `ACTIVE_${document.docType.toUpperCase()}.md`,
    );
    safeWriteFile(rootPath, document.content);
  }

  for (const docType of DOC_TYPES) {
    if (renderedTypes.has(docType)) continue;
    const stalePath = getGoopspecRootFilePath(ctx.sdk.directory, `ACTIVE_${docType.toUpperCase()}.md`);
    safeUnlink(stalePath);
  }
}

function renderStatus(ctx: PluginContext, activeId: string, activeWf: WorkflowState): void {
  const statusPath = getGoopspecRootFilePath(ctx.sdk.directory, "STATUS.md");
  const allWorkflowIds = ctx.stateManager.listWorkflowIds();
  let content = formatStatus(activeId, activeWf, allWorkflowIds, ctx.sdk.directory);

  try {
    const blockers = ctx.db.getBlockers(activeId, "open");
    if (blockers.length > 0) {
      content = `${content}\n\n${formatOpenBlockers(blockers)}`;
    }
  } catch (error: unknown) {
    logError(`Failed to read open blockers for workflow '${activeId}'`, error);
  }

  safeWriteFile(statusPath, content);
}

function sanitiseStatusLine(value: string): string {
  return value.replace(/\r?\n/g, " ").trim();
}

function formatOpenBlockers(blockers: BlockerRow[]): string {
  const lines = ["### Open Blockers"];

  for (const blocker of blockers) {
    lines.push(
      `- #${blocker.id} [${blocker.severity}] ${sanitiseStatusLine(blocker.description)}`,
    );
  }

  return lines.join("\n");
}

function compareNullableNumber(a: number | null, b: number | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a - b;
}

function escapeMarkdownCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

function formatTraceabilityValue(value: number | string | null): string {
  if (value === null) return "—";
  return escapeMarkdownCell(String(value));
}

function renderTraceabilityMatrix(ctx: PluginContext, workflowId: string): void {
  try {
    const traceabilityPath = getWorkflowDocPath(ctx.sdk.directory, workflowId, "TRACEABILITY.md");
    const rows = [...ctx.db.getTraceability(workflowId)].sort(
      (a: TraceabilityRow, b: TraceabilityRow) => {
        const requirementOrder = a.requirement_key.localeCompare(b.requirement_key);
        if (requirementOrder !== 0) return requirementOrder;
        const waveOrder = compareNullableNumber(a.wave_number, b.wave_number);
        if (waveOrder !== 0) return waveOrder;
        return compareNullableNumber(a.task_index, b.task_index);
      },
    );

    if (rows.length === 0) {
      safeUnlink(traceabilityPath);
      return;
    }

    const lines = [
      "# Traceability Matrix",
      "",
      "| Requirement | Wave | Task | Status |",
      "|-------------|------|------|--------|",
      ...rows.map(
        (row) =>
          `| ${formatTraceabilityValue(row.requirement_key)} | ${formatTraceabilityValue(row.wave_number)} | ${formatTraceabilityValue(row.task_index)} | ${formatTraceabilityValue(row.status)} |`,
      ),
    ];

    safeWriteFile(traceabilityPath, lines.join("\n"));
  } catch (error: unknown) {
    logError(`Failed to render traceability for workflow '${workflowId}'`, error);
  }
}

function renderTimeline(ctx: PluginContext, workflowId: string): void {
  try {
    const timelinePath = getWorkflowDocPath(ctx.sdk.directory, workflowId, "TIMELINE.md");
    const items = buildTimeline(ctx, workflowId);

    if (items.length === 0) {
      safeUnlink(timelinePath);
      return;
    }

    safeWriteFile(timelinePath, formatTimelineMarkdown(items));
  } catch (error: unknown) {
    logError(`Failed to render timeline for workflow '${workflowId}'`, error);
  }
}

export function renderSidecars(
  ctx: PluginContext,
  workflowId: string,
  opts?: { status?: boolean },
): void {
  try {
    const documents = collectRenderableDocuments(ctx, workflowId);
    renderWorkflowDocuments(ctx, workflowId, documents);
    renderTraceabilityMatrix(ctx, workflowId);
    renderTimeline(ctx, workflowId);

    const state = ctx.stateManager.getState();
    const activeId = state.activeWorkflowId;

    if (workflowId === activeId) {
      renderActiveCopies(ctx, documents);
    }

    if (opts?.status !== false) {
      const activeWf = state.workflows[activeId];
      if (activeWf) {
        renderStatus(ctx, activeId, activeWf);
      }
    }
  } catch (error: unknown) {
    logError(`Failed to render sidecars for workflow '${workflowId}'`, error);
  }
}
