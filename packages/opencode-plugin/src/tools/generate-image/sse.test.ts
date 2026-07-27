import { describe, expect, it } from "bun:test";

import { withMockedFetch } from "../../test-utils.js";
import { StreamError, describeStreamError, readImageStream } from "./sse.js";
import type { ExtractedImage } from "./types.js";

const SSE_URL = "https://chatgpt.com/backend-api/codex/responses";

/** 200 base64 characters, long enough to be cut at an interior offset. */
const IMAGE_B64 = Buffer.from("x".repeat(150)).toString("base64");

const SECOND_IMAGE_B64 = Buffer.from("y".repeat(90)).toString("base64");

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

function completedWith(...output: Record<string, unknown>[]): Record<string, unknown> {
  return { type: "response.completed", response: { output } };
}

function primaryStream(): string {
  return [
    frame({ type: "response.created", response: { id: "resp_1" } }),
    frame({ type: "response.in_progress" }),
    frame(imageItemDone(IMAGE_B64, "a titanium smart ring on dark marble")),
    frame({ type: "response.completed", response: { output: [] } }),
    "data: [DONE]\n\n",
  ].join("");
}

async function readStream(body: string | string[]): Promise<ExtractedImage[]> {
  return withMockedFetch([{ status: 200, body }], async () => {
    const response = await fetch(SSE_URL);
    return readImageStream(response);
  });
}

async function readStreamError(body: string | string[]): Promise<unknown> {
  return withMockedFetch([{ status: 200, body }], async () => {
    const response = await fetch(SSE_URL);
    return readImageStream(response).then(
      () => new Error("expected readImageStream to reject"),
      (error: unknown) => error,
    );
  });
}

describe("readImageStream primary extraction", () => {
  it("extracts the image and revised prompt from response.output_item.done", async () => {
    const images = await readStream(primaryStream());

    expect(images).toEqual([
      { base64: IMAGE_B64, revisedPrompt: "a titanium smart ring on dark marble" },
    ]);
  });

  it("omits revisedPrompt when the backend does not supply one", async () => {
    const images = await readStream(frame(imageItemDone(IMAGE_B64)));

    expect(images).toHaveLength(1);
    expect(images[0].base64).toBe(IMAGE_B64);
    expect(images[0].revisedPrompt).toBeUndefined();
  });

  it("returns result as raw base64 without stripping a data-URL prefix", async () => {
    const prefixed = `data:image/png;base64,${IMAGE_B64}`;
    const images = await readStream(frame(imageItemDone(prefixed)));

    expect(images[0].base64).toBe(prefixed);
  });

  it("ignores output items that are not image_generation_call", async () => {
    const body = [
      frame({ type: "response.output_item.done", item: { type: "message", content: [] } }),
      frame(imageItemDone(IMAGE_B64)),
    ].join("");

    const images = await readStream(body);

    expect(images).toEqual([{ base64: IMAGE_B64 }]);
  });

  it("ignores an image item with a missing or empty result", async () => {
    const body = [
      frame({ type: "response.output_item.done", item: { type: "image_generation_call" } }),
      frame(imageItemDone("")),
      frame(imageItemDone(IMAGE_B64)),
    ].join("");

    expect(await readStream(body)).toEqual([{ base64: IMAGE_B64 }]);
  });

  it("returns multiple primary images in stream order", async () => {
    const body = [
      frame(imageItemDone(IMAGE_B64, "first")),
      frame(imageItemDone(SECOND_IMAGE_B64, "second")),
    ].join("");

    expect(await readStream(body)).toEqual([
      { base64: IMAGE_B64, revisedPrompt: "first" },
      { base64: SECOND_IMAGE_B64, revisedPrompt: "second" },
    ]);
  });
});

describe("readImageStream fallback extraction", () => {
  it("extracts from response.completed output when no output_item.done arrived", async () => {
    const body = [
      frame({ type: "response.created", response: { id: "resp_2" } }),
      frame(
        completedWith({
          type: "image_generation_call",
          result: IMAGE_B64,
          revised_prompt: "a fallback render",
        }),
      ),
      "data: [DONE]\n\n",
    ].join("");

    expect(await readStream(body)).toEqual([
      { base64: IMAGE_B64, revisedPrompt: "a fallback render" },
    ]);
  });

  it("collects every image entry in the completed output array", async () => {
    const body = frame(
      completedWith(
        { type: "message", content: [] },
        { type: "image_generation_call", result: IMAGE_B64 },
        { type: "image_generation_call", result: SECOND_IMAGE_B64 },
      ),
    );

    expect(await readStream(body)).toEqual([{ base64: IMAGE_B64 }, { base64: SECOND_IMAGE_B64 }]);
  });

  it("prefers the primary pass and does not duplicate the fallback entry", async () => {
    const body = [
      frame(imageItemDone(IMAGE_B64, "primary wins")),
      frame(
        completedWith({
          type: "image_generation_call",
          result: IMAGE_B64,
          revised_prompt: "fallback copy",
        }),
      ),
    ].join("");

    expect(await readStream(body)).toEqual([{ base64: IMAGE_B64, revisedPrompt: "primary wins" }]);
  });

  it("tolerates a completed event with a non-array output", async () => {
    const body = [
      frame({ type: "response.completed", response: { output: "unexpected" } }),
      frame(imageItemDone(IMAGE_B64)),
    ].join("");

    expect(await readStream(body)).toEqual([{ base64: IMAGE_B64 }]);
  });
});

