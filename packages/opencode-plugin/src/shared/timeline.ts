import type { PluginContext } from "../core/types.js";
import type {
  ChronicleEventRow,
  DecisionRow,
  EventRow,
  VerificationRow,
} from "../features/db/types.js";
import { logError } from "./logger.js";

export const DEFAULT_TIMELINE_LIMIT = 50;

export type TimelineKind = "event" | "chronicle" | "decision" | "verification";

export interface TimelineItem {
  created_at: number;
  kind: TimelineKind;
  summary: string;
}

function normaliseLimit(limit?: number): number {
  if (limit === undefined || !Number.isFinite(limit)) return DEFAULT_TIMELINE_LIMIT;
  return Math.max(0, Math.floor(limit));
}

function firstLine(value: string): string {
  return value.split(/\r?\n/, 1)[0].trim();
}

function shortPayloadHint(payload: string): string {
  try {
    const parsed = JSON.parse(payload) as unknown;
    if (parsed === null || typeof parsed !== "object") return String(parsed).slice(0, 80);

    const entries = Object.entries(parsed as Record<string, unknown>);
    if (entries.length === 0) return "";

    const [key, value] = entries[0];
    const rendered = typeof value === "string" ? value : JSON.stringify(value);
    return `${key}=${rendered ?? "null"}`.slice(0, 80);
  } catch {
    return payload.slice(0, 80);
  }
}

function summariseEvent(row: EventRow): string {
  const hint = shortPayloadHint(row.payload);
  return hint.length > 0 ? `${row.event_type} (${hint})` : row.event_type;
}

function summariseChronicle(row: ChronicleEventRow): string {
  return firstLine(row.entry);
}

function summariseDecision(row: DecisionRow): string {
  return `[${row.type}] ${row.description}`;
}

function summariseVerification(row: VerificationRow): string {
  return `${row.check_name}: ${row.status}`;
}

export function buildTimeline(
  ctx: PluginContext,
  workflowId: string,
  limit?: number,
): TimelineItem[] {
  try {
    const items: TimelineItem[] = [
      ...ctx.db.getEvents(workflowId).map((row) => ({
        created_at: row.created_at,
        kind: "event" as const,
        summary: summariseEvent(row),
      })),
      ...ctx.db.getChronicleEvents(workflowId).map((row) => ({
        created_at: row.created_at,
        kind: "chronicle" as const,
        summary: summariseChronicle(row),
      })),
      ...ctx.db.getDecisions({ workflowId }).map((row) => ({
        created_at: row.created_at,
        kind: "decision" as const,
        summary: summariseDecision(row),
      })),
      ...ctx.db.getVerifications(workflowId).map((row) => ({
        created_at: row.created_at,
        kind: "verification" as const,
        summary: summariseVerification(row),
      })),
    ];

    const capped = items
      .sort((a, b) => {
        if (a.created_at !== b.created_at) return b.created_at - a.created_at;
        return b.kind.localeCompare(a.kind);
      })
      .slice(0, normaliseLimit(limit));

    return capped.sort((a, b) => {
      if (a.created_at !== b.created_at) return a.created_at - b.created_at;
      return a.kind.localeCompare(b.kind);
    });
  } catch (error: unknown) {
    logError(`Failed to build timeline for workflow '${workflowId}'`, error);
    return [];
  }
}

export function formatTimelineMarkdown(items: TimelineItem[]): string {
  const lines = ["# Timeline", ""];

  for (const item of items) {
    const iso = new Date(item.created_at * 1000).toISOString();
    lines.push(`- ${iso} [${item.kind}] ${item.summary}`);
  }

  return lines.join("\n");
}
