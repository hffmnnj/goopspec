import { describe, expect, it } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { parseAgentMarkdown } from "./index.js";

const AGENTS_DIR = join(import.meta.dirname, "../../../agents");

const MEMORY_TOOL_ALIASES: Record<string, string> = {
  memory_note: "memory_save",
  memory_decision: "memory_save",
};

interface ToolGrantResult {
  agent: string;
  referenced: string[];
  missing: string[];
}

function collectAgentFiles(): string[] {
  return readdirSync(AGENTS_DIR)
    .filter((file) => file.endsWith(".md"))
    .sort();
}

function extractBody(raw: string): string {
  const bodyMatch = raw.match(/^---\s*\r?\n[\s\S]*?\r?\n---\s*\r?\n([\s\S]*)$/);
  return bodyMatch ? bodyMatch[1] : raw;
}

// Detection rule for required tool grants:
//
// The agent body is broken into small, independent units so that a prohibition
// in one clause cannot suppress a genuine instruction in another:
//   - each markdown list item (line starting with "-" or "*") is one unit
//   - prose is split into clauses at . ! ? ; and em-dashes
//
// A unit is treated as prohibitive for a given tool token only when a negation
// cue appears *before* that token inside the same unit. Cues:
//   "do not", "don't", "never", "not permitted", "must not", "should not",
//   "cannot", "can't", "prohibited", "forbidden", and phrases that assign
//   responsibility elsewhere such as "is the Orchestrator's responsibility" or
//   "is the Orchestrator/command's responsibility".
//
// If a unit is prohibitive for a tool token, that token is skipped in that
// unit; otherwise it counts as a required grant.
const NEGATION_CUES = [
  "do not",
  "don't",
  "never",
  "not permitted",
  "is the Orchestrator's responsibility",
  "is the Orchestrator/command's responsibility",
  "forbidden",
  "must not",
  "should not",
  "cannot",
  "can't",
  "prohibited",
];

function segmentBody(body: string): string[] {
  const segments: string[] = [];
  const lines = body.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (/^[-*]\s+/.test(trimmed)) {
      segments.push(trimmed);
    } else {
      const clauses = trimmed.split(/(?<=[.!?;])\s+|\s+—\s+/);
      for (const clause of clauses) {
        if (clause.trim()) segments.push(clause.trim());
      }
    }
  }

  return segments;
}

function findCueBeforeToken(segment: string, tokenStart: number): boolean {
  const before = segment.slice(0, tokenStart).toLowerCase();
  return NEGATION_CUES.some((cue) => before.includes(cue));
}

function collectTokens(segment: string, regex: RegExp, tools: Set<string>): void {
  for (const match of segment.matchAll(regex)) {
    if (!findCueBeforeToken(segment, match.index ?? 0)) {
      tools.add(match[0]);
    }
  }
}

