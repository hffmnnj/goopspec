/**
 * Input validation for generate_image.
 *
 * Fails fast before any credential or network work.
 */

import { stat } from "node:fs/promises";

import {
  BACKGROUNDS,
  type Background,
  DEFAULT_TIMEOUT_SECONDS,
  DETAIL_LEVELS,
  type Detail,
  IMAGE_ACTIONS,
  IMAGE_QUALITIES,
  type ImageAction,
  type ImageModel,
  type ImageQuality,
  MAX_COUNT,
  MAX_INPUT_IMAGES,
  MAX_INPUT_IMAGE_BYTES,
  MODERATION_LEVELS,
  type Moderation,
  OUTPUT_FORMATS,
  type OutputFormat,
} from "./constants.js";
import type { GenerateOptions } from "./types.js";

export interface ValidatedGenerateOptions {
  prompt: string;
  model: ImageModel;
  size?: string;
  quality?: ImageQuality;
  outputFormat?: OutputFormat;
  background?: Background;
  detail?: Detail;
  action?: ImageAction;
  moderation?: Moderation;
  count: number;
  inputImages: string[];
  timeoutSeconds: number;
}

export interface ValidationResult {
  options: ValidatedGenerateOptions;
  promptAugmentation?: { original: string; appended: string; final: string };
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

/** Appended for transparent backgrounds: model renders on green, local chromakey keys to alpha. Separator is part of `appended` so `final === original + appended`. */
const GREEN_SCREEN_SUFFIX =
  "\n\nRender the subject on a uniform, fully saturated green background. " +
  "Produce no shadows, no contact shadows, and no reflections. " +
  "Avoid green spill or green light bouncing onto the subject.";

function isInArray<T>(value: unknown, allowed: readonly T[]): value is T {
  return allowed.includes(value as T);
}

function validateEnum<T>(
  value: unknown,
  allowed: readonly T[],
  label: string,
  normalize?: (v: unknown) => T | undefined,
): T | undefined {
  if (value === undefined) {
    return undefined;
  }

  const normalized = normalize?.(value);
  if (normalized !== undefined) {
    return normalized;
  }

  if (isInArray(value, allowed)) {
    return value;
  }

  throw new ValidationError(
    `${label} "${String(value)}" is not supported. Allowed: ${allowed.join(", ")}.`,
  );
}

function normalizeOutputFormat(value: unknown): OutputFormat | undefined {
  if (value === "jpg") {
    return "jpeg";
  }
  return undefined;
}

function clampCount(value: unknown): number {
  const num = typeof value === "number" && Number.isFinite(value) ? value : 1;
  return Math.max(1, Math.min(MAX_COUNT, Math.trunc(num)));
}

function parseDimensions(size: string): [number, number] {
  const match = /^(\d+)x(\d+)$/.exec(size);
  if (!match) {
    throw new ValidationError(
      `Size "${size}" is not a valid custom size. Expected "<width>x<height>" with numeric dimensions.`,
    );
  }

  return [Number.parseInt(match[1], 10), Number.parseInt(match[2], 10)];
}

function validateSize(size: string | undefined): string | undefined {
  if (size === undefined) {
    return undefined;
  }

  if (size === "auto") {
    throw new ValidationError('Size "auto" is not supported for gpt-image-2.');
  }

  const [width, height] = parseDimensions(size);

  if (width % 16 !== 0 || height % 16 !== 0) {
    throw new ValidationError(
      `Size "${size}" must have both edges divisible by 16 for gpt-image-2.`,
    );
  }

  const maxEdge = Math.max(width, height);
  if (maxEdge > 3840) {
    throw new ValidationError(`Size "${size}" exceeds the 3840px maximum edge for gpt-image-2.`);
  }

  const minEdge = Math.min(width, height);
  if (maxEdge / minEdge > 3) {
    throw new ValidationError(`Size "${size}" exceeds the 3:1 aspect ratio limit for gpt-image-2.`);
  }

  const pixels = width * height;
  if (pixels < 655360 || pixels > 8294400) {
    throw new ValidationError(
      `Size "${size}" has ${pixels.toLocaleString()} pixels, but gpt-image-2 requires between 655,360 and 8,294,400 pixels.`,
    );
  }

  return size;
}

async function validateInputImages(paths: string[] | undefined): Promise<string[]> {
  const images = paths ?? [];
  if (images.length > MAX_INPUT_IMAGES) {
    throw new ValidationError(
      `Too many input images: ${images.length}. Maximum is ${MAX_INPUT_IMAGES}.`,
    );
  }

  for (const path of images) {
    let stats: Awaited<ReturnType<typeof stat>>;
    try {
      stats = await stat(path);
    } catch (error: unknown) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new ValidationError(`Cannot read input image ${path}: ${reason}`);
    }

    if (!stats.isFile()) {
      throw new ValidationError(`Input image is not a file: ${path}`);
    }

    if (stats.size > MAX_INPUT_IMAGE_BYTES) {
      throw new ValidationError(
        `Input image exceeds 64 MiB limit: ${path} (${stats.size.toLocaleString()} bytes).`,
      );
    }
  }

