import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
  type PluginContext,
  createMockPluginContext,
  setupTestEnvironment,
} from "../test-utils.js";
import {
  EXCESSIVE_THRESHOLD,
  SLOP_PATTERNS,
  analyzeComments,
  commentCheckerFactory,
  createCommentCheckerHook,
} from "./comment-checker.js";

// ---------------------------------------------------------------------------
// analyzeComments
// ---------------------------------------------------------------------------

describe("analyzeComments", () => {
  it("counts code, comment, and blank lines correctly", () => {
    const content = ["// A comment", "const x = 1;", "", "const y = 2;", "// Another comment"].join(
      "\n",
    );

    const result = analyzeComments("test.ts", content);
    expect(result.commentLines).toBe(2);
    expect(result.codeLines).toBe(2);
    expect(result.blankLines).toBe(1);
    expect(result.totalLines).toBe(5);
  });

  it("calculates comment ratio from non-blank lines", () => {
    const content = ["// comment", "code();", "// comment", "code();"].join("\n");

    const result = analyzeComments("test.ts", content);
    expect(result.commentRatio).toBe(0.5);
  });

  it("handles block comments", () => {
    const content = ["/* block start", " * middle", " */", "const x = 1;"].join("\n");

    const result = analyzeComments("test.ts", content);
    expect(result.commentLines).toBe(3);
    expect(result.codeLines).toBe(1);
  });

  it("marks excessive when ratio exceeds threshold", () => {
    const content = ["// c1", "// c2", "// c3", "// c4", "code();"].join("\n");

    const result = analyzeComments("test.ts", content);
    expect(result.excessive).toBe(true);
    expect(result.commentRatio).toBeGreaterThan(EXCESSIVE_THRESHOLD);
  });

  it("does not mark excessive for clean code", () => {
    const content = [
      "const a = 1;",
      "const b = 2;",
      "const c = 3;",
      "const d = 4;",
      "// One useful comment",
    ].join("\n");

    const result = analyzeComments("test.ts", content);
    expect(result.excessive).toBe(false);
  });

  it("detects slop comments", () => {
    const content = [
      "// This function does something",
      "function doSomething() {}",
      "// Return the result",
      "return x;",
      "// Initialize variables",
      "let a = 1;",
    ].join("\n");

    const result = analyzeComments("test.ts", content);
    expect(result.slopComments.length).toBe(3);
  });

  it("does not flag legitimate comments as slop", () => {
    const content = [
      "// HACK: workaround for upstream bug #1234",
      "const x = 1;",
      "// Rate limit: 100 req/s per API docs",
      "const limit = 100;",
    ].join("\n");

    const result = analyzeComments("test.ts", content);
    expect(result.slopComments.length).toBe(0);
  });

  it("handles Python-style comments", () => {
    const content = ["# A comment", "x = 1", "# Another", "y = 2"].join("\n");

    const result = analyzeComments("test.py", content);
    expect(result.commentLines).toBe(2);
    expect(result.codeLines).toBe(2);
  });

  it("handles empty content", () => {
    const result = analyzeComments("test.ts", "");
    expect(result.commentRatio).toBe(0);
    expect(result.excessive).toBe(false);
    expect(result.slopComments.length).toBe(0);
  });

  it("handles unknown file extensions with default // pattern", () => {
    const content = ["// comment", "code();"].join("\n");

    const result = analyzeComments("test.xyz", content);
    expect(result.commentLines).toBe(1);
    expect(result.codeLines).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// SLOP_PATTERNS
// ---------------------------------------------------------------------------

describe("SLOP_PATTERNS", () => {
  const slopExamples = [
    "  // This function does something",
    "  // This method handles the request",
    "  // Import dependencies",
    "  // TODO: implement this",
    "  // Set the value to 5",
    "  // Return the result",
    "  // Initialize variables",
    "  // Check if the user is valid",
    "  // Loop through the items",
    "  // Create a new instance",
  ];

  const legitimateExamples = [
    "  // HACK: workaround for upstream bug",
    "  // NOTE: this is intentionally O(n²) for small n",
    "  // See RFC 7231 section 6.5.1",
    "  // Prevents double-free in concurrent access",
    "  // Rate limit: 100 req/s per API docs",
  ];

  for (const example of slopExamples) {
    it(`flags slop: "${example.trim()}"`, () => {
      const matched = SLOP_PATTERNS.some((p) => p.test(example));
      expect(matched).toBe(true);
    });
  }

  for (const example of legitimateExamples) {
    it(`allows legitimate: "${example.trim()}"`, () => {
      const matched = SLOP_PATTERNS.some((p) => p.test(example));
      expect(matched).toBe(false);
    });
  }
});

// ---------------------------------------------------------------------------
// createCommentCheckerHook
// ---------------------------------------------------------------------------

describe("createCommentCheckerHook", () => {
  let ctx: PluginContext;
  let cleanup: () => void;

  beforeEach(() => {
    const env = setupTestEnvironment("comment-checker-hook");
    cleanup = env.cleanup;
    ctx = createMockPluginContext({ testDir: env.testDir });
  });

  afterEach(() => cleanup());

  it("returns Partial<Hooks> with before and after handlers", () => {
    const hooks = createCommentCheckerHook(ctx);
    expect(hooks["tool.execute.before"]).toBeDefined();
    expect(hooks["tool.execute.after"]).toBeDefined();
  });

  it("flags excessive comments on write tool calls", async () => {
    const hooks = createCommentCheckerHook(ctx);
    const callID = "call-1";

    const heavilyCommented = [
      "// Comment 1",
      "// Comment 2",
      "// Comment 3",
      "// Comment 4",
      "const x = 1;",
    ].join("\n");

    await hooks["tool.execute.before"]?.(
      { tool: "write", sessionID: "s1", callID },
      { args: { filePath: "src/test.ts", content: heavilyCommented } },
    );

    const output = { title: "Wrote file", output: "File written successfully", metadata: {} };
    await hooks["tool.execute.after"]?.(
      { tool: "write", sessionID: "s1", callID, args: {} },
      output,
    );

    expect(output.output).toContain("Comment Quality Notice");
    expect(output.output).toContain("threshold");
  });

  it("does not flag clean code", async () => {
    const hooks = createCommentCheckerHook(ctx);
    const callID = "call-2";

    const cleanCode = [
      "const a = 1;",
      "const b = 2;",
      "const c = 3;",
      "const d = 4;",
      "const e = 5;",
    ].join("\n");

    await hooks["tool.execute.before"]?.(
      { tool: "write", sessionID: "s1", callID },
      { args: { filePath: "src/clean.ts", content: cleanCode } },
    );

    const output = { title: "Wrote file", output: "File written successfully", metadata: {} };
    await hooks["tool.execute.after"]?.(
      { tool: "write", sessionID: "s1", callID, args: {} },
      output,
    );

    expect(output.output).not.toContain("Comment Quality Notice");
  });

  it("ignores non-write/edit tools", async () => {
    const hooks = createCommentCheckerHook(ctx);
    const callID = "call-3";

    await hooks["tool.execute.before"]?.(
      { tool: "read", sessionID: "s1", callID },
      { args: { filePath: "src/test.ts" } },
    );

    const output = { title: "Read file", output: "file contents", metadata: {} };
    await hooks["tool.execute.after"]?.(
      { tool: "read", sessionID: "s1", callID, args: {} },
      output,
    );

    expect(output.output).not.toContain("Comment Quality Notice");
  });

  it("ignores excluded file extensions", async () => {
    const hooks = createCommentCheckerHook(ctx);
    const callID = "call-4";

    await hooks["tool.execute.before"]?.(
      { tool: "write", sessionID: "s1", callID },
      { args: { filePath: "README.md", content: "# Lots of markdown\n\n## Comments everywhere" } },
    );

    const output = { title: "Wrote file", output: "File written successfully", metadata: {} };
    await hooks["tool.execute.after"]?.(
      { tool: "write", sessionID: "s1", callID, args: {} },
      output,
    );

    expect(output.output).not.toContain("Comment Quality Notice");
  });

  it("handles mcp_ prefixed tool names", async () => {
    const hooks = createCommentCheckerHook(ctx);
    const callID = "call-5";

    const commented = ["// c1", "// c2", "// c3", "// c4", "code();"].join("\n");

    await hooks["tool.execute.before"]?.(
      { tool: "mcp_Write", sessionID: "s1", callID },
      { args: { filePath: "src/test.ts", content: commented } },
    );

    const output = { title: "Wrote file", output: "File written successfully", metadata: {} };
    await hooks["tool.execute.after"]?.(
      { tool: "mcp_Write", sessionID: "s1", callID, args: {} },
      output,
    );

    expect(output.output).toContain("Comment Quality Notice");
  });

  it("skips analysis when tool execution failed", async () => {
    const hooks = createCommentCheckerHook(ctx);
    const callID = "call-6";

    await hooks["tool.execute.before"]?.(
      { tool: "write", sessionID: "s1", callID },
      { args: { filePath: "src/test.ts", content: "// all comments\n// more" } },
    );

    const output = { title: "Error", output: "Error: file not found", metadata: {} };
    await hooks["tool.execute.after"]?.(
      { tool: "write", sessionID: "s1", callID, args: {} },
      output,
    );

    expect(output.output).not.toContain("Comment Quality Notice");
  });

  it("flags slop comments specifically", async () => {
    const hooks = createCommentCheckerHook(ctx);
    const callID = "call-7";

    const sloppy = [
      "// This function does something",
      "function doSomething() {",
      "  // Return the result",
      "  return 42;",
      "}",
    ].join("\n");

    await hooks["tool.execute.before"]?.(
      { tool: "write", sessionID: "s1", callID },
      { args: { filePath: "src/sloppy.ts", content: sloppy } },
    );

    const output = { title: "Wrote file", output: "File written successfully", metadata: {} };
    await hooks["tool.execute.after"]?.(
      { tool: "write", sessionID: "s1", callID, args: {} },
      output,
    );

    expect(output.output).toContain("low-value comment");
  });

  it("handles edit tool with newString arg", async () => {
    const hooks = createCommentCheckerHook(ctx);
    const callID = "call-8";

    await hooks["tool.execute.before"]?.(
      { tool: "edit", sessionID: "s1", callID },
      { args: { filePath: "src/test.ts", newString: "// lots of comments\ncode();" } },
    );

    const output = { title: "Edited file", output: "File edited successfully", metadata: {} };
    await hooks["tool.execute.after"]?.(
      { tool: "edit", sessionID: "s1", callID, args: {} },
      output,
    );

    expect(output.output).toContain("Comment Quality Notice");
  });

  it("does not throw on errors (safeHandler)", async () => {
    const hooks = createCommentCheckerHook(ctx);

    const output = { title: "test", output: "ok", metadata: {} };
    await hooks["tool.execute.after"]?.(
      { tool: "write", sessionID: "s1", callID: "orphan", args: {} },
      output,
    );

    expect(output.output).toBe("ok");
  });
});

// ---------------------------------------------------------------------------
// commentCheckerFactory
// ---------------------------------------------------------------------------

describe("commentCheckerFactory", () => {
  it("is a valid HookFactory", () => {
    const { testDir, cleanup } = setupTestEnvironment("comment-factory");
    try {
      const ctx = createMockPluginContext({ testDir });
      const hooks = commentCheckerFactory(ctx);
      expect(hooks["tool.execute.before"]).toBeDefined();
      expect(hooks["tool.execute.after"]).toBeDefined();
    } finally {
      cleanup();
    }
  });
});
