import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

import { setupTestEnvironment, withMockedFetch } from "../../test-utils.js";
import { RequestError, buildBody, buildHeaders, sendRequest } from "./request.js";
import type { GenerateOptions } from "./types.js";
import { validateGenerateOptions } from "./validate.js";

describe("buildHeaders", () => {
  it("produces exactly four header keys", () => {
    const headers = buildHeaders("test-token");
    expect(Object.keys(headers)).toEqual(["Authorization", "Accept", "Content-Type", "User-Agent"]);
  });

  it("sets the expected values", () => {
    const headers = buildHeaders("test-token");
    expect(headers.Authorization).toBe("Bearer test-token");
    expect(headers.Accept).toBe("text/event-stream");
    expect(headers["Content-Type"]).toBe("application/json");
    expect(headers["User-Agent"]).toMatch(/^@goopspec\/opencode-plugin\/\d/);
  });
});

describe("buildBody", () => {
  let testDir: string;
  let cleanup: () => void;

  beforeEach(() => {
    const env = setupTestEnvironment("generate-image-request");
    testDir = env.testDir;
    cleanup = env.cleanup;
  });

  afterEach(() => cleanup());

  async function validated(raw: GenerateOptions) {
    const { options } = await validateGenerateOptions(raw);
    return options;
  }

  it("produces the default responses model and stream/store flags", async () => {
    const body = await buildBody(await validated({ prompt: "a red circle" }));
    expect(body.model).toBe("gpt-5.5");
    expect(body.stream).toBe(true);
    expect(body.store).toBe(false);
    expect(body.instructions).toBe("You are an image generation assistant.");
    expect(body.tool_choice).toEqual({ type: "image_generation" });
  });

  it("pairs the image tool model with the responses model in the same body", async () => {
    const body = await buildBody(await validated({ prompt: "a red circle" }));

    // The image tool must carry gpt-image-2 so the Responses API does not
    // silently default image generation to gpt-image-1.
    expect(body.tools[0].model).toBe("gpt-image-2");

    // The top-level model must remain the responses/text model and must not
    // be overwritten by the image model, otherwise text generation breaks.
    expect(body.model).toBe("gpt-5.5");
  });

  it("includes only specified tool fields", async () => {
    const body = await buildBody(
      await validated({
        prompt: "a red circle",
        size: "1024x1024",
        quality: "high",
        outputFormat: "png",
        background: "opaque",
        detail: "high",
        action: "generate",
        moderation: "auto",
      }),
    );

    const tool = body.tools[0];
    expect(tool.type).toBe("image_generation");
    expect(tool.size).toBe("1024x1024");
    expect(tool.quality).toBe("high");
    expect(tool.output_format).toBe("png");
    expect(tool.background).toBe("opaque");
    expect(tool.detail).toBe("high");
    expect(tool.action).toBe("generate");
    expect(tool.moderation).toBe("auto");

    expect(Object.keys(tool)).toEqual([
      "type",
      "model",
      "size",
      "quality",
      "output_format",
      "background",
      "detail",
      "action",
      "moderation",
    ]);
  });

  it("does not emit undefined tool keys", async () => {
    const body = await buildBody(await validated({ prompt: "a red circle" }));
    expect(Object.keys(body.tools[0])).toEqual(["type", "model"]);
  });

  it("wraps input images as data URLs", async () => {
    const path = join(testDir, "ref.png");
    writeFileSync(path, Buffer.from("PNG"));

    const body = await buildBody(
      await validated({
        prompt: "edit this",
        inputImages: [path],
        detail: "high",
      }),
    );

    const content = body.input[0].content;
    expect(content).toHaveLength(2);
    expect(content[0]).toEqual({ type: "input_text", text: "edit this" });
    expect(
      (content[1] as { type: "input_image"; image_url: string; detail?: string }).image_url,
    ).toMatch(/^data:image\/png;base64,/);
    expect((content[1] as { type: "input_image"; image_url: string; detail?: string }).detail).toBe(
      "high",
    );
  });

  it("detects jpeg and webp mime types for input images", async () => {
    const jpegPath = join(testDir, "ref.jpg");
    const webpPath = join(testDir, "ref.webp");
    writeFileSync(jpegPath, Buffer.from("JPEG"));
    writeFileSync(webpPath, Buffer.from("WEBP"));

    const body = await buildBody(
      await validated({
        prompt: "edit these",
        inputImages: [jpegPath, webpPath],
      }),
    );

    const images = body.input[0].content.slice(1) as { type: "input_image"; image_url: string }[];
    expect(images[0].image_url).toMatch(/^data:image\/jpeg;base64,/);
    expect(images[1].image_url).toMatch(/^data:image\/webp;base64,/);
  });

  it("normalizes jpg extension to jpeg", async () => {
    const path = join(testDir, "ref.jpg");
    writeFileSync(path, Buffer.from("JPEG"));

    const body = await buildBody(
      await validated({
        prompt: "edit this",
        inputImages: [path],
      }),
    );

    const images = body.input[0].content.slice(1) as { type: "input_image"; image_url: string }[];
    expect(images[0].image_url).toMatch(/^data:image\/jpeg;base64,/);
  });
});

