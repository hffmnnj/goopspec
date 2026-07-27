/**
 * MCP tool definition for generate_image.
 *
 * Wraps the prior art in auth.ts, validate.ts, request.ts, sse.ts, and
 * generate.ts in the standard `tool({ description, args, execute })` contract.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { tool } from "../../core/sdk-compat.js";
import type { ToolContext, ToolDefinition } from "../../core/sdk-compat.js";
import type { PluginContext } from "../../core/types.js";
import { log, logError } from "../../shared/logger.js";
import { CredentialError, type ReadCredentialOptions, readCredential, redact } from "./auth.js";
import {
  BACKGROUNDS,
  DETAIL_LEVELS,
  IMAGE_ACTIONS,
  IMAGE_MODELS,
  IMAGE_QUALITIES,
  INPUT_FIDELITIES,
  MAX_COUNT,
  MAX_INPUT_IMAGES,
  MODERATION_LEVELS,
  OUTPUT_FORMATS,
} from "./constants.js";
import { RequestError, buildBody, buildHeaders } from "./request.js";
import { StreamError, describeStreamError } from "./sse.js";
import type { GenerateImageArgs, GenerateOptions } from "./types.js";
import { ValidationError, validateGenerateOptions } from "./validate.js";

function isPartialFailure(result: {
  paths: string[];
  revisedPrompt?: string;
  partial?: true;
  error?: Error;
}): result is { paths: string[]; revisedPrompt?: string; partial: true; error: Error } {
  return result.partial === true && result.error !== undefined;
}

function formatModelUsed(
  model: string,
  substitution?: { from: string; to: string; reason: string },
): string {
  if (substitution === undefined) {
    return model;
  }
  return `${model} (substituted from ${substitution.from} because ${substitution.reason})`;
}

function formatSuccessResult(
  result: { paths: string[]; revisedPrompt?: string; partial?: true; error?: Error },
  model: string,
  substitution?: { from: string; to: string; reason: string },
): string {
  const lines: string[] = [];
  const header = isPartialFailure(result) ? "Partial success" : "Success";
  lines.push(
    `${header}: generated ${result.paths.length} image${result.paths.length === 1 ? "" : "s"} using ${formatModelUsed(model, substitution)}.`,
  );

  if (result.paths.length > 0) {
    lines.push("Files written:");
    for (const path of result.paths) {
      lines.push(`  ${path}`);
    }
  }

  if (result.revisedPrompt !== undefined) {
    lines.push(`Revised prompt: ${result.revisedPrompt}`);
  }

  if (isPartialFailure(result)) {
    lines.push(`Stopped early: ${formatErrorMessage(result.error)}`);
  }

  return lines.join("\n");
}

function formatErrorMessage(error: Error): string {
  if (error instanceof StreamError) {
    return describeStreamError(error);
  }
  if (error instanceof RequestError) {
    return error.message;
  }
  if (error instanceof ValidationError || error instanceof CredentialError) {
    return error.message;
  }
  return error.message;
}

function formatFailureResult(error: Error): string {
  if (error instanceof ValidationError) {
    return `generate_image validation error: ${error.message}`;
  }
  if (error instanceof CredentialError) {
    return `generate_image auth error: ${error.message}`;
  }
  if (error instanceof StreamError) {
    return `generate_image stream error: ${describeStreamError(error)}`;
  }
  if (error instanceof RequestError) {
    return `generate_image ${classifyRequestError(error)}: ${error.message}`;
  }
  if (error instanceof Error && error.name === "TimeoutError") {
    return `generate_image timeout: ${error.message}`;
  }
  return `generate_image error: ${error.message}`;
}

function classifyRequestError(error: RequestError): string {
  const status = error.status;
  if (status === 401) return "unauthorized";
  if (status === 403) return "forbidden";
  if (status === 429) return "rate-limited";
  if (status >= 500) return "server error";
  if (status === 0) {
    if (error.message.toLowerCase().includes("timed out")) {
      return "timeout";
    }
    return "network";
  }
  return "request failed";
}

function shapeDryRunOutput(
  headers: Record<string, string>,
  body: unknown,
): Record<string, unknown> {
  return {
    endpoint: "POST https://chatgpt.com/backend-api/codex/responses",
    headers: { ...headers, Authorization: redact(headers.Authorization) },
    body,
  };
}

function writeDryRunArtifact(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

/**
 * Factory for the generate_image MCP tool.
 *
 * Use this when you need a ChatGPT-image-generation backend to produce an image
 * from a prompt, optionally editing or conditioning on up to 5 reference images.
 * Returns the absolute paths of the generated files written to disk.
 */
