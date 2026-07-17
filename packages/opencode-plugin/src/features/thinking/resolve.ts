import type { ThinkingLevel } from "../setup/index.js";
import type { CapabilityResult, ThinkingVariant } from "./capability.js";

export const THINKING_LABEL_CANDIDATES: Readonly<Record<ThinkingLevel, readonly string[]>> = {
  none: ["none"],
  low: ["low"],
  medium: ["medium"],
  high: ["high"],
  xhigh: ["xhigh"],
};

export type ResolvedThinkingValue = ThinkingVariant | string;

export type ThinkingResolutionSource = "v1" | "v2" | "preserve-default";

export interface ThinkingResolution {
  apply: ResolvedThinkingValue | null;
  warning?: string;
  source: ThinkingResolutionSource;
}

function findCandidate(label: ThinkingLevel, supported: readonly string[]): string | undefined {
  return THINKING_LABEL_CANDIDATES[label].find((candidate) => supported.includes(candidate));
}

function createPreserveDefaultResolution(label: ThinkingLevel): ThinkingResolution {
  return {
    apply: null,
    warning: `Thinking level "${label}" is not supported by the resolved model; preserving the provider default.`,
    source: "preserve-default",
  };
}

/**
 * Resolves a canonical label only when the live capability data explicitly
 * supports it. This deliberately never substitutes a nearby level.
 */
export function resolveThinkingValue(label: ThinkingLevel, capabilities: CapabilityResult): ThinkingResolution {
  try {
    const candidate = findCandidate(label, capabilities.supported);
    if (!candidate || !capabilities.raw) return createPreserveDefaultResolution(label);

    if (capabilities.raw.source === "v2") {
      const variant = capabilities.raw.variants.find((entry) => entry.id === candidate);
      return variant
        ? { apply: variant, source: "v2" }
        : createPreserveDefaultResolution(label);
    }

    return { apply: candidate, source: "v1" };
  } catch {
    return createPreserveDefaultResolution(label);
  }
}
