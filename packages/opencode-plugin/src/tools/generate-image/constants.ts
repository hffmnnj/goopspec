/**
 * Endpoint, enum, and limit constants for the generate_image MCP tool.
 *
 * Keeping these in one file makes backend drift a one-line fix and keeps the
 * network surface explicit.
 */

export const RESPONSES_ENDPOINT = "https://chatgpt.com/backend-api/codex/responses";

export const OAUTH_TOKEN_ENDPOINT = "https://auth.openai.com/oauth/token";

export const OAUTH_CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";

export const DEFAULT_TIMEOUT_SECONDS = 180;

export const MAX_INPUT_IMAGES = 5;

export const MAX_INPUT_IMAGE_BYTES = 64 * 1024 * 1024;

export const MAX_COUNT = 4;

export const EXPIRY_MARGIN_MS = 60000;

export const IMAGE_MODELS = ["gpt-image-2", "gpt-image-1.5"] as const;

export type ImageModel = (typeof IMAGE_MODELS)[number];

export const IMAGE_QUALITIES = ["low", "medium", "high", "auto"] as const;

export type ImageQuality = (typeof IMAGE_QUALITIES)[number];

export const OUTPUT_FORMATS = ["png", "jpeg", "webp"] as const;

export type OutputFormat = (typeof OUTPUT_FORMATS)[number];

export const BACKGROUNDS = ["transparent", "opaque", "auto"] as const;

export type Background = (typeof BACKGROUNDS)[number];

export const DETAIL_LEVELS = ["low", "high", "auto", "original"] as const;

export type Detail = (typeof DETAIL_LEVELS)[number];

export const IMAGE_ACTIONS = ["generate", "edit", "auto"] as const;

export type ImageAction = (typeof IMAGE_ACTIONS)[number];

export const INPUT_FIDELITIES = ["low", "high"] as const;

export type InputFidelity = (typeof INPUT_FIDELITIES)[number];

export const MODERATION_LEVELS = ["auto", "low"] as const;

export type Moderation = (typeof MODERATION_LEVELS)[number];