export function createGenerateImageTool(ctx: PluginContext): ToolDefinition {
  return tool({
    description:
      "Generate images with ChatGPT image models from a text prompt. " +
      "Use this when the user asks for a new image, an edit of an existing image, " +
      "or a variation conditioned on reference images. Supports custom sizes, " +
      "formats, quality, background, and moderation settings. Returns the absolute " +
      "paths of files written to the project directory.",
    args: {
      prompt: tool.schema.string().describe("Text prompt describing the desired image"),
      out: tool.schema
        .string()
        .optional()
        .describe(
          "Output file path; relative paths are resolved against the project root. " +
            "When count > 1, a '-1', '-2', ... suffix is inserted before the extension.",
        ),
      images: tool.schema
        .array(tool.schema.string())
        .max(MAX_INPUT_IMAGES)
        .optional()
        .describe("Up to 5 reference image paths to condition or edit generation on"),
      model: tool.schema
        .string()
        .optional()
        .describe(`Image model to use. Allowed: ${IMAGE_MODELS.join(", ")}`),
      size: tool.schema
        .string()
        .optional()
        .describe(
          "Image dimensions. For gpt-image-1.5 use 1024x1024, 1536x1024, 1024x1536, or auto. " +
            "For gpt-image-2 use a custom <width>x<height> with both edges divisible by 16, " +
            "max edge 3840, and total pixels between 655,360 and 8,294,400.",
        ),
      quality: tool.schema
        .string()
        .optional()
        .describe(`Quality level. Allowed: ${IMAGE_QUALITIES.join(", ")}`),
      outputFormat: tool.schema
        .string()
        .optional()
        .describe(`Output format. Allowed: ${OUTPUT_FORMATS.join(", ")}`),
      background: tool.schema
        .string()
        .optional()
        .describe(`Background treatment. Allowed: ${BACKGROUNDS.join(", ")}`),
      count: tool.schema
        .number()
        .int()
        .min(1)
        .max(MAX_COUNT)
        .optional()
        .describe(`Number of images to generate (1-${MAX_COUNT})`),
      inputFidelity: tool.schema
        .string()
        .optional()
        .describe(`Input image fidelity. Allowed: ${INPUT_FIDELITIES.join(", ")}`),
      timeout: tool.schema
        .number()
        .positive()
        .optional()
        .describe("Request timeout in seconds (default 180)"),
      dryRun: tool.schema
        .boolean()
        .optional()
        .describe(
          "When true, return the fully-constructed request shape without sending it. " +
            "The bearer token is redacted.",
        ),
      authFile: tool.schema
        .string()
        .optional()
        .describe("Explicit path to a ChatGPT OAuth credential file (JSON)"),
      action: tool.schema
        .string()
        .optional()
        .describe(`Action intent. Allowed: ${IMAGE_ACTIONS.join(", ")}`),
      moderation: tool.schema
        .string()
        .optional()
        .describe(`Moderation level. Allowed: ${MODERATION_LEVELS.join(", ")}`),
      outputCompression: tool.schema
        .number()
        .min(0)
        .max(100)
        .optional()
        .describe("Output compression level (0-100) — currently unused by the backend"),
      detail: tool.schema
        .string()
        .optional()
        .describe(`Input image detail level. Allowed: ${DETAIL_LEVELS.join(", ")}`),
      mask: tool.schema
        .string()
        .optional()
        .describe("Mask image path — currently unused by the backend"),
      allowRefresh: tool.schema
        .boolean()
        .optional()
        .describe(
          "Allow an expired access token to be refreshed for this invocation only. " +
            "Refresh response tokens are not persisted.",
        ),
    },
    async execute(args: GenerateImageArgs, _context: ToolContext): Promise<string> {
      try {
        const projectDir = ctx.sdk.directory;

        const credentialOptions: ReadCredentialOptions = {
          authFile: args.authFile,
          allowRefresh: args.allowRefresh,
        };

        const credential = await readCredential(credentialOptions);

        const rawOptions: GenerateOptions = {
          prompt: args.prompt,
          model: (args.model ?? "gpt-image-1.5") as GenerateOptions["model"],
          size: args.size,
          quality: args.quality as GenerateOptions["quality"],
          outputFormat: args.outputFormat as GenerateOptions["outputFormat"],
          background: args.background as GenerateOptions["background"],
          count: args.count,
          inputFidelity: args.inputFidelity as GenerateOptions["inputFidelity"],
          timeoutSeconds: args.timeout,
          inputImages: args.images,
          authFile: args.authFile,
          allowRefresh: args.allowRefresh,
          detail: args.detail as GenerateOptions["detail"],
          action: args.action as GenerateOptions["action"],
          moderation: args.moderation as GenerateOptions["moderation"],
        };

        const validation = await validateGenerateOptions(rawOptions);
        const validated = validation.options;

        log("generate_image tool validated options", {
          model: validated.model,
          size: validated.size,
          count: validated.count,
        });

        if (args.dryRun) {
          const headers = buildHeaders(credential.accessToken);
          const body = await buildBody(validated);
          const dryRunContent = JSON.stringify(shapeDryRunOutput(headers, body), null, 2);
          const artifactPath = `${projectDir}/.goopspec/generated-images/dry-run-${Date.now()}.json`;
          writeDryRunArtifact(artifactPath, dryRunContent);
          return `Dry run: request shape written to ${artifactPath}\n\n${dryRunContent}`;
        }

        const { generateImages } = await import("./generate.js");
        const result = await generateImages(projectDir, args.out, {
          accessToken: credential.accessToken,
          options: validated,
          timeoutSeconds: validated.timeoutSeconds,
        });

        if (isPartialFailure(result) && result.paths.length === 0) {
          return formatFailureResult(result.error);
        }

        return formatSuccessResult(result, validated.model, validation.modelSubstitution);
      } catch (error: unknown) {
        logError("generate_image tool failed", error);

        if (error instanceof ValidationError) {
          return `generate_image validation error: ${error.message}`;
        }

        if (error instanceof CredentialError) {
          return `generate_image auth error: ${error.message}`;
        }

        if (error instanceof StreamError) {
          const detail = describeStreamError(error);
          return `generate_image stream error: ${detail}`;
        }

        if (error instanceof RequestError) {
          return `generate_image ${classifyRequestError(error)}: ${error.message}`;
        }

        if (error instanceof Error && error.name === "TimeoutError") {
          return `generate_image timeout: ${error.message}`;
        }

        const msg = error instanceof Error ? error.message : String(error);
        return `generate_image error: ${msg}`;
      }
    },
  });
}