  return images;
}

export async function validateGenerateOptions(raw: GenerateOptions): Promise<ValidationResult> {
  if (!raw.prompt || typeof raw.prompt !== "string" || raw.prompt.trim().length === 0) {
    throw new ValidationError("A non-empty prompt is required.");
  }

  const validatedSize = validateSize(raw.size);
  const requestedOutputFormat = validateEnum(
    raw.outputFormat,
    OUTPUT_FORMATS,
    "Output format",
    normalizeOutputFormat,
  );
  const validatedQuality = validateEnum(raw.quality, IMAGE_QUALITIES, "Quality");
  const validatedBackground = validateEnum(raw.background, BACKGROUNDS, "Background");
  if (
    validatedBackground === "transparent" &&
    (requestedOutputFormat === "jpeg" || requestedOutputFormat === "webp")
  ) {
    throw new ValidationError(
      "Transparent background requires png output. Transparency is produced by a local chromakey step that encodes png only; jpeg carries no alpha channel and webp is not supported by the keyer. Use png.",
    );
  }
  const validatedOutputFormat =
    validatedBackground === "transparent" && requestedOutputFormat === undefined
      ? "png"
      : requestedOutputFormat;
  const validatedDetail = validateEnum(raw.detail, DETAIL_LEVELS, "Detail");
  const validatedAction = validateEnum(raw.action, IMAGE_ACTIONS, "Action");
  const validatedModeration = validateEnum(raw.moderation, MODERATION_LEVELS, "Moderation");

  const inputImages = await validateInputImages(raw.inputImages);

  const timeoutSeconds =
    typeof raw.timeoutSeconds === "number" &&
    Number.isFinite(raw.timeoutSeconds) &&
    raw.timeoutSeconds > 0
      ? raw.timeoutSeconds
      : DEFAULT_TIMEOUT_SECONDS;

  const augmentedPrompt =
    validatedBackground === "transparent" ? raw.prompt + GREEN_SCREEN_SUFFIX : raw.prompt;

  const options: ValidatedGenerateOptions = {
    prompt: augmentedPrompt,
    model: "gpt-image-2",
    size: validatedSize,
    quality: validatedQuality,
    outputFormat: validatedOutputFormat,
    background: validatedBackground,
    detail: validatedDetail,
    action: validatedAction,
    moderation: validatedModeration,
    count: clampCount(raw.count),
    inputImages,
    timeoutSeconds,
  };

  const promptAugmentation =
    validatedBackground === "transparent"
      ? { original: raw.prompt, appended: GREEN_SCREEN_SUFFIX, final: augmentedPrompt }
      : undefined;

  return { options, promptAugmentation };
}
