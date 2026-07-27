/**
 * Tool-local types for generate_image.
 */

import type {
  Background,
  Detail,
  ImageAction,
  ImageModel,
  ImageQuality,
  InputFidelity,
  Moderation,
  OutputFormat,
} from "./constants.js";

export type AuthSource =
  | { kind: "explicit"; path: string }
  | { kind: "env"; path: string }
  | { kind: "xdg"; path: string }
  | { kind: "codex"; path: string }
  | { kind: "gpt-image"; path: string };

export interface NormalizedCredential {
  accessToken: string;
  refreshToken?: string;
  /** Epoch milliseconds at which the access token expires. */
  expiresAtMs: number;
  accountId?: string;
  source: AuthSource;
}

export interface GenerateOptions {
  prompt: string;
  model: ImageModel;
  quality?: ImageQuality;
  outputFormat?: OutputFormat;
  background?: Background;
  detail?: Detail;
  action?: ImageAction;
  inputFidelity?: InputFidelity;
  moderation?: Moderation;
  size?: string;
  count?: number;
  authFile?: string;
  allowRefresh?: boolean;
  timeoutSeconds?: number;
  inputImages?: string[];
}

export interface ExtractedImage {
  base64: string;
  revisedPrompt?: string;
}
