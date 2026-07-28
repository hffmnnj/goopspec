/**
 * MCP tool contract tests for generate_image.
 *
 * Every execute path must return a non-empty descriptive string and never throw.
 * Credential resolution is sandboxed to a temp home directory so tests never
 * read a real home-directory auth path; all network traffic is mocked.
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import type { ToolDefinition } from "../../core/sdk-compat.js";
import {
  type PluginContext,
  createMockPluginContext,
  createMockToolContext,
  setupTestEnvironment,
  withMockedFetch,
} from "../../test-utils.js";
import { createGenerateImageTool } from "./index.js";
import { encodePng } from "./png-codec.js";
import type { GenerateImageArgs } from "./types.js";

const ACCESS_TOKEN = "fake-access-token-value";
const REFRESH_TOKEN = "fake-refresh-token-value";

async function run(tool: ToolDefinition, args: GenerateImageArgs): Promise<string> {
  return (await tool.execute(
    args as unknown as Record<string, unknown>,
    createMockToolContext(),
  )) as string;
}

function frame(event: Record<string, unknown>): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

function imageItemDone(result: string, revisedPrompt?: string): Record<string, unknown> {
  const item: Record<string, unknown> = { type: "image_generation_call", result };
  if (revisedPrompt !== undefined) {
    item.revised_prompt = revisedPrompt;
  }
  return { type: "response.output_item.done", item };
}

function primaryStream(result: string, revisedPrompt?: string): string {
  return [
    frame({ type: "response.created", response: { id: "resp_1" } }),
    frame(imageItemDone(result, revisedPrompt)),
    frame({ type: "response.completed", response: { output: [] } }),
    "data: [DONE]\n\n",
  ].join("");
}

function baseArgs(authFile?: string): {
  prompt: string;
  size: string;
  authFile?: string;
} {
  return {
    prompt: "a red circle on a white background",
    size: "1024x1024",
    authFile,
  };
}

function writeAuthFile(path: string, accessToken: string, expiresAtMs = 4102444800000): void {
  mkdirSync(join(path, ".."), { recursive: true });
  const content = JSON.stringify({
    openai: {
      type: "oauth",
      access: accessToken,
      refresh: REFRESH_TOKEN,
      expires: expiresAtMs,
      accountId: "account-test",
    },
  });
  writeFileSync(path, content, "utf-8");
}

describe("createGenerateImageTool", () => {
  let ctx: PluginContext;
  let testDir: string;
  let cleanup: () => void;
  let realHome: string;

  beforeEach(() => {
    const env = setupTestEnvironment("generate-image-tool");
    testDir = env.testDir;
    cleanup = env.cleanup;
    ctx = createMockPluginContext({ testDir });

    realHome = homedir();
    const sandboxHome = join(testDir, "home");
    mkdirSync(sandboxHome, { recursive: true });

    process.env.HOME = sandboxHome;
    process.env.XDG_DATA_HOME = undefined;
    process.env.GOOPSPEC_IMAGE_AUTH_FILE = undefined;
  });

  afterEach(() => {
    process.env.HOME = realHome;
    cleanup();
  });

  it("dry-run returns the request shape with a redacted bearer token and writes nothing", async () => {
    const authPath = join(testDir, "auth.json");
    writeAuthFile(authPath, ACCESS_TOKEN);

    const result = await run(createGenerateImageTool(ctx), {
      ...baseArgs(authPath),
      dryRun: true,
      outputCompression: 80,
      mask: "mask.png",
    });

    expect(result.length).toBeGreaterThan(0);
    expect(result).not.toContain(ACCESS_TOKEN);
    expect(result).not.toContain(REFRESH_TOKEN);
    expect(result).toContain("token[length=30,shape=opaque]");
    expect(result).toContain('"Authorization": "token[');
    expect(result).toContain("POST https://chatgpt.com/backend-api/codex/responses");
    expect(result).toContain('"size": "1024x1024"');
    expect(result).toContain("Dry run: request not sent.");

    expect(result).not.toMatch(/written to/i);
    expect(existsSync(join(testDir, ".goopspec", "generated-images"))).toBe(false);
  });

  it("returns an auth error when no credential is found without throwing", async () => {
    const missingAuthPath = join(testDir, "missing-auth.json");
    const result = await run(createGenerateImageTool(ctx), baseArgs(missingAuthPath));

    expect(result.length).toBeGreaterThan(0);
    expect(result).toMatch(/auth error/i);
    expect(result).toContain("No usable ChatGPT OAuth credential");
  });

  it("returns an auth error when the credential is expired and refresh is not allowed", async () => {
    const authPath = join(testDir, "expired-auth.json");
    writeAuthFile(authPath, ACCESS_TOKEN, 0);

    const result = await run(createGenerateImageTool(ctx), baseArgs(authPath));

    expect(result.length).toBeGreaterThan(0);
    expect(result).toMatch(/auth error/i);
    expect(result).toMatch(/expired/i);
  });

  it("returns a network error when the request cannot reach the backend", async () => {
    const authPath = join(testDir, "auth.json");
    writeAuthFile(authPath, ACCESS_TOKEN);

    const result = await withMockedFetch([], async () => {
      return run(createGenerateImageTool(ctx), baseArgs(authPath));
    });

    expect(result.length).toBeGreaterThan(0);
    expect(result).toMatch(/network/i);
  });

  it("returns a timeout error when the backend does not respond in time", async () => {
    const authPath = join(testDir, "auth.json");
    writeAuthFile(authPath, ACCESS_TOKEN);

    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      await Promise.resolve();
      throw new DOMException("The operation timed out.", "TimeoutError");
    }) as unknown as typeof globalThis.fetch;

    const tool = createGenerateImageTool(ctx);
    let result: string;
    try {
      result = await run(tool, baseArgs(authPath));
    } finally {
      globalThis.fetch = originalFetch;
    }

    expect(result.length).toBeGreaterThan(0);
    expect(result).toMatch(/timeout/i);
    expect(result).not.toMatch(/partial success/i);
  });

  it("returns an HTTP error for a 429 response", async () => {
    const authPath = join(testDir, "auth.json");
    writeAuthFile(authPath, ACCESS_TOKEN);

    const result = await withMockedFetch(
      [{ status: 429, body: { error: { message: "rate limit hit" } } }],
      async () => run(createGenerateImageTool(ctx), baseArgs(authPath)),
    );

    expect(result.length).toBeGreaterThan(0);
    expect(result).toMatch(/rate-limited/i);
    expect(result).toContain("rate limit hit");
  });

  it("returns an HTTP error for a 500 response", async () => {
    const authPath = join(testDir, "auth.json");
    writeAuthFile(authPath, ACCESS_TOKEN);

    const result = await withMockedFetch(
      [{ status: 500, body: { error: { message: "upstream server error" } } }],
      async () => run(createGenerateImageTool(ctx), baseArgs(authPath)),
    );

    expect(result.length).toBeGreaterThan(0);
    expect(result).toMatch(/server error/i);
    expect(result).toContain("upstream server error");
  });

  it("returns a stream error with moderation details for a backend refusal", async () => {
    const authPath = join(testDir, "auth.json");
    writeAuthFile(authPath, ACCESS_TOKEN);

    const body = frame({
      type: "response.failed",
      error: {
        message: "Your request was blocked by our moderation system.",
        code: "moderation_blocked",
        moderation_details: {
          moderation_stage: "output",
          categories: ["violence", "self_harm"],
        },
      },
    });

    const result = await withMockedFetch([{ status: 200, body }], async () => {
      return run(createGenerateImageTool(ctx), baseArgs(authPath));
    });

    expect(result.length).toBeGreaterThan(0);
    expect(result).toMatch(/stream error/i);
    expect(result).toContain("stage: output");
    expect(result).toContain("violence");
    expect(result).toContain("self_harm");
  });

  it("reports already-written paths alongside a partial failure", async () => {
    const authPath = join(testDir, "auth.json");
    writeAuthFile(authPath, ACCESS_TOKEN);

    const firstPayload = Buffer.from("first image").toString("base64");

    const result = await withMockedFetch(
      [
        { status: 200, body: primaryStream(firstPayload) },
        { status: 500, body: { error: { message: "generation failed mid-batch" } } },
      ],
      async () =>
        run(createGenerateImageTool(ctx), {
          ...baseArgs(authPath),
          out: "out/generated.png",
          count: 2,
        }),
    );

    expect(result.length).toBeGreaterThan(0);
    expect(result).toMatch(/partial success/i);

    const expectedFirstPath = join(testDir, "out", "generated-1.png");
    expect(existsSync(expectedFirstPath)).toBe(true);
    expect(readFileSync(expectedFirstPath).toString()).toBe("first image");
    expect(result).toContain(expectedFirstPath);
    expect(result).toMatch(/server error/i);
    expect(result).toContain("generation failed mid-batch");
  });

  it("returns a full success result with paths, model, and revised prompt", async () => {
    const authPath = join(testDir, "auth.json");
    writeAuthFile(authPath, ACCESS_TOKEN);

    const payload = Buffer.from("final image").toString("base64");

    const result = await withMockedFetch(
      [{ status: 200, body: primaryStream(payload, "a red circle, centered") }],
      async () =>
        run(createGenerateImageTool(ctx), {
          ...baseArgs(authPath),
          out: "out/final.png",
        }),
    );

    expect(result.length).toBeGreaterThan(0);

    const expectedPath = join(testDir, "out", "final.png");
    expect(existsSync(expectedPath)).toBe(true);
    expect(readFileSync(expectedPath).toString()).toBe("final image");

    expect(result).toContain(expectedPath);
    expect(result).toContain("gpt-image-2");
    expect(result).toContain("Revised prompt: a red circle, centered");
  });

  it("surfaces a Transparency line quoting the appended green-screen instruction for a transparent request", async () => {
    const authPath = join(testDir, "auth.json");
    writeAuthFile(authPath, ACCESS_TOKEN);

    const source = encodePng({
      width: 2,
      height: 1,
      data: Uint8Array.from([
        0,
        255,
        0,
        255, // Green screen
        255,
        0,
        0,
        255, // Red subject
      ]),
    });

    const result = await withMockedFetch(
      [{ status: 200, body: primaryStream(source.toString("base64")) }],
      async () =>
        run(createGenerateImageTool(ctx), {
          ...baseArgs(authPath),
          background: "transparent",
          out: "out/transparent.png",
        }),
    );

    expect(result).toContain("Transparency:");
    expect(result).toContain("gpt-image-2 has no native transparent background");
    expect(result).toContain("rendered on a green screen and keyed to alpha locally");
    expect(result).toContain("Render the subject on a uniform, fully saturated green background");
    expect(result).toContain("Produce no shadows, no contact shadows, and no reflections");
    expect(result).toContain("Avoid green spill or green light bouncing onto the subject");
    expect(result).not.toContain("Warnings:");
  });

  it("omits the Transparency line for a non-transparent request", async () => {
    const authPath = join(testDir, "auth.json");
    writeAuthFile(authPath, ACCESS_TOKEN);

    const payload = Buffer.from("opaque image").toString("base64");

    const result = await withMockedFetch(
      [{ status: 200, body: primaryStream(payload) }],
      async () =>
        run(createGenerateImageTool(ctx), {
          ...baseArgs(authPath),
          background: "opaque",
          out: "out/opaque.png",
        }),
    );

    expect(result).not.toContain("Transparency:");
    expect(result).not.toContain("green screen");
  });

  it("surfaces keying warnings in the success result", async () => {
    const authPath = join(testDir, "auth.json");
    writeAuthFile(authPath, ACCESS_TOKEN);

    const source = Buffer.from("not a PNG");

    const result = await withMockedFetch(
      [{ status: 200, body: primaryStream(source.toString("base64")) }],
      async () =>
        run(createGenerateImageTool(ctx), {
          ...baseArgs(authPath),
          background: "transparent",
          out: "out/green.png",
        }),
    );

    expect(result).toContain("Warnings:");
    expect(result).toContain("green-screen keying failed");
    expect(result).toContain("still green rather than transparent");
  });

  it("surfaces keying warnings in the partial-failure result", async () => {
    const authPath = join(testDir, "auth.json");
    writeAuthFile(authPath, ACCESS_TOKEN);

    const source = Buffer.from("not a PNG");

    const result = await withMockedFetch(
      [
        { status: 200, body: primaryStream(source.toString("base64")) },
        { status: 500, body: { error: { message: "server error mid-batch" } } },
      ],
      async () =>
        run(createGenerateImageTool(ctx), {
          ...baseArgs(authPath),
          background: "transparent",
          out: "out/batch.png",
          count: 2,
        }),
    );

    expect(result).toMatch(/partial success/i);
    expect(result).toContain("Warnings:");
    expect(result).toContain("green-screen keying failed");
    expect(result).toContain("server error mid-batch");
  });

  it("rejects transparent background with jpeg output and names png in the error", async () => {
    const authPath = join(testDir, "auth.json");
    writeAuthFile(authPath, ACCESS_TOKEN);

    const result = await run(createGenerateImageTool(ctx), {
      ...baseArgs(authPath),
      background: "transparent",
      outputFormat: "jpeg",
    });

    expect(result).toMatch(/validation error/i);
    expect(result).toMatch(/transparent background requires png/i);
    expect(result).toContain("png");
  });

  it("rejects transparent background with webp output and names png in the error", async () => {
    const authPath = join(testDir, "auth.json");
    writeAuthFile(authPath, ACCESS_TOKEN);

    const result = await run(createGenerateImageTool(ctx), {
      ...baseArgs(authPath),
      background: "transparent",
      outputFormat: "webp",
    });

    expect(result).toMatch(/validation error/i);
    expect(result).toMatch(/transparent background requires png/i);
    expect(result).toContain("png");
  });

  it("rejects a transparent request with a .webp out path before any network call", async () => {
    const authPath = join(testDir, "auth.json");
    writeAuthFile(authPath, ACCESS_TOKEN);

    const result = await withMockedFetch([], async (controls) => {
      const r = await run(createGenerateImageTool(ctx), {
        ...baseArgs(authPath),
        background: "transparent",
        out: "logo.webp",
      });
      expect(controls.requests.length).toBe(0);
      return r;
    });

    expect(result).toMatch(/validation error/i);
    expect(result).toContain("png");
    expect(result).toContain(".webp");
  });

  it("rejects a transparent request with a .jpg out path before any network call", async () => {
    const authPath = join(testDir, "auth.json");
    writeAuthFile(authPath, ACCESS_TOKEN);

    const result = await withMockedFetch([], async (controls) => {
      const r = await run(createGenerateImageTool(ctx), {
        ...baseArgs(authPath),
        background: "transparent",
        out: "logo.jpg",
      });
      expect(controls.requests.length).toBe(0);
      return r;
    });

    expect(result).toMatch(/validation error/i);
    expect(result).toContain("png");
  });

  it("accepts a transparent request with a .png out path", async () => {
    const authPath = join(testDir, "auth.json");
    writeAuthFile(authPath, ACCESS_TOKEN);

    const result = await withMockedFetch([], async (controls) => {
      const r = await run(createGenerateImageTool(ctx), {
        ...baseArgs(authPath),
        background: "transparent",
        out: "logo.png",
        dryRun: true,
      });
      expect(controls.requests.length).toBe(0);
      return r;
    });

    expect(result).toContain("Dry run");
    expect(result).not.toMatch(/validation error/i);
  });

  it("accepts a transparent request with an extensionless out path", async () => {
    const authPath = join(testDir, "auth.json");
    writeAuthFile(authPath, ACCESS_TOKEN);

    const result = await withMockedFetch([], async (controls) => {
      const r = await run(createGenerateImageTool(ctx), {
        ...baseArgs(authPath),
        background: "transparent",
        out: "logo",
        dryRun: true,
      });
      expect(controls.requests.length).toBe(0);
      return r;
    });

    expect(result).toContain("Dry run");
    expect(result).not.toMatch(/validation error/i);
  });

  it("accepts a non-transparent request with a .webp out path (fix does not leak)", async () => {
    const authPath = join(testDir, "auth.json");
    writeAuthFile(authPath, ACCESS_TOKEN);

    const result = await withMockedFetch([], async (controls) => {
      const r = await run(createGenerateImageTool(ctx), {
        ...baseArgs(authPath),
        background: "opaque",
        out: "logo.webp",
        dryRun: true,
      });
      expect(controls.requests.length).toBe(0);
      return r;
    });

    expect(result).toContain("Dry run");
    expect(result).not.toMatch(/validation error/i);
  });
});
