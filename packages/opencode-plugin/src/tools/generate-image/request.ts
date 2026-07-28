/**
 * Request construction and dispatch for generate_image.
 *
 * Builds exactly the JSON body and four-header set the ChatGPT Responses
 * endpoint accepts, then sends via Bun fetch with a timeout signal.
 */

import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";

import { DEFAULT_TIMEOUT_SECONDS, RESPONSES_ENDPOINT } from "./constants.js";
import type { ValidatedGenerateOptions } from "./validate.js";

export interface RequestBody {
  model: string;
  input: RequestInputMessage[];
  instructions: string;
  tools: [ImageGenerationTool];
  tool_choice: { type: "image_generation" };
  stream: true;
  store: false;
}

interface RequestInputMessage {
  role: "user";
  content: InputContent[];
}

type InputContent = { type: "input_text"; text: string } | InputImageContent;

interface InputImageContent {
  type: "input_image";
  image_url: string;
  detail?: string;
}

interface ImageGenerationTool {
  type: "image_generation";
  model?: string;
  size?: string;
  quality?: string;
  output_format?: string;
  background?: string;
  detail?: string;
  action?: string;
  moderation?: string;
}

export interface RequestHeaders {
  Authorization: string;
  Accept: string;
  "Content-Type": string;
  "User-Agent": string;
  [key: string]: string;
}

export class RequestError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "RequestError";
    this.status = status;
  }
}

function readPackageVersion(): string {
  try {
    const pkgPath = join("packages", "opencode-plugin", "package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as { version?: string };
    return pkg.version ?? "1.0.0";
  } catch {
    return "1.0.0";
  }
}

export function buildHeaders(accessToken: string): RequestHeaders {
  return {
    Authorization: `Bearer ${accessToken}`,
    Accept: "text/event-stream",
    "Content-Type": "application/json",
    "User-Agent": `@goopspec/opencode-plugin/${readPackageVersion()}`,
  };
}

async function encodeInputImage(path: string): Promise<string> {
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

export async function buildBody(options: ValidatedGenerateOptions): Promise<RequestBody> {
  const content: InputContent[] = [{ type: "input_text", text: options.prompt }];

  for (const imagePath of options.inputImages) {
    content.push({
      type: "input_image",
      image_url: await encodeInputImage(imagePath),
      detail: options.detail,
    });
  }

  const tool: ImageGenerationTool = { type: "image_generation", model: "gpt-image-2" };

  if (options.size) tool.size = options.size;
  if (options.quality) tool.quality = options.quality;
  if (options.outputFormat) tool.output_format = options.outputFormat;
  if (options.background) tool.background = options.background;
  if (options.detail) tool.detail = options.detail;
  if (options.action) tool.action = options.action;
  if (options.moderation) tool.moderation = options.moderation;

  return {
    model: "gpt-5.5",
    input: [{ role: "user", content }],
    instructions: "You are an image generation assistant.",
    tools: [tool],
    tool_choice: { type: "image_generation" },
    stream: true,
    store: false,
  };
}

function describeHttpErrorStatus(status: number): string {
  if (status === 401) return "unauthorized";
  if (status === 403) return "forbidden";
  if (status === 429) return "rate-limited";
  if (status >= 500) return "server error";
  return "request failed";
}

async function extractErrorDetail(response: Response): Promise<string> {
  const contentType = response.headers.get("content-type") ?? "";
  let bodyText = "";
  try {
    bodyText = await response.text();
  } catch {
    bodyText = "";
  }

  if (!bodyText) {
    return response.statusText ?? "";
  }

  if (contentType.includes("application/json")) {
    try {
      const parsed = JSON.parse(bodyText) as Record<string, unknown>;
      const message =
        typeof parsed.error === "object" && parsed.error !== null
          ? (parsed.error as Record<string, unknown>).message
          : parsed.message;
      if (typeof message === "string" && message.length > 0) {
        return message;
      }
    } catch {
      // Fall through to returning the raw text.
    }
  }

  return bodyText;
}

export async function sendRequest(
  body: RequestBody,
  headers: RequestHeaders,
  timeoutSeconds?: number,
): Promise<Response> {
  const timeout = timeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS;
  let response: Response;

  try {
    response = await fetch(RESPONSES_ENDPOINT, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeout * 1000),
    });
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new RequestError(0, `generate_image request failed: ${reason}`);
  }

  if (
    response.status === 401 ||
    response.status === 403 ||
    response.status === 429 ||
    response.status >= 500
  ) {
    const detail = await extractErrorDetail(response);
    const summary = detail ? `: ${detail}` : "";
    throw new RequestError(
      response.status,
      `generate_image ${describeHttpErrorStatus(response.status)} (HTTP ${response.status})${summary}`,
    );
  }

  return response;
}
