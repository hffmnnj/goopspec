/**
 * Server-Sent Events parsing and image extraction for generate_image.
 *
 * One responsibility: response bytes in, extracted images or a typed error out.
 * No credential handling, no file IO, and no payload contents ever reach the
 * logger — only counts and event types are considered loggable here.
 */

import { log } from "../../shared/logger.js";
import type { ExtractedImage } from "./types.js";

/**
 * SSE event blocks are separated by a blank line. All three line-ending styles
 * the spec permits are matched so a `\r\n` transport does not silently produce
 * one giant unterminated frame.
 */
const FRAME_BOUNDARY = /\r\n\r\n|\n\n|\r\r/;

const LINE_BOUNDARY = /\r\n|\n|\r/;

const DATA_FIELD_PREFIX = "data:";

const DONE_SENTINEL = "[DONE]";

const IMAGE_ITEM_TYPE = "image_generation_call";

export interface ModerationDetails {
  /** Verbatim `moderation_details.moderation_stage` from the backend. */
  stage?: string;
  /** Verbatim `moderation_details.categories`, normalized to a name list. */
  categories?: string[];
}

export interface StreamErrorOptions {
  code?: string;
  moderation?: ModerationDetails;
}

/**
 * A terminal failure reported by the stream itself rather than by HTTP status.
 * `message` is the backend's text verbatim; `code` and `moderation` carry the
 * structured refusal shape so callers can surface a stage and category list.
 */
export class StreamError extends Error {
  readonly code?: string;
  readonly moderation?: ModerationDetails;

  constructor(message: string, options?: StreamErrorOptions) {
    super(message);
    this.name = "StreamError";
    this.code = options?.code;
    this.moderation = options?.moderation;
  }
}