function referencedTools(body: string): string[] {
  const tools = new Set<string>();
  const goopRegex = /\bgoop_[a-z0-9_]+\b/g;
  const memoryRegex = /\bmemory_[a-z0-9_]+\b/g;

  for (const segment of segmentBody(body)) {
    collectTokens(segment, goopRegex, tools);
    collectTokens(segment, memoryRegex, tools);

    const questionMatch = segment.match(/(?:^|\s)the `question` tool|\b`question`(?:\s+tool)?/i);
    if (questionMatch && !findCueBeforeToken(segment, questionMatch.index ?? 0)) {
      tools.add("question");
    }

    const taskCallMatch = segment.match(/\btask\(/);
    if (taskCallMatch && !findCueBeforeToken(segment, taskCallMatch.index ?? 0)) {
      tools.add("task");
    }

    const taskBacktickMatch = segment.match(/\b`task`(?:\s+tool)?/);
    if (taskBacktickMatch && !findCueBeforeToken(segment, taskBacktickMatch.index ?? 0)) {
      tools.add("task");
    }
  }

  return [...tools].sort();
}

function isGranted(tool: string, tools: Record<string, boolean>, permission: Record<string, unknown>): boolean {
  const effectiveTool = MEMORY_TOOL_ALIASES[tool] ?? tool;
  if (tools[effectiveTool] === true) return true;

  if (tool === "question") {
    const questionGrant = permission.question;
    return questionGrant !== undefined && questionGrant !== "deny";
  }

  if (tool === "task") {
    const taskGrant = permission.task;
    if (taskGrant === undefined) return false;
    if (typeof taskGrant === "string") return taskGrant !== "deny";
    if (typeof taskGrant === "object" && taskGrant !== null) {
      const map = taskGrant as Record<string, string>;
      return Object.values(map).some((value) => value !== "deny");
    }
    return false;
  }

  return false;
}

function checkAgentFile(file: string): ToolGrantResult {
  const raw = readFileSync(join(AGENTS_DIR, file), "utf-8");
  const parsed = parseAgentMarkdown(raw);
  if (!parsed) {
    return { agent: file, referenced: [], missing: ["(failed to parse agent markdown)"] };
  }

  const body = extractBody(raw);
  const referenced = referencedTools(body);
  const tools = parsed.config.tools ?? {};
  const permission = parsed.config.permission ?? ({} as Record<string, unknown>);

  const missing = referenced.filter((tool) => !isGranted(tool, tools, permission));

  return { agent: parsed.name, referenced, missing };
}

const agentFiles = collectAgentFiles();
const results = agentFiles.map(checkAgentFile);

describe("agent tool-grant drift regression", () => {
  for (const { agent, missing } of results) {
    it(`${agent} has grants for every body-referenced tool`, () => {
      expect(missing).toEqual([]);
    });
  }

  it("documents the current drift state", () => {
    const passing = results.filter((r) => r.missing.length === 0).map((r) => r.agent);
    const failing = results.filter((r) => r.missing.length > 0);

    const driftSummary = failing.map(({ agent, missing }) => ({ agent, missing }));

    console.log("Tool-grant regression snapshot:");
    console.log("PASS:", passing);
    console.log("FAIL:", driftSummary);

    expect(passing.length + failing.length).toBe(agentFiles.length);
  });
});

describe("referencedTools negation awareness", () => {
  it("does not require a tool that is only mentioned in a prohibition", () => {
    const body =
      "- Creating pull requests — do not run `gh pr create` or `goop_create_pr`; PR creation is the Orchestrator/command's responsibility.";
    expect(referencedTools(body)).toEqual([]);
  });

  it("still requires a tool that is genuinely instructed for use", () => {
    const body = "Use `goop_write_db` to persist the document.";
    expect(referencedTools(body)).toEqual(["goop_write_db"]);
  });

  it("separates prohibitions from genuine instructions in the same body", () => {
    const body = "Use `goop_write_db` to persist. Do not use `goop_create_pr`.";
    expect(referencedTools(body)).toEqual(["goop_write_db"]);
  });

  it("does not let a distant negation suppress an earlier positive instruction", () => {
    const body = "Call `goop_read_wave` first — do NOT load the spec file.";
    expect(referencedTools(body)).toEqual(["goop_read_wave"]);
  });

  it("still fails when a genuinely required tool is missing a grant", () => {
    const raw = [
      "---",
      "name: fixture-missing-grant",
      "tools:",
      "  - read",
      "---",
      "",
      "Use `goop_write_db` to persist the document.",
    ].join("\n");
    const parsed = parseAgentMarkdown(raw);
    expect(parsed).not.toBeNull();
    const body = extractBody(raw);
    const referenced = referencedTools(body);
    const missing = referenced.filter((tool) => !(parsed!.config.tools ?? {})[tool]);
    expect(referenced).toEqual(["goop_write_db"]);
    expect(missing).toEqual(["goop_write_db"]);
  });
});
