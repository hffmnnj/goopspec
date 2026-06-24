import type { Model, OpenCodeClient, Provider } from './types.js';

/**
 * A model paired with the provider it belongs to. Useful for flat lists
 * (e.g. the model switcher in T6.2) where the provider context must travel
 * with each model.
 */
export interface ProviderModel {
  providerId: string;
  providerName: string;
  model: Model;
}

/** Fetch the configured providers (and their models) from the server. */
export async function fetchProviders(client: OpenCodeClient): Promise<Provider[]> {
  const providers = await client.listProviders();
  return [...providers].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Flatten providers into a single list of `{ provider, model }` pairs,
 * preserving provider order. This is the shared shape consumed by both the
 * settings panel and the model switcher.
 */
export function flattenModels(providers: Provider[]): ProviderModel[] {
  return providers.flatMap((provider) =>
    provider.models.map((model) => ({
      providerId: provider.id,
      providerName: provider.name,
      model,
    }))
  );
}

/** Find a single model (with its provider context) by model id. */
export function findModel(providers: Provider[], modelId: string): ProviderModel | undefined {
  for (const provider of providers) {
    const model = provider.models.find((m) => m.id === modelId);
    if (model) {
      return { providerId: provider.id, providerName: provider.name, model };
    }
  }
  return undefined;
}

/** Find a model scoped to a specific provider. */
export function findModelInProvider(
  providers: Provider[],
  providerId: string,
  modelId: string
): Model | undefined {
  return providers
    .find((provider) => provider.id === providerId)
    ?.models.find((model) => model.id === modelId);
}

/** Group models by provider id, returning a map of providerId → models. */
export function groupModelsByProvider(providers: Provider[]): Map<string, Model[]> {
  const grouped = new Map<string, Model[]>();
  for (const provider of providers) {
    grouped.set(provider.id, [...provider.models]);
  }
  return grouped;
}

/** Total number of models across all providers. */
export function countModels(providers: Provider[]): number {
  return providers.reduce((total, provider) => total + provider.models.length, 0);
}

/**
 * Format a model's context window as a compact, human-readable label.
 * Returns `undefined` when the model exposes no context limit.
 */
export function formatContext(context: number | undefined): string | undefined {
  if (typeof context !== 'number' || context <= 0 || !Number.isFinite(context)) {
    return undefined;
  }
  if (context >= 1_000_000) {
    return `${trimZero(context / 1_000_000)}M tokens`;
  }
  if (context >= 1_000) {
    return `${trimZero(context / 1_000)}K tokens`;
  }
  return `${context} tokens`;
}

function trimZero(value: number): string {
  return Number(value.toFixed(1)).toString();
}
