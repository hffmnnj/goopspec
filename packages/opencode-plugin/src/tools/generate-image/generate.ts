/**
 * End-to-end image generation pipeline: input-image encoding, output file
 * writing, and a sequential count loop that reports partial failures honestly.
 *
 * This module closes the generate_image pipeline: reference images in,
 * decoded PNGs/JPEGs/WebPs on disk out. It keeps all network-aware code in
 * request.ts and stream-aware code in sse.ts; its own responsibilities are
 * file IO, loop orchestration, and fail-soft reporting.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { dirname, extname, isAbsolute, join, resolve } from "node:path";

import { log } from "../../shared/logger.js";
import { MAX_INPUT_IMAGE_BYTES } from "./constants.js";
import type { OutputFormat } from "./constants.js";
import { buildHeaders, sendRequest } from "./request.js";
import { readImageStream } from "./sse.js";
import type { ExtractedImage } from "./types.js";
import type { ValidatedGenerateOptions } from "./validate.js";

export class InputImageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InputImageError";
  }
}

export interface GenerationResult {
  /** Absolute paths of every file successfully written to disk. */
  paths: string[];
  /** The first revised_prompt returned by the backend, if any. */
  revisedPrompt?: string;
}

export interface PartialFailure extends GenerationResult {
  /** True when one or more images were written before the failure. */
  partial: true;
  /** The error that stopped the sequential loop. */
  error: Error;
}

interface GenerateAttemptOptions {
  accessToken: string;
  options: ValidatedGenerateOptions;
  timeoutSeconds: number;
}

/**
 * Read an input image, enforce the 64 MiB cap, detect its MIME type from the
 * extension, and return a data URL. `.jpg` and `.jpeg` resolve to `image/jpeg`,
 * `.webp` to `image/webp`, and everything else to `image/png`.
 */
export async function encodeInputImage(path: string): Promise<string> {
  let stats: Awaited<ReturnType<typeof stat>>;
  try {
    stats = await stat(path);
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new InputImageError(`Cannot read input image ${path}: ${reason}`);
  }

  if (!stats.isFile()) {
    throw new InputImageError(`Input image is not a file: ${path}`);
  }

  if (stats.size > MAX_INPUT_IMAGE_BYTES) {
    throw new InputImageError(
      `Input image exceeds 64 MiB limit: ${path} (${stats.size.toLocaleString()} bytes).`,
    );
  }

  const bytes = await readFile(path);
  const mime = mimeFromPath(path);
  return `data:${mime};base64,${bytes.toString("base64")}`;
}

function mimeFromPath(path: string): string {
  const ext = extname(path).toLowerCase();
  if (ext === ".jpg" || ext === ".jpeg") {
    return "image/jpeg";
  }
  if (ext === ".webp") {
    return "image/webp";
  }
  return "image/png";
}

/**
 * Decode a base64 image payload and write it to `path`, creating parent
 * directories as needed. The on-disk extension is the caller's responsibility;
 * `outputFormat` is used only for logging.
 */
export function writeImage(
  path: string,
  result: ExtractedImage,
  outputFormat?: OutputFormat,
): void {
  mkdirSync(dirname(path), { recursive: true });
  const bytes = Buffer.from(result.base64, "base64");
  writeFileSync(path, bytes);
  log("generate_image wrote output file", {
    path,
    bytes: bytes.length,
    format: outputFormat ?? "png",
  });
}

/**
 * Build a default output path inside `<projectDir>/.goopspec/generated-images/`.
 * Slugifies the prompt, appends a timestamp, and adds a `-${index}` suffix
 * when count > 1.
 */
export function deriveDefaultOutputPath(
  projectDir: string,
  prompt: string,
  outputFormat?: OutputFormat,
  index?: number,
  now = Date.now(),
): string {
  const slug = slugify(prompt);
  const ext = outputFormat ?? "png";
  const suffix = index !== undefined && index > 1 ? `-${index}` : "";
  return join(projectDir, ".goopspec", "generated-images", `${slug}-${now}${suffix}.${ext}`);
}

function slugify(prompt: string): string {
  return prompt
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

/**
 * Resolve an explicit output path to an absolute path. Relative paths are
 * resolved against `projectDir`.
 */
export function resolveOutputPath(projectDir: string, out: string): string {
  return isAbsolute(out) ? out : resolve(projectDir, out);
}

/**
 * Generate a single image and write it to the requested path.
 */
async function generateOne(
  attempt: GenerateAttemptOptions,
  outputPath: string,
): Promise<ExtractedImage> {
  const { buildBody } = await import("./request.js");
  const body = await buildBody(attempt.options);
  const headers = buildHeaders(attempt.accessToken);

  const response = await sendRequest(body, headers, attempt.timeoutSeconds);
  const images = await readImageStream(response);
  const image = images[0];
  if (image === undefined) {
    throw new Error("generate_image did not receive an image from the stream");
  }

  writeImage(outputPath, image, attempt.options.outputFormat);
  return image;
}

/**
 * Generate images sequentially, honoring the validated count and writing each
 * result to disk. Already-written paths are reported alongside any failure.
 */
export async function generateImages(
  projectDir: string,
  out: string | undefined,
  attempt: GenerateAttemptOptions,
): Promise<GenerationResult | PartialFailure> {
  const count = attempt.options.count;
  const paths: string[] = [];
  let revisedPrompt: string | undefined;

  for (let i = 1; i <= count; i++) {
    const path = out
      ? resolveOutputPathWithCount(resolveOutputPath(projectDir, out), count, i)
      : deriveDefaultOutputPath(
          projectDir,
          attempt.options.prompt,
          attempt.options.outputFormat,
          i,
        );

    try {
      const image = await generateOne(attempt, path);
      paths.push(path);
      if (revisedPrompt === undefined && image.revisedPrompt !== undefined) {
        revisedPrompt = image.revisedPrompt;
      }
    } catch (error: unknown) {
      const wrapped = error instanceof Error ? error : new Error(String(error));
      return {
        paths,
        revisedPrompt,
        partial: true,
        error: wrapped,
      };
    }
  }

  return { paths, revisedPrompt };
}

function resolveOutputPathWithCount(out: string, count: number, index: number): string {
  if (count <= 1) {
    return out;
  }

  const ext = extname(out);
  const stem = ext.length > 0 ? out.slice(0, -ext.length) : out;
  return `${stem}-${index}${ext}`;
}

/**
 * Convenience wrapper for callers that already hold validated options and
 * want the complete pipeline including input-image encoding.
 */
export async function runGeneratePipeline(
  projectDir: string,
  out: string | undefined,
  accessToken: string,
  options: ValidatedGenerateOptions,
): Promise<GenerationResult | PartialFailure> {
  return generateImages(projectDir, out, {
    accessToken,
    options,
    timeoutSeconds: options.timeoutSeconds,
  });
}
