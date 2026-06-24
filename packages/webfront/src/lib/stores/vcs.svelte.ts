/**
 * VCS store — Svelte 5 runes.
 *
 * Holds the current git branch (and dirty state) for the active workspace,
 * sourced from `getVcsInfo()` → `GET /vcs`. Refreshing is best-effort: a failed
 * adapter call leaves the store empty rather than surfacing an error, since
 * branch display is metadata, not primary UI.
 */

import { createClient } from '../api/client.js';
import type { OpenCodeClient, VcsInfo } from '../api/types.js';

class VcsStore {
  info = $state<VcsInfo>(null);

  constructor(private readonly client: OpenCodeClient) {}

  async refresh(): Promise<void> {
    try {
      this.info = await this.client.getVcsInfo();
    } catch {
      this.info = null;
    }
  }

  reset(): void {
    this.info = null;
  }
}

export function createVcsStore(client?: OpenCodeClient): VcsStore {
  return new VcsStore(client ?? createClient());
}

export const vcs = createVcsStore();

export type { VcsStore };
