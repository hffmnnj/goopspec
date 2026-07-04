import { describe, expect, it } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { parseAgentMarkdown } from "./index.js";

const AGENTS_DIR = join(import.meta.dirname, "../../../agents");

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

function referencedTools(body: string): string[] {
  const tools = new Set<string>();

  for (const match of body.matchAll(/\bgoop_[a-z0-9_]+\b/g)) {
    tools.add(match[0]);
  }
  for (const match of body.matchAll(/\bmemory_[a-z0-9_]+\b/g)) {
    tools.add(match[0]);
  }

  const questionPatterns = /(?:^|\s)the `question` tool|\b`question`(?:\s+tool)?/gi;
  if (questionPatterns.test(body)) {
    tools.add("question");
  }

  if (body.matchAll(/\btask\(/g).next().value !== undefined) {
    tools.add("task");
  }
  const taskBacktick = /\b`task`(?:\s+tool)?/;
  if (taskBacktick.test(body)) {
    tools.add("task");
  }

  return [...tools].sort();
}

function isGranted(tool: string, tools: Record<string, boolean>, permission: Record<string, unknown>): boolean {
  if (tools[tool] === true) return true;

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
