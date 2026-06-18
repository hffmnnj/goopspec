/**
 * Parallel-research subsystem.
 *
 * Structures dispatch plans for concurrent researcher/explorer agents and
 * synthesizes their returned results. Pure coordination logic — no I/O,
 * no SDK calls. The orchestrator owns actual agent dispatch via task().
 */

import type { AgentRole } from "../../core/constants.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ResearchTask {
  id: string;
  topic: string;
  agent: AgentRole;
  prompt: string;
}

export interface ResearchResult {
  id: string;
  topic: string;
  status: "complete" | "blocked" | "partial";
  summary: string;
  raw: string;
}

export interface ResearchSynthesis {
  results: ResearchResult[];
  combinedSummary: string;
  blocked: ResearchResult[];
}

// ---------------------------------------------------------------------------
// Heuristic: codebase-oriented topics route to "explorer"
// ---------------------------------------------------------------------------

const EXPLORER_PATTERNS: readonly RegExp[] = [
  /\bwhere\b/i,
  /\bfind\b/i,
  /\btrace\b/i,
  /\bmap\b/i,
  /\bcodebase\b/i,
];

function isCodebaseTopic(topic: string): boolean {
  return EXPLORER_PATTERNS.some((p) => p.test(topic));
}

// ---------------------------------------------------------------------------
// planParallelResearch
// ---------------------------------------------------------------------------

/**
 * Generate a {@link ResearchTask} per topic. Default agent is `"researcher"`;
 * topics that look like codebase questions are routed to `"explorer"`.
 */
export function planParallelResearch(
  topics: ReadonlyArray<{ topic: string; agent?: AgentRole }>,
): ResearchTask[] {
  return topics.map((entry, idx) => {
    const agent: AgentRole =
      entry.agent ?? (isCodebaseTopic(entry.topic) ? "explorer" : "researcher");
    const id = `research-${idx + 1}`;

    const prompt = [
      "Research the following topic and return your findings using the standard response format.",
      "",
      `Topic: ${entry.topic}`,
      "",
      "Return your response with exactly these sections:",
      "## STATUS",
      "complete | partial | blocked",
      "## SUMMARY",
      "1-3 sentences describing findings.",
      "## ARTIFACTS",
      `Bullet list of files or resources, or "- none".`,
      "## VERIFICATION",
      "n/a (research task)",
      "## NEXT",
      "Recommended follow-up actions.",
    ].join("\n");

    return { id, topic: entry.topic, agent, prompt };
  });
}

// ---------------------------------------------------------------------------
// parseResearchResult
// ---------------------------------------------------------------------------

const SECTION_HEADER = /^## (STATUS|SUMMARY|ARTIFACTS|VERIFICATION|NEXT)\s*$/m;

/**
 * Extract STATUS and SUMMARY from a sub-agent's markdown response.
 * Graceful: never throws; missing sections fall back to safe defaults.
 */
export function parseResearchResult(id: string, topic: string, raw: string): ResearchResult {
  const sections = splitSections(raw);

  const statusRaw = (sections.STATUS ?? "").trim().toLowerCase();
  const status: ResearchResult["status"] =
    statusRaw === "blocked" ? "blocked" : statusRaw === "partial" ? "partial" : "complete";

  const summary = (sections.SUMMARY ?? "").trim() || "(no summary provided)";

  return { id, topic, status, summary, raw };
}

/**
 * Split a markdown response into named sections keyed by header name.
 */
function splitSections(text: string): Record<string, string> {
  const result: Record<string, string> = {};
  const lines = text.split("\n");

  let currentSection: string | null = null;
  const buffer: string[] = [];

  const flush = () => {
    if (currentSection !== null) {
      result[currentSection] = buffer.join("\n");
    }
    buffer.length = 0;
  };

  for (const line of lines) {
    const match = SECTION_HEADER.exec(line);
    if (match) {
      flush();
      currentSection = match[1];
    } else {
      buffer.push(line);
    }
  }
  flush();

  return result;
}

// ---------------------------------------------------------------------------
// synthesizeResearch
// ---------------------------------------------------------------------------

/**
 * Combine multiple {@link ResearchResult}s into a {@link ResearchSynthesis}.
 * Builds a bullet-list combined summary and separates blocked results.
 */
export function synthesizeResearch(results: ResearchResult[]): ResearchSynthesis {
  const blocked = results.filter((r) => r.status === "blocked");

  const lines = results.map((r) => `- [${r.topic}]: ${r.summary}`);
  const combinedSummary = lines.length > 0 ? lines.join("\n") : "(no results)";

  return { results, combinedSummary, blocked };
}
