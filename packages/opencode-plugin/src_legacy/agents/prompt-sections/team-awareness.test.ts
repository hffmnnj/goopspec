import { describe, expect, it } from "bun:test";
import { generateTeamAwarenessSection } from "./team-awareness.js";

describe("team awareness prompt section", () => {
  it("generates a section without siblings", () => {
    const section = generateTeamAwarenessSection();
    expect(section).toContain("## Team Awareness");
    expect(section).toContain("per-agent output files");
    expect(section).not.toContain("Active Siblings");
  });

  it("generates a section with siblings", () => {
    const section = generateTeamAwarenessSection({
      siblings: [
        { id: "agent-a", type: "goop-researcher", task: "Research" },
        { id: "agent-b" },
      ],
    });

    expect(section).toContain("Active Siblings");
    expect(section).toContain("agent-a");
    expect(section).toContain("goop-researcher");
    expect(section).toContain("Research");
    expect(section).toContain("agent-b");
  });

  it("keeps the section concise", () => {
    const section = generateTeamAwarenessSection({
      siblings: Array.from({ length: 3 }, (_, index) => ({
        id: `agent-${index + 1}`,
        type: "goop-executor",
      })),
    });

    expect(section.split("\n").length).toBeLessThan(30);
  });

  it("explains the per-agent file pattern", () => {
    const section = generateTeamAwarenessSection();
    expect(section).toContain("{basename}-{shortId}.{ext}");
    expect(section).toContain("registry.json");
  });
});
