export interface ThinkingVariant {
  id: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

export interface V2CapabilityRaw {
  source: "v2";
  variants: ThinkingVariant[];
}

export interface V1CapabilityRaw {
  source: "v1";
  options: Record<string, unknown>;
}

export interface CapabilityResult {
  supported: string[];
  raw: V1CapabilityRaw | V2CapabilityRaw | undefined;
}

const EMPTY_CAPABILITIES: CapabilityResult = { supported: [], raw: undefined };
const MAX_OPTION_DEPTH = 8;
const MAX_OPTION_VALUES = 100;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return isRecord(value) && Object.values(value).every((entry) => typeof entry === "string");
}

function getV2Variants(source: Record<string, unknown>): ThinkingVariant[] {
  if (!Array.isArray(source.variants)) return [];

  return source.variants.flatMap((candidate): ThinkingVariant[] => {
    if (!isRecord(candidate)) return [];

    const { id, headers, body } = candidate;
    if (
      typeof id !== "string" ||
      id.trim().length === 0 ||
      !isStringRecord(headers) ||
      !isRecord(body)
    ) {
      return [];
    }

    return [{ id, headers, body }];
  });
}

function collectOptionValues(value: unknown, values: Set<string>, depth = 0): void {
  if (depth > MAX_OPTION_DEPTH || values.size >= MAX_OPTION_VALUES) return;

  if (typeof value === "string") {
    if (value.trim().length > 0) values.add(value);
    return;
  }

  if (Array.isArray(value)) {
    for (const entry of value) collectOptionValues(entry, values, depth + 1);
    return;
  }

  if (isRecord(value)) {
    for (const entry of Object.values(value)) collectOptionValues(entry, values, depth + 1);
  }
}

/**
 * Collects string ids from `reasoning_options` entries. Prefers entries whose
 * `type` is `"effort"`; only when no effort entry exists does it fall back to
 * string values across all entries. Numeric fields are ignored because only
 * string values can map to thinking levels.
 */
function collectReasoningOptionIds(rawOptions: unknown, values: Set<string>): void {
  if (!Array.isArray(rawOptions)) return;

  const effort = new Set<string>();
  const fallback = new Set<string>();

  for (const entry of rawOptions) {
    if (!isRecord(entry)) continue;

    const target = entry.type === "effort" ? effort : fallback;
    collectOptionValues(entry.values, target);
  }

  const chosen = effort.size > 0 ? effort : fallback;
  for (const value of chosen) values.add(value);
}

/**
 * Collects ids from object-map `variants` (e.g. `{ high: { ... } }`). Only the
 * keys are significant here: headerless or partial entries still declare a
 * supported id, and no request headers or bodies are fabricated. Array variants
 * are handled separately by `getV2Variants`.
 */
function collectObjectMapVariantIds(rawVariants: unknown, values: Set<string>): void {
  if (!isRecord(rawVariants)) return;

  for (const [key, entry] of Object.entries(rawVariants)) {
    if (!isRecord(entry)) continue;
    const trimmed = key.trim();
    if (trimmed.length > 0) values.add(trimmed);
  }
}

/**
 * Collects supported ids from id-only V2 shapes (`reasoning_options` and
 * object-map `variants`) when no full array variants are present. The returned
 * ids carry no request encoding; callers that need a variant object must look
 * elsewhere. Numerics and malformed entries are ignored.
 */
function getV2IdOnlySupported(source: Record<string, unknown>): string[] {
  const values = new Set<string>();
  collectReasoningOptionIds(source.reasoning_options, values);
  collectObjectMapVariantIds(source.variants, values);
  return [...values];
}

function getV1Capabilities(source: Record<string, unknown>): CapabilityResult {
  if (
    !isRecord(source.capabilities) ||
    source.capabilities.reasoning !== true ||
    !isRecord(source.options)
  ) {
    return EMPTY_CAPABILITIES;
  }

  const values = new Set<string>();
  collectOptionValues(source.options, values);
  if (values.size === 0) return EMPTY_CAPABILITIES;

  return {
    supported: [...values],
    raw: { source: "v1", options: source.options },
  };
}

/**
 * Normalizes the capability data exposed by either OpenCode contract.
 *
 * V2 exposes exact variant identifiers and request details. V1 exposes a
 * reasoning capability plus provider options, so its supported values are
 * drawn from those option values. Unknown or malformed host data is ignored.
 */
export function resolveCapabilities(source: unknown): CapabilityResult {
  try {
    if (!isRecord(source)) return EMPTY_CAPABILITIES;

    const variants = getV2Variants(source);
    if (variants.length > 0) {
      return {
        supported: [...new Set(variants.map((variant) => variant.id))],
        raw: { source: "v2", variants },
      };
    }

    const idOnlySupported = getV2IdOnlySupported(source);
    if (idOnlySupported.length > 0) {
      return {
        supported: idOnlySupported,
        raw: { source: "v2", variants: [] },
      };
    }

    return getV1Capabilities(source);
  } catch {
    return EMPTY_CAPABILITIES;
  }
}
