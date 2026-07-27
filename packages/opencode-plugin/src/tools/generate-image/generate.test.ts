import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  type PluginContext,
  createMockPluginContext,
  setupTestEnvironment,
  withMockedFetch,
} from "../../test-utils.js";
import { MAX_INPUT_IMAGE_BYTES } from "./constants.js";
import {
  type GenerationResult,
  type PartialFailure,
  deriveDefaultOutputPath,
  encodeInputImage,
  generateImages,
  resolveOutputPath,
  writeImage,
} from "./generate.js";
import type { ValidatedGenerateOptions } from "./validate.js";

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

function minimalOptions(count = 1): ValidatedGenerateOptions {
  return {
    prompt: "a red circle",
    model: "gpt-image-2",
    count,
    inputImages: [],
    timeoutSeconds: 180,
  };
}

describe("encodeInputImage", () => {
  let testDir: string;
  let cleanup: () => void;

  beforeEach(() => {
    const env = setupTestEnvironment("generate-image-encode");
    testDir = env.testDir;
    cleanup = env.cleanup;
  });

  afterEach(() => cleanup());

  it("round-trips bytes and wraps them as a data URL", async () => {
    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    const path = join(testDir, "ref.png");
    writeFileSync(path, bytes);

    const url = await encodeInputImage(path);
    expect(url).toMatch(/^data:image\/png;base64,/);
    const decoded = Buffer.from(url.split(",")[1], "base64");
    expect(decoded.equals(bytes)).toBe(true);
  });

  it("detects image/jpeg for .jpg and .jpeg", async () => {
    const jpgPath = join(testDir, "ref.jpg");
    const jpegPath = join(testDir, "ref.jpeg");
    writeFileSync(jpgPath, Buffer.from("JPEG"));
    writeFileSync(jpegPath, Buffer.from("JPEG"));

    expect(await encodeInputImage(jpgPath)).toMatch(/^data:image\/jpeg;base64,/);
    expect(await encodeInputImage(jpegPath)).toMatch(/^data:image\/jpeg;base64,/);
  });

  it("detects image/webp for .webp", async () => {
    const path = join(testDir, "ref.webp");
    writeFileSync(path, Buffer.from("WEBP"));

    expect(await encodeInputImage(path)).toMatch(/^data:image\/webp;base64,/);
  });

  it("defaults to image/png for unknown extensions", async () => {
    const path = join(testDir, "ref.bmp");
    writeFileSync(path, Buffer.from("BMP"));

    expect(await encodeInputImage(path)).toMatch(/^data:image\/png;base64,/);
  });

  it("rejects a file over 64 MiB", async () => {
    const path = join(testDir, "big.png");
    writeFileSync(path, Buffer.alloc(MAX_INPUT_IMAGE_BYTES + 1));

    await expect(encodeInputImage(path)).rejects.toThrow(/exceeds 64 MiB/);
  });

  it("rejects a missing file with a clear message", async () => {
    await expect(encodeInputImage(join(testDir, "missing.png"))).rejects.toThrow(
      /Cannot read input image/,
    );
  });
});

describe("writeImage", () => {
  let testDir: string;
  let cleanup: () => void;

  beforeEach(() => {
    const env = setupTestEnvironment("generate-image-write");
    testDir = env.testDir;
    cleanup = env.cleanup;
  });

  afterEach(() => cleanup());

  it("decodes base64 and creates parent directories", () => {
    const payload = Buffer.from("PNG payload").toString("base64");
    const path = join(testDir, "nested", "deep", "out.png");

    writeImage(path, { base64: payload });

    expect(existsSync(path)).toBe(true);
    expect(readFileSync(path).toString()).toBe("PNG payload");
  });
});

describe("output path helpers", () => {
  let testDir: string;
  let cleanup: () => void;

  beforeEach(() => {
    const env = setupTestEnvironment("generate-image-paths");
    testDir = env.testDir;
    cleanup = env.cleanup;
  });

  afterEach(() => cleanup());

  it("derives a default path under .goopspec/generated-images", () => {
    const path = deriveDefaultOutputPath(testDir, "A titanium ring", "png", undefined, 12345);
    expect(path).toBe(join(testDir, ".goopspec", "generated-images", "a-titanium-ring-12345.png"));
  });

  it("slugifies non-ASCII and long prompts", () => {
    const path = deriveDefaultOutputPath(
      testDir,
      "un café très chaud avec beaucoup de détails incroyables",
      "jpeg",
    );
    expect(path).toMatch(/un-caf-tr-s-chaud-.*-[0-9]+\.jpeg$/);
    expect(path.startsWith(join(testDir, ".goopspec", "generated-images"))).toBe(true);
  });

  it("adds an index suffix when count > 1", () => {
    const path = deriveDefaultOutputPath(testDir, "a red circle", "png", 2, 12345);
    expect(path).toBe(join(testDir, ".goopspec", "generated-images", "a-red-circle-12345-2.png"));
  });

  it("resolves relative paths against projectDir", () => {
    expect(resolveOutputPath(testDir, "out/image.png")).toBe(join(testDir, "out", "image.png"));
  });

  it("preserves absolute paths", () => {
    const absolute = "/tmp/out/image.png";
    expect(resolveOutputPath(testDir, absolute)).toBe(absolute);
  });
});