describe("readImageStream framing", () => {
  it("produces an identical result when a payload is split across three chunks", async () => {
    const full = primaryStream();
    const resultIndex = full.indexOf(IMAGE_B64);
    const promptIndex = full.indexOf('"revised_prompt"');

    // Cut inside the base64 payload, then inside a JSON key name.
    const cutA = resultIndex + 37;
    const cutB = promptIndex + 9;
    const chunks = [full.slice(0, cutA), full.slice(cutA, cutB), full.slice(cutB)];

    expect(chunks).toHaveLength(3);
    expect(chunks.join("")).toBe(full);
    for (const cut of [cutA, cutB]) {
      expect(full.slice(cut - 1, cut + 1)).not.toContain("\n");
    }
    for (const chunk of chunks) {
      expect(chunk.length).toBeGreaterThan(0);
    }

    expect(await readStream(chunks)).toEqual(await readStream(full));
  });

  it("reassembles a frame split immediately before its boundary newlines", async () => {
    const full = frame(imageItemDone(IMAGE_B64, "boundary split"));
    const chunks = [full.slice(0, full.length - 2), "\n", "\n"];

    expect(await readStream(chunks)).toEqual([
      { base64: IMAGE_B64, revisedPrompt: "boundary split" },
    ]);
  });

  it("delivers a frame arriving one character at a time", async () => {
    const chunks = frame(imageItemDone(SECOND_IMAGE_B64)).split("");

    expect(await readStream(chunks)).toEqual([{ base64: SECOND_IMAGE_B64 }]);
  });

  it("parses a final frame that lacks a trailing blank line", async () => {
    const body = `data: ${JSON.stringify(imageItemDone(IMAGE_B64, "unterminated"))}`;

    expect(await readStream(body)).toEqual([{ base64: IMAGE_B64, revisedPrompt: "unterminated" }]);
  });

  it("handles CRLF frame boundaries", async () => {
    const body = [
      `data: ${JSON.stringify({ type: "response.created" })}\r\n\r\n`,
      `data: ${JSON.stringify(imageItemDone(IMAGE_B64))}\r\n\r\n`,
      "data: [DONE]\r\n\r\n",
    ].join("");

    expect(await readStream(body)).toEqual([{ base64: IMAGE_B64 }]);
  });

  it("joins multiple data lines within one event block", async () => {
    const payload = JSON.stringify(imageItemDone(IMAGE_B64, "multi-line data"));
    // Split between JSON members, where the joining newline is insignificant
    // whitespace. A split inside a string literal would be invalid JSON.
    const split = payload.indexOf('"item"');
    expect(split).toBeGreaterThan(0);
    const body = `data: ${payload.slice(0, split)}\ndata: ${payload.slice(split)}\n\n`;

    expect(await readStream(body)).toEqual([
      { base64: IMAGE_B64, revisedPrompt: "multi-line data" },
    ]);
  });

  it("skips comment lines, non-data fields, and the [DONE] sentinel", async () => {
    const body = [
      ": keep-alive\n\n",
      `event: response.output_item.done\nid: 42\ndata: ${JSON.stringify(imageItemDone(IMAGE_B64))}\n\n`,
      "data:[DONE]\n\n",
    ].join("");

    expect(await readStream(body)).toEqual([{ base64: IMAGE_B64 }]);
  });

  it("preserves non-ASCII text in a revised prompt", async () => {
    const prompt = "un café très chaud ☕";
    const images = await readStream(frame(imageItemDone(IMAGE_B64, prompt)));

    expect(images[0].revisedPrompt).toBe(prompt);
  });

  it("continues past a malformed frame and still yields a later image", async () => {
    const body = [
      frame({ type: "response.created" }),
      'data: {"type":"response.output_item.done","item":{"result":\n\n',
      "data: not json at all\n\n",
      "data: [1,2,3]\n\n",
      frame(imageItemDone(IMAGE_B64, "survived the garbage")),
      "data: [DONE]\n\n",
    ].join("");

    expect(await readStream(body)).toEqual([
      { base64: IMAGE_B64, revisedPrompt: "survived the garbage" },
    ]);
  });

  it("rejects when the response has no body", async () => {
    const error = await withMockedFetch([{ status: 200 }], async () => {
      const response = await fetch(SSE_URL);
      return readImageStream(response).then(
        () => undefined,
        (thrown: unknown) => thrown,
      );
    });

    expect(error).toBeInstanceOf(StreamError);
    expect((error as StreamError).message).toMatch(/empty response body/);
  });

  it("rejects when the stream ends without an image", async () => {
    const body = [
      frame({ type: "response.created" }),
      frame({ type: "response.completed", response: { output: [] } }),
      "data: [DONE]\n\n",
    ].join("");

    const error = await readStreamError(body);

    expect(error).toBeInstanceOf(StreamError);
    expect((error as StreamError).message).toMatch(/without returning an image/);
  });
});

