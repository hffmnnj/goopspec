import { describe, expect, it } from "bun:test";
import { parseResearchResult, planParallelResearch, synthesizeResearch } from "./index.js";

// ---------------------------------------------------------------------------
// planParallelResearch
// ---------------------------------------------------------------------------

describe("planParallelResearch", () => {
  it("defaults to researcher for generic topics", () => {
    const tasks = planParallelResearch([{ topic: "JWT token best practices" }]);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].agent).toBe("researcher");
  });

  it("routes codebase-oriented topics to explorer", () => {
    const codebaseTopics = [
      { topic: "Where is the auth middleware defined?" },
      { topic: "Find all usages of createUser" },
      { topic: "Trace the request flow through the API" },
      { topic: "Map the database schema" },
      { topic: "Explore the codebase for error handling patterns" },
    ];
    const tasks = planParallelResearch(codebaseTopics);
    for (const task of tasks) {
      expect(task.agent).toBe("explorer");
    }
  });

  it("respects an explicit agent override", () => {
    const tasks = planParallelResearch([{ topic: "Where is auth?", agent: "researcher" }]);
    expect(tasks[0].agent).toBe("researcher");
  });

  it("assigns unique sequential ids", () => {
    const tasks = planParallelResearch([{ topic: "A" }, { topic: "B" }, { topic: "C" }]);
    expect(tasks.map((t) => t.id)).toEqual(["research-1", "research-2", "research-3"]);
  });

  it("builds a prompt containing the topic and response-format instructions", () => {
    const tasks = planParallelResearch([{ topic: "OAuth2 flows" }]);
    const prompt = tasks[0].prompt;
    expect(prompt).toContain("OAuth2 flows");
    expect(prompt).toContain("## STATUS");
    expect(prompt).toContain("## SUMMARY");
    expect(prompt).toContain("## NEXT");
  });

  it("returns an empty array for empty input", () => {
    expect(planParallelResearch([])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// parseResearchResult
// ---------------------------------------------------------------------------

describe("parseResearchResult", () => {
  const sampleResponse = [
    "## STATUS",
    "complete",
    "## SUMMARY",
    "Found three viable OAuth2 libraries. Recommended passport-oauth2 for Express compatibility.",
    "## ARTIFACTS",
    "- .research/oauth-comparison.md — library comparison table",
    "## VERIFICATION",
    "n/a",
    "## NEXT",
    "Hand to executor for implementation.",
  ].join("\n");

  it("extracts status and summary from a well-formed response", () => {
    const result = parseResearchResult("r-1", "OAuth2", sampleResponse);
    expect(result.status).toBe("complete");
    expect(result.summary).toContain("passport-oauth2");
    expect(result.id).toBe("r-1");
    expect(result.topic).toBe("OAuth2");
    expect(result.raw).toBe(sampleResponse);
  });

  it("parses blocked status", () => {
    const raw =
      "## STATUS\nblocked\n## SUMMARY\nNeed API key.\n## ARTIFACTS\n- none\n## VERIFICATION\nn/a\n## NEXT\nProvide key.";
    const result = parseResearchResult("r-2", "API", raw);
    expect(result.status).toBe("blocked");
    expect(result.summary).toContain("API key");
  });

  it("parses partial status", () => {
    const raw =
      "## STATUS\npartial\n## SUMMARY\nHalf done.\n## ARTIFACTS\n- none\n## VERIFICATION\nn/a\n## NEXT\nContinue.";
    const result = parseResearchResult("r-3", "Partial", raw);
    expect(result.status).toBe("partial");
  });

  it("defaults to complete when STATUS section is missing", () => {
    const raw =
      "## SUMMARY\nSome findings.\n## ARTIFACTS\n- none\n## VERIFICATION\nn/a\n## NEXT\nDone.";
    const result = parseResearchResult("r-4", "Missing", raw);
    expect(result.status).toBe("complete");
  });

  it("provides fallback summary when SUMMARY section is missing", () => {
    const raw = "## STATUS\ncomplete\n## ARTIFACTS\n- none\n## VERIFICATION\nn/a\n## NEXT\nDone.";
    const result = parseResearchResult("r-5", "NoSummary", raw);
    expect(result.summary).toBe("(no summary provided)");
  });

  it("handles completely empty input gracefully", () => {
    const result = parseResearchResult("r-6", "Empty", "");
    expect(result.status).toBe("complete");
    expect(result.summary).toBe("(no summary provided)");
    expect(result.raw).toBe("");
  });
});

// ---------------------------------------------------------------------------
// synthesizeResearch
// ---------------------------------------------------------------------------

describe("synthesizeResearch", () => {
  it("builds a combined bullet-list summary", () => {
    const results = [
      { id: "r-1", topic: "Auth", status: "complete" as const, summary: "Use JWT.", raw: "" },
      { id: "r-2", topic: "DB", status: "complete" as const, summary: "Use Postgres.", raw: "" },
    ];
    const synthesis = synthesizeResearch(results);
    expect(synthesis.combinedSummary).toContain("- [Auth]: Use JWT.");
    expect(synthesis.combinedSummary).toContain("- [DB]: Use Postgres.");
    expect(synthesis.blocked).toHaveLength(0);
  });

  it("separates blocked results", () => {
    const results = [
      { id: "r-1", topic: "Auth", status: "complete" as const, summary: "Done.", raw: "" },
      { id: "r-2", topic: "Payments", status: "blocked" as const, summary: "Need key.", raw: "" },
      { id: "r-3", topic: "Cache", status: "blocked" as const, summary: "Redis down.", raw: "" },
    ];
    const synthesis = synthesizeResearch(results);
    expect(synthesis.blocked).toHaveLength(2);
    expect(synthesis.blocked.map((b) => b.id)).toEqual(["r-2", "r-3"]);
    expect(synthesis.results).toHaveLength(3);
  });

  it("handles empty results array", () => {
    const synthesis = synthesizeResearch([]);
    expect(synthesis.combinedSummary).toBe("(no results)");
    expect(synthesis.blocked).toHaveLength(0);
    expect(synthesis.results).toHaveLength(0);
  });
});
