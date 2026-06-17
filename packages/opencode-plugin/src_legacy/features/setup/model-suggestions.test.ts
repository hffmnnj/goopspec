import { describe, it, expect } from "bun:test";
import { AGENT_MODEL_SUGGESTIONS, ALL_AGENTS } from "./model-suggestions.js";

describe("model suggestions", () => {
  it("includes all 15 agents", () => {
    expect(Object.keys(AGENT_MODEL_SUGGESTIONS)).toHaveLength(15);
  });

  it("includes known required agents", () => {
    expect(AGENT_MODEL_SUGGESTIONS).toHaveProperty("goop-orchestrator");
    expect(AGENT_MODEL_SUGGESTIONS).toHaveProperty("goop-executor-low");
    expect(AGENT_MODEL_SUGGESTIONS).toHaveProperty("goop-executor-medium");
    expect(AGENT_MODEL_SUGGESTIONS).toHaveProperty("goop-executor-high");
    expect(AGENT_MODEL_SUGGESTIONS).toHaveProperty("goop-executor-frontend");
    expect(AGENT_MODEL_SUGGESTIONS).toHaveProperty("goop-planner");
    expect(AGENT_MODEL_SUGGESTIONS).toHaveProperty("goop-verifier");
    expect(AGENT_MODEL_SUGGESTIONS).toHaveProperty("goop-researcher");
  });

  it("ensures each agent has at least two suggestions", () => {
    for (const config of Object.values(AGENT_MODEL_SUGGESTIONS)) {
      expect(config.suggestions.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("ensures each agent has a non-empty description", () => {
    for (const config of Object.values(AGENT_MODEL_SUGGESTIONS)) {
      expect(config.description.trim().length).toBeGreaterThan(0);
    }
  });

  it("keeps ALL_AGENTS in sync with suggestion keys", () => {
    expect(new Set(ALL_AGENTS)).toEqual(new Set(Object.keys(AGENT_MODEL_SUGGESTIONS)));
  });
});