interface StreamAccumulator {
  primary: ExtractedImage[];
  fallback: ExtractedImage[];
  /** Frames whose JSON failed to parse. Counted only; content is never retained. */
  malformed: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/**
 * Split off every COMPLETE event block, returning the trailing partial block so
 * the caller can prepend the next chunk to it. A JSON payload cut at an
 * arbitrary byte offset stays in `remainder` until its boundary arrives.
 */
function drainFrames(buffer: string): { frames: string[]; remainder: string } {
  const frames: string[] = [];
  let remainder = buffer;

  for (;;) {
    const match = FRAME_BOUNDARY.exec(remainder);
    if (!match) {
      break;
    }
    frames.push(remainder.slice(0, match.index));
    remainder = remainder.slice(match.index + match[0].length);
  }

  return { frames, remainder };
}

/** Multiple `data:` lines in one block join with a newline, per the SSE spec. */
function readFramePayload(frame: string): string | undefined {
  const dataLines: string[] = [];

  for (const line of frame.split(LINE_BOUNDARY)) {
    if (line.length === 0 || line.startsWith(":") || !line.startsWith(DATA_FIELD_PREFIX)) {
      continue;
    }
    const raw = line.slice(DATA_FIELD_PREFIX.length);
    dataLines.push(raw.startsWith(" ") ? raw.slice(1) : raw);
  }

  if (dataLines.length === 0) {
    return undefined;
  }

  const payload = dataLines.join("\n");
  return payload.length === 0 ? undefined : payload;
}

/**
 * `item.result` is RAW base64 with no data-URL prefix. It is returned exactly as
 * received — stripping a prefix here would corrupt payloads that legitimately
 * begin with those characters. Input images use a data URL; that asymmetry is
 * deliberate and must not be normalized.
 */
function extractImage(item: unknown): ExtractedImage | undefined {
  if (!isRecord(item) || item.type !== IMAGE_ITEM_TYPE) {
    return undefined;
  }

  const base64 = readString(item.result);
  if (base64 === undefined) {
    return undefined;
  }

  const revisedPrompt = readString(item.revised_prompt);
  return revisedPrompt === undefined ? { base64 } : { base64, revisedPrompt };
}

function collectFallbackImages(responsePayload: unknown, into: ExtractedImage[]): void {
  if (!isRecord(responsePayload) || !Array.isArray(responsePayload.output)) {
    return;
  }

  for (const entry of responsePayload.output) {
    const image = extractImage(entry);
    if (image !== undefined) {
      into.push(image);
    }
  }
}

/** Error detail sits under `error` directly, or under `response.error`. */
function resolveErrorDetail(event: Record<string, unknown>): Record<string, unknown> | undefined {
  if (isRecord(event.error)) {
    return event.error;
  }
  if (isRecord(event.response) && isRecord(event.response.error)) {
    return event.response.error;
  }
  return undefined;
}

/** Categories arrive as a name list or as a flag map; both reduce to names. */
function readCategories(value: unknown): string[] | undefined {
  if (Array.isArray(value)) {
    const names = value.filter((entry): entry is string => typeof entry === "string");
    return names.length > 0 ? names : undefined;
  }
  if (isRecord(value)) {
    const names = Object.keys(value).filter((key) => value[key] === true);
    return names.length > 0 ? names : undefined;
  }
  return undefined;
}

function extractModeration(
  detail: Record<string, unknown> | undefined,
): ModerationDetails | undefined {
  if (detail === undefined || !isRecord(detail.moderation_details)) {
    return undefined;
  }

  const stage = readString(detail.moderation_details.moderation_stage);
  const categories = readCategories(detail.moderation_details.categories);
  if (stage === undefined && categories === undefined) {
    return undefined;
  }

  return { stage, categories };
}

function extractStreamError(event: Record<string, unknown>): StreamError | undefined {
  if (event.type !== "response.failed" && event.type !== "error") {
    return undefined;
  }

  const detail = resolveErrorDetail(event);
  const message =
    readString(detail?.message) ??
    readString(event.message) ??
    "generate_image stream reported a failure without a message";

  return new StreamError(message, {
    code: readString(detail?.code) ?? readString(event.code),
    moderation: extractModeration(detail),
  });
}

/**
 * Fold one event block into the accumulator. Returns a `StreamError` when the
 * frame is a terminal failure; malformed JSON is counted and skipped so a single
 * bad frame never aborts an otherwise healthy stream.
 */
function consumeFrame(frame: string, acc: StreamAccumulator): StreamError | undefined {
  const payload = readFramePayload(frame);
  if (payload === undefined || payload.trim() === DONE_SENTINEL) {
    return undefined;
  }

  let event: unknown;
  try {
    event = JSON.parse(payload);
  } catch {
    acc.malformed += 1;
    return undefined;
  }

  if (!isRecord(event)) {
    return undefined;
  }

  const error = extractStreamError(event);
  if (error !== undefined) {
    return error;
  }

  if (event.type === "response.output_item.done") {
    const image = extractImage(event.item);
    if (image !== undefined) {
      acc.primary.push(image);
    }
    return undefined;
  }

  if (event.type === "response.completed") {
    collectFallbackImages(event.response, acc.fallback);
  }

  return undefined;
}

/**
 * Read the SSE body and return every image it carried.
 *
 * Buffering strategy: each chunk is decoded with `{ stream: true }` so a
 * multi-byte character split across a chunk boundary survives, appended to a
 * string buffer, and only complete event blocks are consumed. The trailing
 * partial block is retained for the next chunk and flushed once at end of
 * stream, which also covers a final event that lacks a blank-line terminator.
 *
 * Extraction is two-pass: `response.output_item.done` items win, and
 * `response.completed` output entries are used only when the primary pass found
 * nothing. Throws `StreamError` on a failure event or an image-less stream.
 */
export async function readImageStream(response: Response): Promise<ExtractedImage[]> {
  const body = response.body;
  if (body === null) {
    throw new StreamError("generate_image received an empty response body");
  }

  const reader = body.getReader();
  const decoder = new TextDecoder();
  const acc: StreamAccumulator = { primary: [], fallback: [], malformed: 0 };
  let buffer = "";

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const drained = drainFrames(buffer);
      buffer = drained.remainder;

      for (const frame of drained.frames) {
        const error = consumeFrame(frame, acc);
        if (error !== undefined) {
          throw error;
        }
      }
    }

    buffer += decoder.decode();

    if (buffer.trim().length > 0) {
      const error = consumeFrame(buffer, acc);
      if (error !== undefined) {
        throw error;
      }
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }

  if (acc.malformed > 0) {
    log("generate_image skipped unparsable SSE frames", { count: acc.malformed });
  }

  const images = acc.primary.length > 0 ? acc.primary : acc.fallback;
  if (images.length === 0) {
    throw new StreamError("generate_image stream ended without returning an image");
  }

  return images;
}

/** Keeps structured refusal detail visible to callers that surface only a string. */
export function describeStreamError(error: StreamError): string {
  const details: string[] = [];

  if (error.code !== undefined) {
    details.push(`code: ${error.code}`);
  }
  if (error.moderation?.stage !== undefined) {
    details.push(`stage: ${error.moderation.stage}`);
  }

  const categories = error.moderation?.categories;
  if (categories !== undefined && categories.length > 0) {
    details.push(`categories: ${categories.join(", ")}`);
  }

  return details.length > 0 ? `${error.message} (${details.join("; ")})` : error.message;
}
