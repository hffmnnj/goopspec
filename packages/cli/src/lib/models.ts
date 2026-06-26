import { FALLBACK_MODELS, type ModelEntry } from "./models-fallback.js";

export type { ModelEntry };

export type ModelSource = "live" | "fallback";

export interface ModelFetchResult {
  models: ModelEntry[];
  source: ModelSource;
}

const OPENCODE_MODEL_ENDPOINT = "http://localhost:4321/model";
const MODEL_FETCH_TIMEOUT_MS = 1_500;

type RawRecord = Record<string, unknown>;

/**
 * Fetch available models.
 * 1. Attempt GET http://localhost:4321/model with 1.5s timeout
 * 2. On success: normalize response to ModelEntry[]
 * 3. On failure: return FALLBACK_MODELS
 */
export async function fetchModels(): Promise<ModelFetchResult> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), MODEL_FETCH_TIMEOUT_MS);

    try {
      const response = await fetch(OPENCODE_MODEL_ENDPOINT, {
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });

      if (!response.ok) {
        return fallbackResult();
      }

      const payload = await response.json();
      const models = normalizeModels(payload);
      return models.length > 0 ? { models, source: "live" } : fallbackResult();
    } finally {
      clearTimeout(timeout);
    }
  } catch {
    return fallbackResult();
  }
}

function fallbackResult(): ModelFetchResult {
  return { models: FALLBACK_MODELS, source: "fallback" };
}

function asRecord(value: unknown): RawRecord {
  return typeof value === "object" && value !== null ? (value as RawRecord) : {};
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function unwrapPayload(payload: unknown): unknown {
  const record = asRecord(payload);
  return record.data ?? payload;
}

function normalizeModels(payload: unknown): ModelEntry[] {
  const unwrapped = unwrapPayload(payload);
  const record = asRecord(unwrapped);
  const providerSource = record.providers ?? record.provider;

  if (providerSource !== undefined) {
    return normalizeProviders(providerSource);
  }

  const modelSource = record.models ?? record.model ?? unwrapped;
  if (Array.isArray(modelSource) && modelSource.some((entry) => hasNestedModels(entry))) {
    return normalizeProviders(modelSource);
  }

  return normalizeModelCollection(modelSource);
}

function hasNestedModels(value: unknown): boolean {
  const record = asRecord(value);
  return record.models !== undefined || record.model !== undefined;
}

function normalizeProviders(value: unknown): ModelEntry[] {
  if (Array.isArray(value)) {
    return value.flatMap((provider) => normalizeProvider(provider));
  }

  return Object.entries(asRecord(value)).flatMap(([providerId, provider]) =>
    normalizeProvider(provider, providerId),
  );
}

function normalizeProvider(value: unknown, fallbackProviderId = ""): ModelEntry[] {
  const record = asRecord(value);
  const providerId = asString(record.id ?? record.providerID, fallbackProviderId) || asString(record.name);
  const providerName = asString(record.name ?? record.label ?? record.displayName, providerLabel(providerId));
  const models = record.models ?? record.model ?? [];

  return normalizeModelCollection(models, providerId, providerName);
}

function normalizeModelCollection(value: unknown, providerId = "", providerName = ""): ModelEntry[] {
  if (Array.isArray(value)) {
    return value
      .map((model) => normalizeModel(model, undefined, providerId, providerName))
      .filter((model): model is ModelEntry => model !== undefined);
  }

  return Object.entries(asRecord(value))
    .map(([modelId, model]) => normalizeModel(model, modelId, providerId, providerName))
    .filter((model): model is ModelEntry => model !== undefined);
}

function normalizeModel(
  value: unknown,
  fallbackModelId?: string,
  providerId = "",
  providerName = "",
): ModelEntry | undefined {
  const record = asRecord(value);
  const rawId = asString(record.id ?? record.modelID, fallbackModelId) || asString(record.name);
  if (!rawId) return undefined;

  const id = providerId && !rawId.includes("/") ? `${providerId}/${rawId}` : rawId;
  const provider = providerName || providerLabel(id);

  return {
    id,
    name: asString(record.name ?? record.label ?? record.displayName, rawId),
    provider,
  };
}

function providerLabel(modelId: string): string {
  const providerId = modelId.includes("/") ? modelId.split("/", 1)[0] : modelId;
  const knownProviders: Record<string, string> = {
    anthropic: "Anthropic",
    openai: "OpenAI",
    google: "Google",
    groq: "Groq",
    mistral: "Mistral",
    openrouter: "OpenRouter",
    xai: "xAI",
    ollama: "Ollama",
    azure: "Azure",
  };

  if (!providerId) return "Unknown";
  return knownProviders[providerId] ?? titleCaseProvider(providerId);
}

function titleCaseProvider(providerId: string): string {
  return providerId
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
