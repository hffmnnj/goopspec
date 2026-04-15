import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync } from "fs";
import { join } from "path";
import { setupTestEnvironment } from "../../test-utils.js";
import type { AgentRegistration } from "./types.js";
import {
  deregisterAgent,
  getActiveAgents,
  getAgentsByType,
  getRegistry,
  isFileClaimed,
  registerAgent,
} from "./registry.js";

const createRegistration = (
  overrides: Partial<AgentRegistration> = {}
): AgentRegistration => ({
  id: overrides.id ?? "agent-1",
  type: overrides.type ?? "goop-executor",
  task: overrides.task ?? "Test task",
  claimedFiles: overrides.claimedFiles ?? [],
  startedAt: overrides.startedAt ?? Date.now(),
  parentId: overrides.parentId,
  ttl: overrides.ttl,
});

describe("team registry", () => {
  let cleanup: () => void;
  let testDir: string;
  let goopspecDir: string;
  let originalCwd: string;

  beforeEach(() => {
    const env = setupTestEnvironment("registry-tests");
    cleanup = env.cleanup;
    testDir = env.testDir;
    goopspecDir = env.goopspecDir;
    originalCwd = process.cwd();
    process.chdir(testDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    cleanup();
  });

  it("returns an empty registry when no file exists", async () => {
    const registry = await getRegistry();
    expect(Object.keys(registry.agents)).toHaveLength(0);
    const registryPath = join(goopspecDir, "team", "registry.json");
    expect(existsSync(registryPath)).toBe(false);
  });

  it("registers and deregisters agents", async () => {
    const registration = createRegistration({
      id: "agent-1",
      type: "goop-researcher",
      task: "Analyze",
      claimedFiles: ["notes.md"],
      startedAt: 1234,
    });

    const result = await registerAgent(registration);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.registry.agents["agent-1"]?.type).toBe("goop-researcher");
    }

    const active = await getActiveAgents();
    expect(active).toHaveLength(1);
    expect(active[0]?.claimedFiles).toEqual(["notes.md"]);

    const deregistered = await deregisterAgent("agent-1");
    expect(deregistered.ok).toBe(true);
    const after = await getActiveAgents();
    expect(after).toHaveLength(0);
  });

  it("defaults startedAt when not provided", async () => {
    const registration = createRegistration({ id: "agent-2", startedAt: undefined });
    const result = await registerAgent(registration);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(typeof result.registry.agents["agent-2"]?.startedAt).toBe("number");
    }
  });

  it("filters agents by type", async () => {
    await registerAgent(createRegistration({ id: "agent-a", type: "goop-executor" }));
    await registerAgent(createRegistration({ id: "agent-b", type: "goop-researcher" }));

    const executors = await getAgentsByType("goop-executor");
    const researchers = await getAgentsByType("goop-researcher");

    expect(executors).toHaveLength(1);
    expect(executors[0]?.id).toBe("agent-a");
    expect(researchers).toHaveLength(1);
    expect(researchers[0]?.id).toBe("agent-b");
  });

  it("detects claimed files", async () => {
    await registerAgent(createRegistration({
      id: "agent-3",
      claimedFiles: ["RESEARCH.md", "NOTES.md"],
    }));

    expect(await isFileClaimed("RESEARCH.md")).toBe(true);
    expect(await isFileClaimed("OTHER.md")).toBe(false);
  });

  it("returns a helpful error when deregistering a missing agent", async () => {
    const result = await deregisterAgent("missing-agent");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("missing-agent");
    }
  });

  it("handles concurrent registrations safely", async () => {
    const registrations = Array.from({ length: 8 }, (_, index) =>
      createRegistration({ id: `agent-${index}`, type: "goop-explorer" })
    );

    const results = await Promise.all(registrations.map(registerAgent));
    results.forEach(result => expect(result.ok).toBe(true));

    const registry = await getRegistry();
    expect(Object.keys(registry.agents)).toHaveLength(registrations.length);
  });
});
