import { describe, expect, it } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { setupTestEnvironment } from "../../test-utils.js";
import {
  loadAgentConfigs,
  loadCommandConfigs,
  parseAgentMarkdown,
  parseCommandMarkdown,
  parseFrontmatter,
} from "./index.js";

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

  it("parses a nested permission question value", () => {
    const meta = parseFrontmatter("permission:\n  question: allow");
    expect(meta.permission).toEqual({ question: "allow" });
  });

  it("parses a nested permission task wildcard value", () => {
    const meta = parseFrontmatter('permission:\n  task:\n    "*": allow');
    expect(meta.permission).toEqual({ task: { "*": "allow" } });
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

  it("populates permission from a nested permission block", () => {
    const result = parseAgentMarkdown(`---
name: permission-sample
permission:
  question: allow
  task:
    "*": allow
---
body`);

    expect(result?.config.permission as Record<string, unknown> | undefined).toEqual({
      question: "allow",
      task: { "*": "allow" },
    });
  });

  it("keeps tools-only agents backward compatible", () => {
    const result = parseAgentMarkdown(SAMPLE);
    expect(result?.config).toEqual({
      description: "A sample agent",
      model: "anthropic/claude-opus-4-6",
      temperature: 0.2,
      mode: "primary",
      tools: { read: true, glob: true, task: true },
      prompt: "# Sample\n\nYou are a sample agent.",
    });
    expect(result?.config.permission).toBeUndefined();
  });

  it("skips malformed permission sub-blocks without throwing", () => {
    const result = parseAgentMarkdown(`---
name: malformed-permission
description: Still loads
permission:
  question: allow
  task:
    - not-a-map
model: openai/gpt-5.5
---
body`);

    expect(result).not.toBeNull();
    expect(result?.config.description).toBe("Still loads");
    expect(result?.config.model).toBe("openai/gpt-5.5");
    expect(result?.config.permission as Record<string, unknown> | undefined).toEqual({
      question: "allow",
    });
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

describe("parseCommandMarkdown", () => {
  const FULL_COMMAND = `---
name: goop-example
description: An example command
agent: orchestrator
phase: execute
requires: spec_locked
next-step: "When done, run /goop-accept"
---
# Example

Body text.`;

  it("retains phase, requires, and next-step from frontmatter", () => {
    const result = parseCommandMarkdown(FULL_COMMAND);
    expect(result).not.toBeNull();
    expect(result?.name).toBe("goop-example");
    expect(result?.description).toBe("An example command");
    expect(result?.agent).toBe("goop-orchestrator");
    expect(result?.phase).toBe("execute");
    expect(result?.requires).toBe("spec_locked");
    expect(result?.nextStep).toBe("When done, run /goop-accept");
  });

  it("leaves phase, requires, and next-step undefined when absent", () => {
    const result = parseCommandMarkdown("---\nname: minimal\n---\nbody");
    expect(result).not.toBeNull();
    expect(result?.phase).toBeUndefined();
    expect(result?.requires).toBeUndefined();
    expect(result?.nextStep).toBeUndefined();
  });

  it("returns null when there is no frontmatter", () => {
    expect(parseCommandMarkdown("# Just a heading\n")).toBeNull();
  });

  it("returns null when name is missing", () => {
    expect(parseCommandMarkdown("---\ndescription: x\n---\nbody")).toBeNull();
  });

  it("returns null when the body is empty", () => {
    expect(parseCommandMarkdown("---\nname: empty\n---\n")).toBeNull();
  });

  it("resolves the orchestrator agent alias", () => {
    const result = parseCommandMarkdown("---\nname: c\nagent: orchestrator\n---\nbody");
    expect(result?.agent).toBe("goop-orchestrator");
  });

  it("preserves a non-alias agent value", () => {
    const result = parseCommandMarkdown("---\nname: c\nagent: goop-tester\n---\nbody");
    expect(result?.agent).toBe("goop-tester");
  });
});

describe("loadCommandConfigs", () => {
  it("loads every .md command in a directory", () => {
    const { testDir, cleanup } = setupTestEnvironment("commands-load");
    try {
      const dir = join(testDir, "commands");
      mkdirSync(dir, { recursive: true });
      writeFileSync(
        join(dir, "goop-example.md"),
        "---\nname: goop-example\ndescription: x\nagent: orchestrator\nphase: execute\nrequires: spec_locked\nnext-step: done\n---\nbody",
      );
      writeFileSync(join(dir, "other.md"), "---\nname: other\n---\nhi");
      writeFileSync(join(dir, "notes.txt"), "ignored");

      const commands = loadCommandConfigs(dir);
      expect(Object.keys(commands).sort()).toEqual(["goop-example", "other"]);
    } finally {
      cleanup();
    }
  });

  it("registers only template/description/agent, not phase/requires/nextStep", () => {
    const { testDir, cleanup } = setupTestEnvironment("commands-fields");
    try {
      const dir = join(testDir, "commands");
      mkdirSync(dir, { recursive: true });
      writeFileSync(
        join(dir, "goop-example.md"),
        "---\nname: goop-example\ndescription: x\nagent: orchestrator\nphase: execute\nrequires: spec_locked\nnext-step: done\n---\nbody",
      );

      const commands = loadCommandConfigs(dir);
      const entry = commands["goop-example"];
      expect(entry).toBeDefined();
      expect(entry.template).toBe("body");
      expect(entry.description).toBe("x");
      expect(entry.agent).toBe("goop-orchestrator");
      expect((entry as Record<string, unknown>).phase).toBeUndefined();
      expect((entry as Record<string, unknown>).requires).toBeUndefined();
      expect((entry as Record<string, unknown>).nextStep).toBeUndefined();
    } finally {
      cleanup();
    }
  });

  it("returns an empty map for a missing directory", () => {
    expect(loadCommandConfigs("/no/such/commands/dir")).toEqual({});
  });
});
