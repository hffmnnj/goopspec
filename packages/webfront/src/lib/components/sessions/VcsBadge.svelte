<script lang="ts">
  import { onMount } from 'svelte';
  import { HugeiconsIcon } from '@hugeicons/svelte';
  import { GitBranchIcon } from '@hugeicons/core-free-icons';
  import { vcs as defaultVcs } from '$lib/stores/vcs.svelte.js';
  import { connection as defaultConnection } from '$lib/stores/connection.svelte.js';
  import type { GlobalEvent, VcsInfo } from '$lib/api/types.js';
  import { hasBranch, branchLabel, isDirty, ariaLabel, isVcsRefreshEvent } from './vcs-badge.js';

  interface VcsLike {
    info: VcsInfo;
    refresh(): Promise<void>;
  }

  interface ConnectionLike {
    onGlobalEvent(listener: (event: GlobalEvent) => void): () => void;
  }

  interface VcsBadgeProps {
    /** Override the VCS store (defaults to the shared reactive store). */
    store?: VcsLike;
    /** Override the connection store (defaults to the shared reactive store). */
    connectionStore?: ConnectionLike;
  }

  let {
    store = defaultVcs as VcsLike,
    connectionStore = defaultConnection as ConnectionLike,
  }: VcsBadgeProps = $props();

  const info = $derived(store.info);
  const visible = $derived(hasBranch(info));
  const branch = $derived(branchLabel(info));
  const dirty = $derived(isDirty(info));
  const label = $derived(ariaLabel(info));

  onMount(() => {
    void store.refresh();
    return connectionStore.onGlobalEvent((event) => {
      if (isVcsRefreshEvent(event)) void store.refresh();
    });
  });
</script>

{#if visible}
  <span class="vcs-badge" aria-label={label} title={label}>
    <HugeiconsIcon icon={GitBranchIcon} size={13} strokeWidth={1.5} color="currentColor" />
    <span class="vcs-branch">{branch}</span>
    {#if dirty}
      <span class="vcs-dirty" aria-hidden="true" title="Uncommitted changes">●</span>
    {/if}
  </span>
{/if}

<style>
  .vcs-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.3125rem;
    min-width: 0;
    max-width: 100%;
    padding: 0.125rem 0.25rem;
    font-size: 0.6875rem;
    line-height: 1.2;
    color: var(--text-muted);
    font-variant-numeric: tabular-nums;
  }

  .vcs-branch {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .vcs-dirty {
    flex: 0 0 auto;
    font-size: 0.625rem;
    line-height: 1;
    color: var(--accent-text);
  }
</style>
