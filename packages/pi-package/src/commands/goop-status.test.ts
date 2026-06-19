import { afterEach, describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { GoopPiContext, PiCommand, PiEventContext, PiExtensionAPI } from "../core/types.js";
import { StateManager } from "../features/state/index.js";
import { createGoopAcceptCommand } from "./goop-accept.js";
import { createGoopDiscussCommand } from "./goop-discuss.js";
import { createGoopExecuteCommand } from "./goop-execute.js";
import { createGoopPlanCommand } from "./goop-plan.js";
import { createGoopStatusCommand } from "./goop-status.js";
import { registerCommands } from "./index.js";

function makeTmpDir(): string {
  const tmp = path.join(
    os.tmpdir(),
    `goopspec-cmd-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  fs.mkdirSync(tmp, { recursive: true });
  return tmp;
}

function makeCtx(tmpDir: string): GoopPiContext {
  return {
    projectDir: tmpDir,
    runtime: "pi",
    dbPath: path.join(tmpDir, ".goopspec", "goopspec.db"),
    goopspecDir: path.join(tmpDir, ".goopspec"),
  };
}

function makePiEventCtx(tmpDir: string): PiEventContext {
  return { projectDir: tmpDir };
}

function seedWorkflow(tmpDir: string): void {
  const sm = new StateManager(tmpDir);
  sm.createWorkflow("default");
  sm.setActiveWorkflowId("default");
  sm.close();
}

describe("goop-status command", () => {
  let tmpDir: string;

  afterEach(() => {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("has correct description and handler type", () => {
    tmpDir = makeTmpDir();
    const cmd = createGoopStatusCommand(makeCtx(tmpDir));
    expect(cmd.description).toContain("workflow state");
    expect(typeof cmd.handler).toBe("function");
  });

  it("handler executes without throwing", async () => {
    tmpDir = makeTmpDir();
    seedWorkflow(tmpDir);
    const cmd = createGoopStatusCommand(makeCtx(tmpDir));
    await cmd.handler([], makePiEventCtx(tmpDir));
  });

  it("displays wave progress bar when waves are defined", async () => {
    tmpDir = makeTmpDir();
    const sm = new StateManager(tmpDir);
    sm.createWorkflow("default");
    sm.setActiveWorkflowId("default");
    sm.updateWave("default", 2, 5);
    sm.close();

    const cmd = createGoopStatusCommand(makeCtx(tmpDir));
    // Capture stdout
    const chunks: string[] = [];
    const origWrite = process.stdout.write;
    process.stdout.write = ((chunk: string) => {
      chunks.push(chunk);
      return true;
    }) as typeof process.stdout.write;

    try {
      await cmd.handler([], makePiEventCtx(tmpDir));
    } finally {
      process.stdout.write = origWrite;
    }

    const output = chunks.join("");
    expect(output).toContain("2/5");
    expect(output).toContain("██");
    expect(output).toContain("░░░");
  });

  it("shows 'No waves defined' when totalWaves is 0", async () => {
    tmpDir = makeTmpDir();
    seedWorkflow(tmpDir);

    const cmd = createGoopStatusCommand(makeCtx(tmpDir));
    const chunks: string[] = [];
    const origWrite = process.stdout.write;
    process.stdout.write = ((chunk: string) => {
      chunks.push(chunk);
      return true;
    }) as typeof process.stdout.write;

    try {
      await cmd.handler([], makePiEventCtx(tmpDir));
    } finally {
      process.stdout.write = origWrite;
    }

    const output = chunks.join("");
    expect(output).toContain("No waves defined");
  });

  it("lists workflows with active marker", async () => {
    tmpDir = makeTmpDir();
    const sm = new StateManager(tmpDir);
    sm.createWorkflow("alpha");
    sm.createWorkflow("beta");
    sm.setActiveWorkflowId("alpha");
    sm.close();

    const cmd = createGoopStatusCommand(makeCtx(tmpDir));
    const chunks: string[] = [];
    const origWrite = process.stdout.write;
    process.stdout.write = ((chunk: string) => {
      chunks.push(chunk);
      return true;
    }) as typeof process.stdout.write;

    try {
      await cmd.handler([], makePiEventCtx(tmpDir));
    } finally {
      process.stdout.write = origWrite;
    }

    const output = chunks.join("");
    expect(output).toContain("> alpha");
    expect(output).toContain("  beta");
  });
});

describe("goop-discuss command", () => {
  let tmpDir: string;

  afterEach(() => {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("has correct description", () => {
    tmpDir = makeTmpDir();
    const cmd = createGoopDiscussCommand(makeCtx(tmpDir));
    expect(cmd.description).toContain("discovery interview");
  });

  it("handler executes and prints banner", async () => {
    tmpDir = makeTmpDir();
    seedWorkflow(tmpDir);

    const cmd = createGoopDiscussCommand(makeCtx(tmpDir));
    const chunks: string[] = [];
    const origWrite = process.stdout.write;
    process.stdout.write = ((chunk: string) => {
      chunks.push(chunk);
      return true;
    }) as typeof process.stdout.write;

    try {
      await cmd.handler([], makePiEventCtx(tmpDir));
    } finally {
      process.stdout.write = origWrite;
    }

    const output = chunks.join("");
    expect(output).toContain("GoopSpec · Discuss");
    expect(output).toContain("Vision");
  });
});

describe("goop-plan command", () => {
  let tmpDir: string;

  afterEach(() => {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("blocks when interview is not complete", async () => {
    tmpDir = makeTmpDir();
    seedWorkflow(tmpDir);

    const cmd = createGoopPlanCommand(makeCtx(tmpDir));
    const chunks: string[] = [];
    const origWrite = process.stdout.write;
    process.stdout.write = ((chunk: string) => {
      chunks.push(chunk);
      return true;
    }) as typeof process.stdout.write;

    try {
      await cmd.handler([], makePiEventCtx(tmpDir));
    } finally {
      process.stdout.write = origWrite;
    }

    const output = chunks.join("");
    expect(output).toContain("Blocked");
    expect(output).toContain("/goop-discuss");
  });

  it("proceeds when interview is complete", async () => {
    tmpDir = makeTmpDir();
    const sm = new StateManager(tmpDir);
    sm.createWorkflow("default");
    sm.setActiveWorkflowId("default");
    sm.completeInterview("default");
    sm.close();

    const cmd = createGoopPlanCommand(makeCtx(tmpDir));
    const chunks: string[] = [];
    const origWrite = process.stdout.write;
    process.stdout.write = ((chunk: string) => {
      chunks.push(chunk);
      return true;
    }) as typeof process.stdout.write;

    try {
      await cmd.handler([], makePiEventCtx(tmpDir));
    } finally {
      process.stdout.write = origWrite;
    }

    const output = chunks.join("");
    expect(output).toContain("GoopSpec · Plan");
    expect(output).toContain("SPEC.md");
  });
});

describe("goop-execute command", () => {
  let tmpDir: string;

  afterEach(() => {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("blocks when spec is not locked", async () => {
    tmpDir = makeTmpDir();
    seedWorkflow(tmpDir);

    const cmd = createGoopExecuteCommand(makeCtx(tmpDir));
    const chunks: string[] = [];
    const origWrite = process.stdout.write;
    process.stdout.write = ((chunk: string) => {
      chunks.push(chunk);
      return true;
    }) as typeof process.stdout.write;

    try {
      await cmd.handler([], makePiEventCtx(tmpDir));
    } finally {
      process.stdout.write = origWrite;
    }

    const output = chunks.join("");
    expect(output).toContain("Blocked");
    expect(output).toContain("/goop-plan");
  });

  it("proceeds when spec is locked", async () => {
    tmpDir = makeTmpDir();
    const sm = new StateManager(tmpDir);
    sm.createWorkflow("default");
    sm.setActiveWorkflowId("default");
    sm.completeInterview("default");
    sm.transitionPhase("default", "plan");
    sm.lockSpec("default");
    sm.transitionPhase("default", "execute");
    sm.close();

    const cmd = createGoopExecuteCommand(makeCtx(tmpDir));
    const chunks: string[] = [];
    const origWrite = process.stdout.write;
    process.stdout.write = ((chunk: string) => {
      chunks.push(chunk);
      return true;
    }) as typeof process.stdout.write;

    try {
      await cmd.handler([], makePiEventCtx(tmpDir));
    } finally {
      process.stdout.write = origWrite;
    }

    const output = chunks.join("");
    expect(output).toContain("GoopSpec · Execute");
    expect(output).toContain("wave by wave");
  });
});

describe("goop-accept command", () => {
  let tmpDir: string;

  afterEach(() => {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("has correct description", () => {
    tmpDir = makeTmpDir();
    const cmd = createGoopAcceptCommand(makeCtx(tmpDir));
    expect(cmd.description).toContain("acceptance");
  });

  it("handler executes and prints banner", async () => {
    tmpDir = makeTmpDir();
    seedWorkflow(tmpDir);

    const cmd = createGoopAcceptCommand(makeCtx(tmpDir));
    const chunks: string[] = [];
    const origWrite = process.stdout.write;
    process.stdout.write = ((chunk: string) => {
      chunks.push(chunk);
      return true;
    }) as typeof process.stdout.write;

    try {
      await cmd.handler([], makePiEventCtx(tmpDir));
    } finally {
      process.stdout.write = origWrite;
    }

    const output = chunks.join("");
    expect(output).toContain("GoopSpec · Accept");
    expect(output).toContain("must-haves");
  });
});

describe("registerCommands", () => {
  let tmpDir: string;

  afterEach(() => {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("registers all 5 commands", () => {
    tmpDir = makeTmpDir();
    const registered: string[] = [];
    const mockPi: PiExtensionAPI = {
      registerTool: () => {},
      registerCommand: (name: string, _def: PiCommand) => {
        registered.push(name);
      },
      on: () => {},
      events: { emit: () => {}, on: () => {} },
    };

    registerCommands(mockPi, makeCtx(tmpDir));

    expect(registered).toContain("goop-discuss");
    expect(registered).toContain("goop-plan");
    expect(registered).toContain("goop-execute");
    expect(registered).toContain("goop-accept");
    expect(registered).toContain("goop-status");
    expect(registered).toHaveLength(5);
  });
});
