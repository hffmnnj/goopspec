/**
 * Central sidecar renderer for workflow documents, active root copies, and status.
 */

import { existsSync, mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import type { PluginContext, WorkflowState } from "../core/types.js";
import { DOC_TYPES, type DocType } from "../features/db/types.js";
import { formatStatus } from "../tools/goop-status/index.js";
import { logError } from "./logger.js";
import { getGoopspecRootFilePath, getWorkflowDocPath } from "./paths.js";

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
  const content = formatStatus(activeId, activeWf, allWorkflowIds, ctx.sdk.directory);
  safeWriteFile(statusPath, content);
}

export function renderSidecars(
  ctx: PluginContext,
  workflowId: string,
  opts?: { status?: boolean },
): void {
  try {
    const documents = collectRenderableDocuments(ctx, workflowId);
    renderWorkflowDocuments(ctx, workflowId, documents);

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