describe("sendRequest", () => {
  let cleanup: () => void;

  beforeEach(() => {
    const env = setupTestEnvironment("generate-image-request");
    cleanup = env.cleanup;
  });

  afterEach(() => cleanup());

  async function minimalBody() {
    const { options } = await validateGenerateOptions({
      prompt: "a red circle",
    });
    return buildBody(options);
  }

  it("sends a POST with the expected headers and JSON body", async () => {
    await withMockedFetch([{ status: 200, body: "ok" }], async (controls) => {
      const body = await minimalBody();
      const headers = buildHeaders("test-token");
      await sendRequest(body, headers);

      expect(controls.requests).toHaveLength(1);
      expect(controls.requests[0].method).toBe("POST");
      expect(controls.requests[0].headers["content-type"]).toBe("application/json");
      expect(controls.requests[0].headers.accept).toBe("text/event-stream");
      expect(controls.requests[0].headers.authorization).toBe("Bearer test-token");
      expect(controls.requests[0].body).toBe(JSON.stringify(body));
    });
  });

  it("uses the default timeout when none is provided", async () => {
    await withMockedFetch([{ status: 200, body: "ok" }], async (controls) => {
      const body = await minimalBody();
      await sendRequest(body, buildHeaders("test-token"));
      expect(controls.requests[0].url).toBe("https://chatgpt.com/backend-api/codex/responses");
    });
  });

  it("maps 401 to a descriptive error", async () => {
    await withMockedFetch(
      [{ status: 401, body: { error: { message: "bad token" } } }],
      async () => {
        const body = await minimalBody();
        await expect(sendRequest(body, buildHeaders("test-token"))).rejects.toThrow(RequestError);
      },
    );
  });

  it("maps 403 to a descriptive error", async () => {
    await withMockedFetch(
      [{ status: 403, body: { error: { message: "forbidden" } } }],
      async () => {
        const body = await minimalBody();
        const err = await sendRequest(body, buildHeaders("test-token")).catch((e: unknown) => e);
        expect(err).toBeInstanceOf(RequestError);
        expect((err as RequestError).status).toBe(403);
        expect((err as Error).message).toMatch(/forbidden \(HTTP 403\): forbidden/);
      },
    );
  });

  it("maps 429 to a descriptive error", async () => {
    await withMockedFetch(
      [{ status: 429, body: { error: { message: "too many requests" } } }],
      async () => {
        const body = await minimalBody();
        const err = await sendRequest(body, buildHeaders("test-token")).catch((e: unknown) => e);
        expect(err).toBeInstanceOf(RequestError);
        expect((err as RequestError).status).toBe(429);
        expect((err as Error).message).toMatch(/rate-limited \(HTTP 429\)/);
      },
    );
  });

  it("maps 5xx to a descriptive error", async () => {
    await withMockedFetch(
      [{ status: 500, body: { error: { message: "server blew up" } } }],
      async () => {
        const body = await minimalBody();
        const err = await sendRequest(body, buildHeaders("test-token")).catch((e: unknown) => e);
        expect(err).toBeInstanceOf(RequestError);
        expect((err as RequestError).status).toBe(500);
        expect((err as Error).message).toMatch(/server error \(HTTP 500\): server blew up/);
      },
    );
  });

  it("includes body detail from a non-JSON error", async () => {
    await withMockedFetch([{ status: 503, body: "plain text failure" }], async () => {
      const body = await minimalBody();
      const err = await sendRequest(body, buildHeaders("test-token")).catch((e: unknown) => e);
      expect((err as Error).message).toMatch(/plain text failure/);
    });
  });

  it("returns the response for success", async () => {
    await withMockedFetch([{ status: 200, body: "ok" }], async () => {
      const body = await minimalBody();
      const response = await sendRequest(body, buildHeaders("test-token"));
      expect(response.status).toBe(200);
    });
  });
});