describe("generateImages count loop", () => {
  let ctx: PluginContext;
  let cleanup: () => void;

  beforeEach(() => {
    const env = setupTestEnvironment("generate-image-loop");
    cleanup = env.cleanup;
    ctx = createMockPluginContext({ testDir: env.testDir });
  });

  afterEach(() => cleanup());

  it("writes one image from a single mocked request", async () => {
    const payload = Buffer.from("image one").toString("base64");

    await withMockedFetch(
      [{ status: 200, body: primaryStream(payload, "revised prompt") }],
      async () => {
        const result = await generateImages(ctx.sdk.directory, undefined, {
          accessToken: "token",
          options: minimalOptions(),
          timeoutSeconds: 180,
        });

        expect(result.paths).toHaveLength(1);
        expect(existsSync(result.paths[0])).toBe(true);
        expect(readFileSync(result.paths[0]).toString()).toBe("image one");
        expect((result as GenerationResult).revisedPrompt).toBe("revised prompt");
      },
    );
  });

  it("sends three separate requests for count=3 and names files -1, -2, -3", async () => {
    const payloads = [
      Buffer.from("first").toString("base64"),
      Buffer.from("second").toString("base64"),
      Buffer.from("third").toString("base64"),
    ];

    await withMockedFetch(
      [
        { status: 200, body: primaryStream(payloads[0], "first") },
        { status: 200, body: primaryStream(payloads[1], "second") },
        { status: 200, body: primaryStream(payloads[2], "third") },
      ],
      async (controls) => {
        const result = await generateImages(ctx.sdk.directory, undefined, {
          accessToken: "token",
          options: minimalOptions(3),
          timeoutSeconds: 180,
        });

        expect(controls.requests).toHaveLength(3);
        expect(result.paths).toHaveLength(3);
        expect(result.paths[0]).toMatch(/a-red-circle-[0-9]+\.png$/);
        expect(result.paths[1]).toMatch(/a-red-circle-[0-9]+-2\.png$/);
        expect(result.paths[2]).toMatch(/a-red-circle-[0-9]+-3\.png$/);

        for (let i = 0; i < 3; i++) {
          expect(readFileSync(result.paths[i]).toString()).toBe(["first", "second", "third"][i]);
        }
      },
    );
  });

  it("reports the already-written path when request 2 of 3 fails", async () => {
    const firstPayload = Buffer.from("first").toString("base64");

    await withMockedFetch(
      [
        { status: 200, body: primaryStream(firstPayload) },
        { status: 429, body: { error: { message: "rate limit hit" } } },
      ],
      async () => {
        const result = await generateImages(ctx.sdk.directory, undefined, {
          accessToken: "token",
          options: minimalOptions(3),
          timeoutSeconds: 180,
        });

        expect(result.paths).toHaveLength(1);
        expect(existsSync(result.paths[0])).toBe(true);
        expect((result as PartialFailure).partial).toBe(true);
        expect((result as PartialFailure).error.message).toMatch(/rate-limited/);
      },
    );
  });

  it("uses the explicit output path and suffixes for count > 1", async () => {
    const payload = Buffer.from("explicit").toString("base64");

    await withMockedFetch(
      [
        { status: 200, body: primaryStream(payload) },
        { status: 200, body: primaryStream(payload) },
      ],
      async () => {
        const result = await generateImages(ctx.sdk.directory, "out/my-image.webp", {
          accessToken: "token",
          options: minimalOptions(2),
          timeoutSeconds: 180,
        });

        expect(result.paths[0]).toBe(join(ctx.sdk.directory, "out", "my-image-1.webp"));
        expect(result.paths[1]).toBe(join(ctx.sdk.directory, "out", "my-image-2.webp"));
      },
    );
  });

  it("fails fast when count=1 fails with no partial state", async () => {
    await withMockedFetch(
      [{ status: 500, body: { error: { message: "server error" } } }],
      async () => {
        const result = await generateImages(ctx.sdk.directory, undefined, {
          accessToken: "token",
          options: minimalOptions(),
          timeoutSeconds: 180,
        });

        expect(result.paths).toHaveLength(0);
        expect((result as PartialFailure).partial).toBe(true);
        expect((result as PartialFailure).error.message).toMatch(/server error/);
      },
    );
  });
});
