import { describe, it, expect, mock } from "bun:test";
import { createGoopWebSearchTool } from "./index.js";
import type { GoopPiContext, PiEventContext } from "../../core/types.js";

const mockCtx: GoopPiContext = {
  projectDir: "/tmp/test",
  runtime: "pi",
  dbPath: "/tmp/test/.goopspec/goopspec.db",
  goopspecDir: "/tmp/test/.goopspec",
};

const mockPiCtx: PiEventContext = { projectDir: "/tmp/test" };

function noOp() {}

describe("goop_web_search tool", () => {
  it("has correct name and description", () => {
    const tool = createGoopWebSearchTool(mockCtx);
    expect(tool.name).toBe("goop_web_search");
    expect(tool.description).toContain("Brave Search");
  });

  it("returns error when BRAVE_API_KEY is not set", async () => {
    const savedKey = process.env.BRAVE_API_KEY;
    delete process.env.BRAVE_API_KEY;
    try {
      const tool = createGoopWebSearchTool(mockCtx);
      const result = await tool.execute(
        "1",
        { query: "test" },
        new AbortController().signal,
        noOp,
        mockPiCtx,
      );
      expect(result).toContain("BRAVE_API_KEY");
    } finally {
      if (savedKey) process.env.BRAVE_API_KEY = savedKey;
    }
  });

  it("formats results correctly with mocked fetch", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        web: {
          results: [
            {
              title: "Pi Agent",
              url: "https://pi.dev",
              description: "A minimal AI harness",
            },
          ],
        },
        query: { original: "pi agent" },
      }),
    })) as unknown as typeof fetch;

    process.env.BRAVE_API_KEY = "test-key";
    try {
      const tool = createGoopWebSearchTool(mockCtx);
      const result = await tool.execute(
        "1",
        { query: "pi agent" },
        new AbortController().signal,
        noOp,
        mockPiCtx,
      );
      expect(result).toContain("Pi Agent");
      expect(result).toContain("https://pi.dev");
      expect(result).toContain("A minimal AI harness");
      expect(result).toContain("## Web Search Results");
      expect(result).toContain("**Query:** pi agent");
    } finally {
      globalThis.fetch = originalFetch;
      delete process.env.BRAVE_API_KEY;
    }
  });

  it("handles empty results", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        web: { results: [] },
        query: { original: "nonexistent query xyz" },
      }),
    })) as unknown as typeof fetch;

    process.env.BRAVE_API_KEY = "test-key";
    try {
      const tool = createGoopWebSearchTool(mockCtx);
      const result = await tool.execute(
        "1",
        { query: "nonexistent query xyz" },
        new AbortController().signal,
        noOp,
        mockPiCtx,
      );
      expect(result).toContain("No results found");
      expect(result).toContain("nonexistent query xyz");
    } finally {
      globalThis.fetch = originalFetch;
      delete process.env.BRAVE_API_KEY;
    }
  });

  it("includes age when present in results", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        web: {
          results: [
            {
              title: "Recent Article",
              url: "https://example.com",
              description: "Fresh content",
              age: "2 hours ago",
            },
          ],
        },
        query: { original: "recent news" },
      }),
    })) as unknown as typeof fetch;

    process.env.BRAVE_API_KEY = "test-key";
    try {
      const tool = createGoopWebSearchTool(mockCtx);
      const result = await tool.execute(
        "1",
        { query: "recent news" },
        new AbortController().signal,
        noOp,
        mockPiCtx,
      );
      expect(result).toContain("*2 hours ago*");
    } finally {
      globalThis.fetch = originalFetch;
      delete process.env.BRAVE_API_KEY;
    }
  });

  it("handles API error gracefully", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async () => ({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
    })) as unknown as typeof fetch;

    process.env.BRAVE_API_KEY = "bad-key";
    try {
      const tool = createGoopWebSearchTool(mockCtx);
      const result = await tool.execute(
        "1",
        { query: "test" },
        new AbortController().signal,
        noOp,
        mockPiCtx,
      );
      expect(result).toContain("Error");
      expect(result).toContain("401");
    } finally {
      globalThis.fetch = originalFetch;
      delete process.env.BRAVE_API_KEY;
    }
  });

  it("handles network errors gracefully", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async () => {
      throw new Error("Network request failed");
    }) as unknown as typeof fetch;

    process.env.BRAVE_API_KEY = "test-key";
    try {
      const tool = createGoopWebSearchTool(mockCtx);
      const result = await tool.execute(
        "1",
        { query: "test" },
        new AbortController().signal,
        noOp,
        mockPiCtx,
      );
      expect(result).toContain("Error");
      expect(result).toContain("Network request failed");
    } finally {
      globalThis.fetch = originalFetch;
      delete process.env.BRAVE_API_KEY;
    }
  });
});
