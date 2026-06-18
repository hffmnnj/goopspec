import { afterEach, beforeEach, describe, expect, it } from "bun:test";

import type { PluginContext } from "../../test-utils.js";
import {
  createMockPluginContext,
  createMockToolContext,
  setupTestEnvironment,
} from "../../test-utils.js";
import { createGoopAdlTool } from "./index.js";

describe("goop_adl tool", () => {
  let ctx: PluginContext;
  let cleanup: () => void;

  beforeEach(() => {
    const env = setupTestEnvironment("goop-adl");
    cleanup = env.cleanup;
    ctx = createMockPluginContext({ testDir: env.testDir });
  });

  afterEach(() => cleanup());

  const toolCtx = createMockToolContext();

  // -----------------------------------------------------------------------
  // read action
  // -----------------------------------------------------------------------

  describe("action: read", () => {
    it("returns ADL content", async () => {
      const tool = createGoopAdlTool(ctx);
      const result = await tool.execute({ action: "read" }, toolCtx);

      // Mock state manager returns a default ADL header
      expect(result).toContain("Automated Decision Log");
    });

    it("returns appended entries on subsequent read", async () => {
      const tool = createGoopAdlTool(ctx);

      await tool.execute(
        {
          action: "append",
          type: "decision",
          description: "Chose PostgreSQL",
          entry_action: "Selected PostgreSQL for persistence",
        },
        toolCtx,
      );

      const result = await tool.execute({ action: "read" }, toolCtx);
      expect(result).toContain("DECISION");
      expect(result).toContain("Chose PostgreSQL");
    });
  });

  // -----------------------------------------------------------------------
  // append action
  // -----------------------------------------------------------------------

  describe("action: append", () => {
    it("appends a decision entry", async () => {
      const tool = createGoopAdlTool(ctx);
      const result = await tool.execute(
        {
          action: "append",
          type: "decision",
          description: "Use jose for JWT",
          entry_action: "Selected jose over jsonwebtoken for ESM compat",
        },
        toolCtx,
      );

      expect(result).toContain("ADL entry added");
      expect(result).toContain("[DECISION]");
      expect(result).toContain("Use jose for JWT");
    });

    it("appends a deviation entry with rule", async () => {
      const tool = createGoopAdlTool(ctx);
      const result = await tool.execute(
        {
          action: "append",
          type: "deviation",
          description: "Fixed missing null check",
          entry_action: "Added null guard to prevent crash",
          rule: 1,
        },
        toolCtx,
      );

      expect(result).toContain("ADL entry added");
      expect(result).toContain("[DEVIATION]");
    });

    it("appends an observation entry with files", async () => {
      const tool = createGoopAdlTool(ctx);
      const result = await tool.execute(
        {
          action: "append",
          type: "observation",
          description: "Codebase uses repository pattern",
          entry_action: "Noted for future reference",
          files: ["src/repos/user.ts", "src/repos/order.ts"],
        },
        toolCtx,
      );

      expect(result).toContain("ADL entry added");
      expect(result).toContain("[OBSERVATION]");
    });

    it("requires type for append", async () => {
      const tool = createGoopAdlTool(ctx);
      const result = await tool.execute(
        {
          action: "append",
          description: "Missing type",
          entry_action: "Something",
        },
        toolCtx,
      );

      expect(result).toContain("Error");
      expect(result).toContain("type");
    });

    it("requires description for append", async () => {
      const tool = createGoopAdlTool(ctx);
      const result = await tool.execute(
        {
          action: "append",
          type: "decision",
          entry_action: "Something",
        },
        toolCtx,
      );

      expect(result).toContain("Error");
      expect(result).toContain("description");
    });

    it("requires entry_action for append", async () => {
      const tool = createGoopAdlTool(ctx);
      const result = await tool.execute(
        {
          action: "append",
          type: "decision",
          description: "Some decision",
        },
        toolCtx,
      );

      expect(result).toContain("Error");
      expect(result).toContain("entry_action");
    });
  });

  // -----------------------------------------------------------------------
  // error handling
  // -----------------------------------------------------------------------

  it("handles errors gracefully", async () => {
    const broken = createMockPluginContext({ testDir: "/tmp/nonexistent" });
    broken.stateManager.appendADL = () => {
      throw new Error("disk full");
    };

    const tool = createGoopAdlTool(broken);
    const result = await tool.execute(
      {
        action: "append",
        type: "decision",
        description: "Test",
        entry_action: "Test action",
      },
      toolCtx,
    );

    expect(result).toContain("Error in goop_adl");
    expect(result).toContain("disk full");
  });
});
