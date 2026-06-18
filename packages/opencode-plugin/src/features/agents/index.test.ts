import { describe, expect, it } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { setupTestEnvironment } from "../../test-utils.js";
import { loadAgentConfigs, parseAgentMarkdown, parseFrontmatter } from "./index.js";

const SAMPLE = `---
name: goop-sample
description: A sample agent
model: anthropic/claude-opus-4-6
temperature: 0.2
mode: primary
tools:
  - read
  - glob
  - task
---

# Sample

You are a sample agent.
`;

describe("parseFrontmatter", () => {
  it("parses scalar key/value pairs", () => {
    const meta = parseFrontmatter("name: foo\nmodel: bar\ntemperature: 0.5");
    expect(meta.name).toBe("foo");
    expect(meta.model).toBe("bar");
    expect(meta.temperature).toBe("0.5");
  });

  it("parses a list value", () => {
    const meta = parseFrontmatter("tools:\n  - read\n  - write");
    expect(meta.tools).toEqual(["read", "write"]);
  });

  it("strips surrounding quotes", () => {
    const meta = parseFrontmatter('description: "quoted value"');
    expect(meta.description).toBe("quoted value");
  });

  it("ignores blank lines and unrecognised content", () => {
    const meta = parseFrontmatter("\nname: foo\n\n");
    expect(meta.name).toBe("foo");
  });
});

describe("parseAgentMarkdown", () => {
  it("converts a full agent document into a LoadedAgent", () => {
    const result = parseAgentMarkdown(SAMPLE);
    expect(result).not.toBeNull();
    expect(result?.name).toBe("goop-sample");
    expect(result?.config.description).toBe("A sample agent");
    expect(result?.config.model).toBe("anthropic/claude-opus-4-6");
    expect(result?.config.temperature).toBe(0.2);
    expect(result?.config.mode).toBe("primary");
    expect(result?.config.tools).toEqual({ read: true, glob: true, task: true });
    expect(result?.config.prompt).toContain("You are a sample agent.");
  });

  it("returns null when there is no frontmatter", () => {
    expect(parseAgentMarkdown("# Just a heading\n")).toBeNull();
  });

  it("returns null when name is missing", () => {
    expect(parseAgentMarkdown("---\ndescription: x\n---\nbody")).toBeNull();
  });

  it("ignores an invalid mode", () => {
    const result = parseAgentMarkdown("---\nname: a\nmode: bogus\n---\nbody");
    expect(result?.config.mode).toBeUndefined();
  });

  it("ignores a non-numeric temperature", () => {
    const result = parseAgentMarkdown("---\nname: a\ntemperature: hot\n---\nbody");
    expect(result?.config.temperature).toBeUndefined();
  });
});

describe("loadAgentConfigs", () => {
  it("loads every .md agent in a directory", () => {
    const { testDir, cleanup } = setupTestEnvironment("agents-load");
    try {
      const dir = join(testDir, "agents");
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "goop-sample.md"), SAMPLE);
      writeFileSync(join(dir, "other.md"), "---\nname: other\n---\nhi");
      writeFileSync(join(dir, "notes.txt"), "ignored");

      const agents = loadAgentConfigs(dir);
      expect(Object.keys(agents).sort()).toEqual(["goop-sample", "other"]);
      expect(agents["goop-sample"].mode).toBe("primary");
    } finally {
      cleanup();
    }
  });

  it("returns an empty map for a missing directory", () => {
    expect(loadAgentConfigs("/no/such/agents/dir")).toEqual({});
  });
});
