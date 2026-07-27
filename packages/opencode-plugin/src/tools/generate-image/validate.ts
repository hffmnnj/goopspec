/**
 * Input validation and model gating for generate_image.
 *
 * Fails fast before any credential or network work, and reports model
 * substitutions so the tool layer can surface them honestly.
 */

import { stat } from "node:fs/promises";

import {
  BACKGROUNDS,
  type Background,
  DEFAULT_TIMEOUT_SECONDS,
  DETAIL_LEVELS,
  type Detail,
  IMAGE_ACTIONS,
  IMAGE_MODELS,
  IMAGE_QUALITIES,
  INPUT_FIDELITIES,
  type ImageAction,
  type ImageModel,
  type ImageQuality,
  type InputFidelity,
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
  inputFidelity?: InputFidelity;
  moderation?: Moderation;
  count: number;
  inputImages: string[];
  timeoutSeconds: number;
}

export interface ModelSubstitution {
  from: ImageModel;
  to: ImageModel;
  reason: string;
}

export interface ValidationResult {
  options: ValidatedGenerateOptions;
  modelSubstitution?: ModelSubstitution;
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

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

function validateSize(model: ImageModel, size: string | undefined): string | undefined {
  if (size === undefined) {
    return undefined;
  }

  if (model !== "gpt-image-2") {
    const allowed = new Set(["1024x1024", "1536x1024", "1024x1536", "auto"]);
    if (!allowed.has(size)) {
      throw new ValidationError(
        `Size "${size}" is not supported for ${model}. Allowed: 1024x1024, 1536x1024, 1024x1536, auto.`,
      );
    }
    return size;
  }

  if (size === "auto") {
    throw new ValidationError(`Size "auto" is not supported for ${model}.`);
  }

  const [width, height] = parseDimensions(size);

  if (width % 16 !== 0 || height % 16 !== 0) {
    throw new ValidationError(`Size "${size}" must have both edges divisible by 16 for ${model}.`);
  }

  const maxEdge = Math.max(width, height);
  if (maxEdge > 3840) {
    throw new ValidationError(`Size "${size}" exceeds the 3840px maximum edge for ${model}.`);
  }

  const minEdge = Math.min(width, height);
  if (maxEdge / minEdge > 3) {
    throw new ValidationError(`Size "${size}" exceeds the 3:1 aspect ratio limit for ${model}.`);
  }

  const pixels = width * height;
  if (pixels < 655360 || pixels > 8294400) {
    throw new ValidationError(
      `Size "${size}" has ${pixels.toLocaleString()} pixels, but ${model} requires between 655,360 and 8,294,400 pixels.`,
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

function applyModelGating(
  model: ImageModel,
  background: Background | undefined,
): { model: ImageModel; substitution?: ModelSubstitution } {
  if (model === "gpt-image-2" && background === "transparent") {
    return {
      model: "gpt-image-1.5",
      substitution: {
        from: "gpt-image-2",
        to: "gpt-image-1.5",
        reason:
          'background="transparent" is not supported by gpt-image-2; the model has been switched to gpt-image-1.5.',
      },
    };
  }

  return { model };
}

export async function validateGenerateOptions(raw: GenerateOptions): Promise<ValidationResult> {
  if (!raw.prompt || typeof raw.prompt !== "string" || raw.prompt.trim().length === 0) {
    throw new ValidationError("A non-empty prompt is required.");
  }

  const model = validateEnum(raw.model, IMAGE_MODELS, "Model");
  if (!model) {
    throw new ValidationError("Model is required.");
  }

  const validatedSize = validateSize(model, raw.size);
  const validatedOutputFormat = validateEnum(
    raw.outputFormat,
    OUTPUT_FORMATS,
    "Output format",
    normalizeOutputFormat,
  );
  const validatedQuality = validateEnum(raw.quality, IMAGE_QUALITIES, "Quality");
  const validatedBackground = validateEnum(raw.background, BACKGROUNDS, "Background");
  const validatedDetail = validateEnum(raw.detail, DETAIL_LEVELS, "Detail");
  const validatedAction = validateEnum(raw.action, IMAGE_ACTIONS, "Action");
  const validatedInputFidelity = validateEnum(
    raw.inputFidelity,
    INPUT_FIDELITIES,
    "Input fidelity",
  );
  const validatedModeration = validateEnum(raw.moderation, MODERATION_LEVELS, "Moderation");

  const { model: finalModel, substitution } = applyModelGating(model, validatedBackground);

  // input_fidelity is invalid for gpt-image-2; drop it rather than sending null/undefined.
  const finalInputFidelity = finalModel === "gpt-image-2" ? undefined : validatedInputFidelity;

  const inputImages = await validateInputImages(raw.inputImages);

  const timeoutSeconds =
    typeof raw.timeoutSeconds === "number" &&
    Number.isFinite(raw.timeoutSeconds) &&
    raw.timeoutSeconds > 0
      ? raw.timeoutSeconds
      : DEFAULT_TIMEOUT_SECONDS;

  const options: ValidatedGenerateOptions = {
    prompt: raw.prompt,
    model: finalModel,
    size: validatedSize,
    quality: validatedQuality,
    outputFormat: validatedOutputFormat,
    background: validatedBackground,
    detail: validatedDetail,
    action: validatedAction,
    ...(finalInputFidelity !== undefined && { inputFidelity: finalInputFidelity }),
    moderation: validatedModeration,
    count: clampCount(raw.count),
    inputImages,
    timeoutSeconds,
  };

  return {
    options,
    modelSubstitution: substitution,
  };
}