describe("readImageStream error events", () => {
  it("surfaces a response.failed message and code verbatim", async () => {
    const body = [
      frame({ type: "response.created" }),
      frame({
        type: "response.failed",
        error: { message: "Content policy violation", code: "moderation_refusal" },
      }),
    ].join("");

    const error = await readStreamError(body);

    expect(error).toBeInstanceOf(StreamError);
    expect((error as StreamError).message).toBe("Content policy violation");
    expect((error as StreamError).code).toBe("moderation_refusal");
  });

  it("surfaces a bare error event carrying a top-level message", async () => {
    const error = await readStreamError(frame({ type: "error", message: "upstream disconnected" }));

    expect((error as StreamError).message).toBe("upstream disconnected");
    expect((error as StreamError).code).toBeUndefined();
  });

  it("reads error detail nested under response.error", async () => {
    const body = frame({
      type: "response.failed",
      response: { error: { message: "generation aborted", code: "server_error" } },
    });

    const error = await readStreamError(body);

    expect((error as StreamError).message).toBe("generation aborted");
    expect((error as StreamError).code).toBe("server_error");
  });

  it("falls back to a descriptive message when the failure carries none", async () => {
    const error = await readStreamError(frame({ type: "response.failed" }));

    expect((error as StreamError).message).toMatch(/without a message/);
  });

  it("takes precedence over an image delivered earlier in the stream", async () => {
    const body = [
      frame(imageItemDone(IMAGE_B64)),
      frame({ type: "response.failed", error: { message: "failed after partial output" } }),
    ].join("");

    const error = await readStreamError(body);

    expect((error as StreamError).message).toBe("failed after partial output");
  });

  it("ignores an error-shaped payload on a non-error event type", async () => {
    const body = [
      frame({ type: "response.in_progress", error: { message: "not terminal" } }),
      frame(imageItemDone(IMAGE_B64)),
    ].join("");

    expect(await readStream(body)).toEqual([{ base64: IMAGE_B64 }]);
  });
});

describe("readImageStream moderation refusals", () => {
  const moderationBody = frame({
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

  it("surfaces the moderation stage and categories", async () => {
    const error = (await readStreamError(moderationBody)) as StreamError;

    expect(error).toBeInstanceOf(StreamError);
    expect(error.message).toBe("Your request was blocked by our moderation system.");
    expect(error.code).toBe("moderation_blocked");
    expect(error.moderation?.stage).toBe("output");
    expect(error.moderation?.categories).toEqual(["violence", "self_harm"]);
  });

  it("normalizes a category flag map to the truthy category names", async () => {
    const body = frame({
      type: "response.failed",
      error: {
        message: "blocked",
        code: "moderation_blocked",
        moderation_details: {
          moderation_stage: "input",
          categories: { violence: true, sexual: false, hate: true },
        },
      },
    });

    const error = (await readStreamError(body)) as StreamError;

    expect(error.moderation?.stage).toBe("input");
    expect(error.moderation?.categories).toEqual(["violence", "hate"]);
  });

  it("leaves moderation undefined when no details are present", async () => {
    const body = frame({ type: "response.failed", error: { message: "plain failure" } });
    const error = (await readStreamError(body)) as StreamError;

    expect(error.moderation).toBeUndefined();
  });
});

describe("describeStreamError", () => {
  it("renders message, code, stage, and categories on one line", () => {
    const error = new StreamError("blocked by moderation", {
      code: "moderation_blocked",
      moderation: { stage: "output", categories: ["violence", "self_harm"] },
    });

    expect(describeStreamError(error)).toBe(
      "blocked by moderation (code: moderation_blocked; stage: output; categories: violence, self_harm)",
    );
  });

  it("returns the bare message when there is no structured detail", () => {
    expect(describeStreamError(new StreamError("stream closed"))).toBe("stream closed");
  });

  it("omits absent detail fields", () => {
    const error = new StreamError("blocked", { code: "moderation_blocked" });

    expect(describeStreamError(error)).toBe("blocked (code: moderation_blocked)");
  });
});
