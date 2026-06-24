import { createClient } from '../api/client.js';
import type { SlashCommand, OpenCodeClient } from '../api/types.js';

/**
 * Reactive store for the OpenCode slash-command catalog (`GET /command`).
 *
 * Hydrated lazily — the message input calls `refresh()` the first time the user
 * types a leading `/`, so disconnected sessions pay no cost until a command is
 * actually requested. Failures degrade to an empty list rather than throwing.
 */
export class CommandStore {
  commands = $state<SlashCommand[]>([]);
  loading = $state(false);
  error = $state<string | null>(null);
  loaded = $state(false);

  constructor(private readonly client: OpenCodeClient = createClient()) {}

  async refresh(): Promise<void> {
    this.loading = true;
    this.error = null;
    try {
      const loaded = await this.client.listCommands();
      this.commands = Array.isArray(loaded) ? loaded : [];
      this.loaded = true;
    } catch (err) {
      this.error = err instanceof Error ? err.message : 'Failed to load commands';
      this.commands = [];
    } finally {
      this.loading = false;
    }
  }

  /** Hydrate once; repeated triggers reuse the cached catalog. */
  async ensureLoaded(): Promise<void> {
    if (this.loaded || this.loading) return;
    await this.refresh();
  }

  reset(): void {
    this.commands = [];
    this.loading = false;
    this.error = null;
    this.loaded = false;
  }
}

export function createCommandStore(client?: OpenCodeClient): CommandStore {
  return new CommandStore(client);
}

export const commands = createCommandStore();
