/**
 * MCP tool definition for generate_image.
 *
 * Wraps the prior art in auth.ts, validate.ts, request.ts, sse.ts, and
 * generate.ts in the standard `tool({ description, args, execute })` contract.
 */

import { tool } from "../../core/sdk-compat.js";
import type { ToolContext, ToolDefinition } from "../../core/sdk-compat.js";
import type { PluginContext } from "../../core/types.js";
import { log, logError } from "../../shared/logger.js";
import { CredentialError, type ReadCredentialOptions, readCredential, redact } from "./auth.js";
import {
  BACKGROUNDS,
  DETAIL_LEVELS,
  IMAGE_ACTIONS,
  IMAGE_QUALITIES,
  MAX_COUNT,
  MAX_INPUT_IMAGES,
  MODERATION_LEVELS,
  OUTPUT_FORMATS,
} from "./constants.js";
import { RequestError, buildBody, buildHeaders } from "./request.js";
import { StreamError, describeStreamError } from "./sse.js";
import type { GenerateImageArgs, GenerateOptions } from "./types.js";
import { ValidationError, validateGenerateOptions } from "./validate.js";

type PromptAugmentation = { original: string; appended: string; final: string };

type GenerationResultView = {
  paths: string[];
  revisedPrompt?: string;
  warnings?: string[];
  partial?: true;
  error?: Error;
};

function isPartialFailure(
  result: GenerationResultView,
): result is GenerationResultView & { partial: true; error: Error } {
  return result.partial === true && result.error !== undefined;
}

function formatSuccessResult(
  result: GenerationResultView,
  model: string,
  promptAugmentation?: PromptAugmentation,
): string {
  const lines: string[] = [];
  const header = isPartialFailure(result) ? "Partial success" : "Success";
  lines.push(
    `${header}: generated ${result.paths.length} image${result.paths.length === 1 ? "" : "s"} using ${model}.`,
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

  if (promptAugmentation !== undefined) {
    lines.push(
      "Transparency: gpt-image-2 has no native transparent background. The image was " +
        "rendered on a green screen and keyed to alpha locally. The following instruction " +
        "was appended to your prompt:",
    );
    lines.push("");
    lines.push(promptAugmentation.appended.trim());
  }

  if (result.warnings !== undefined && result.warnings.length > 0) {
    lines.push("Warnings:");
    for (const warning of result.warnings) {
      lines.push(`  ${warning}`);
    }
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
      "Generate images with the gpt-image-2 model from a text prompt, optionally conditioned on up to 5 reference images. " +
      "WHEN TO USE: New image, image edit, or variation on reference images. " +
      "WHEN NOT TO USE: To inspect an existing image (use the host Read tool); to preview without spending credits (use dryRun). " +
      "MODES: dryRun returns the constructed request shape (bearer token redacted) and writes nothing; otherwise sends the request and writes files. " +
      "RETURNS: On success, the model, absolute paths of written files, any revised prompt, and (for transparent requests) the green-screen note. On failure, a typed error. " +
      "CAVEATS: Uses ChatGPT subscription OAuth (no API key); each non-dryRun call spends credits. " +
      "Transparent output is png-only: gpt-image-2 has no native alpha, so it is rendered on green screen and keyed to png locally; non-.png out and jpeg/webp outputFormat with background:transparent are rejected at validation. " +
      "Default path: <projectDir>/.goopspec/generated-images/<slug>-<ts>.<ext>; count > 1 adds -N before the extension. " +
      "mask and outputCompression are declared but not read by the tool; supplying them has no effect.",
    args: {
      prompt: tool.schema.string().describe("Text prompt describing the desired image"),
      out: tool.schema
        .string()
        .optional()
        .describe(
          "Output file path; relative paths resolve against the project root. " +
            "When omitted, files land at <projectDir>/.goopspec/generated-images/<slug>-<ts>.<ext>. " +
            "When count > 1, a '-1', '-2', ... suffix is inserted before the extension. " +
            "Must end in .png when background is transparent (chromakey always encodes png).",
        ),
      images: tool.schema
        .array(tool.schema.string())
        .max(MAX_INPUT_IMAGES)
        .optional()
        .describe(
          "Up to 5 reference image paths to condition or edit generation on (use with action:edit).",
        ),
      size: tool.schema
        .string()
        .optional()
        .describe(
          "Image dimensions. Use a custom <width>x<height> with both edges divisible by 16, " +
            "max edge 3840, and total pixels between 655,360 and 8,294,400.",
        ),
      quality: tool.schema
        .string()
        .optional()
        .describe(`Quality level. Allowed: ${IMAGE_QUALITIES.join(", ")}`),
      outputFormat: tool.schema
        .string()
        .optional()
        .describe(
          `Output format. Allowed: ${OUTPUT_FORMATS.join(", ")}. ` +
            "jpeg and webp are rejected when background is transparent (png-only).",
        ),
      background: tool.schema
        .string()
        .optional()
        .describe(
          `Background treatment. Allowed: ${BACKGROUNDS.join(", ")}. ` +
            "transparent is png-only and delivered via a local chromakey step.",
        ),
      count: tool.schema
        .number()
        .int()
        .min(1)
        .max(MAX_COUNT)
        .optional()
        .describe(`Number of images to generate (1-${MAX_COUNT})`),
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
        .describe(
          "Declared but not read by the tool; supplying it has no effect.",
        ),
      detail: tool.schema
        .string()
        .optional()
        .describe(`Input image detail level. Allowed: ${DETAIL_LEVELS.join(", ")}`),
      mask: tool.schema
        .string()
        .optional()
        .describe("Declared but not read by the tool; supplying it has no effect."),
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

        const rawOptions: GenerateOptions = {
          prompt: args.prompt,
          size: args.size,
          quality: args.quality as GenerateOptions["quality"],
          outputFormat: args.outputFormat as GenerateOptions["outputFormat"],
          background: args.background as GenerateOptions["background"],
          count: args.count,
          timeoutSeconds: args.timeout,
          inputImages: args.images,
          authFile: args.authFile,
          allowRefresh: args.allowRefresh,
          detail: args.detail as GenerateOptions["detail"],
          action: args.action as GenerateOptions["action"],
          moderation: args.moderation as GenerateOptions["moderation"],
        };

        // Validate before any credential or network work.
        const validation = await validateGenerateOptions(rawOptions, args.out);
        const validated = validation.options;
        const promptAugmentation = validation.promptAugmentation;

        log("generate_image tool validated options", {
          model: validated.model,
          size: validated.size,
          count: validated.count,
        });

        const credentialOptions: ReadCredentialOptions = {
          authFile: args.authFile,
          allowRefresh: args.allowRefresh,
        };

        const credential = await readCredential(credentialOptions);

        if (args.dryRun) {
          const headers = buildHeaders(credential.accessToken);
          const body = await buildBody(validated);
          const dryRunContent = JSON.stringify(shapeDryRunOutput(headers, body), null, 2);
          return `Dry run: request not sent. Constructed request shape:\n\n${dryRunContent}`;
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

        return formatSuccessResult(result, validated.model, promptAugmentation);
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
