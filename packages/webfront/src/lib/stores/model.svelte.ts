import { findModel } from '../api/providers.js';
import type { Model, Provider } from '../api/types.js';

const STORAGE_KEY = 'goopspec-model';

interface StoredModel {
  providerId: string;
  modelId: string;
}

/** SSR-safe browser check. */
function isBrowser(): boolean {
  return typeof window !== 'undefined';
}

function readStored(): StoredModel | null {
  if (!isBrowser()) return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof (parsed as Record<string, unknown>).providerId === 'string' &&
      typeof (parsed as Record<string, unknown>).modelId === 'string'
    ) {
      return parsed as StoredModel;
    }
    return null;
  } catch {
    return null;
  }
}

function writeStored(providerId: string, modelId: string): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ providerId, modelId }));
  } catch {
    // Persistence is best-effort.
  }
}

/**
 * Reactive model selection store.
 *
 * Holds the active provider/model, persists the choice to localStorage, and
 * falls back to the first provider's first model when the provider list is
 * first supplied. The store is intentionally decoupled from the chat store so
 * that the model switcher can be opened without triggering a message send.
 */
class ModelStore {
  /** Active provider id (null before providers are supplied). */
  selectedProviderId = $state<string | null>(null);
  /** Active model id (null before providers are supplied). */
  selectedModelId = $state<string | null>(null);

  private providers: Provider[] = [];

  /** Resolved model record for the current selection, or null. */
  get selectedModel(): Model | null {
    const providerId = this.selectedProviderId;
    const modelId = this.selectedModelId;
    if (!providerId || !modelId) return null;
    const match = findModel(this.providers, modelId);
    return match && match.providerId === providerId ? match.model : null;
  }

  /** Seed the available providers and choose a default if needed. */
  setProviders(providers: Provider[]): void {
    this.providers = Array.isArray(providers) ? providers : [];
    const stored = readStored();

    if (stored) {
      const match = findModel(this.providers, stored.modelId);
      if (match && match.providerId === stored.providerId) {
        this.selectedProviderId = stored.providerId;
        this.selectedModelId = stored.modelId;
        return;
      }
    }

    const firstProvider = this.providers[0];
    const firstModel = firstProvider?.models.find((candidate) => candidate.id === firstProvider.defaultModelId) ?? firstProvider?.models[0];
    if (firstProvider && firstModel) {
      this.selectedProviderId = firstProvider.id;
      this.selectedModelId = firstModel.id;
      writeStored(firstProvider.id, firstModel.id);
    }
  }

  /** Select a model by provider + model id. */
  select(providerId: string, modelId: string): void {
    const match = findModel(this.providers, modelId);
    if (!match || match.providerId !== providerId) return;

    this.selectedProviderId = providerId;
    this.selectedModelId = modelId;
    writeStored(providerId, modelId);
  }

  /** Reset to an unselected state (useful for tests). */
  reset(): void {
    this.selectedProviderId = null;
    this.selectedModelId = null;
    this.providers = [];
  }
}

/** Create an isolated model store for tests. */
export function createModelStore(): ModelStore {
  return new ModelStore();
}

/** Shared reactive model selection singleton. */
export const model = createModelStore();
