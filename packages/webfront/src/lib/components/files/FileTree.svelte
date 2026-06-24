<script lang="ts">
  import { HugeiconsIcon } from '@hugeicons/svelte';
  import { InboxIcon, Alert02Icon, RefreshIcon } from '@hugeicons/core-free-icons';
  import { listDirectory } from '$lib/api/files.js';
  import { createClient } from '$lib/api/client.js';
  import { filterTree } from '$lib/files/filter.js';
  import type { FileEntry, OpenCodeClient } from '$lib/api/types.js';
  import FileTreeNode from './FileTreeNode.svelte';

  interface FileTreeProps {
    /** Workspace root path to load. Provided by the workspace store/switcher (T7.3). */
    rootPath?: string;
    /** Filter query. The search input + filter logic live in T7.2; this applies it. */
    searchQuery?: string;
    /** Called when a file is selected. */
    onFileSelect?: (path: string) => void;
    /** The currently-active file path, highlighted in the tree. */
    activePath?: string;
    /** Override the OpenCode client (tests). Defaults to a configured client. */
    client?: OpenCodeClient;
  }

  let {
    rootPath = '.',
    searchQuery = '',
    onFileSelect,
    activePath,
    client
  }: FileTreeProps = $props();

  const resolvedClient = $derived(client ?? createClient());

  let entries = $state<FileEntry[]>([]);
  let loading = $state(false);
  let error = $state<string | null>(null);

  const visibleEntries = $derived(filterTree(entries, searchQuery));
  const isFiltering = $derived(searchQuery.trim().length > 0);

  async function load(): Promise<void> {
    loading = true;
    error = null;
    try {
      entries = await listDirectory(resolvedClient, rootPath);
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load files';
      entries = [];
    } finally {
      loading = false;
    }
  }

  // Reload whenever the workspace root changes (incl. first mount).
  $effect(() => {
    void rootPath;
    void load();
  });
</script>

<nav class="file-tree" aria-label="Workspace files">
  {#if loading}
    <div class="state" aria-busy="true" aria-label="Loading files">
      {#each Array.from({ length: 6 }) as _, i (i)}
        <div class="sk-row" style:padding-inline-start={`${(i % 3) * 0.875 + 0.5}rem`} aria-hidden="true">
          <span class="sk-dot"></span>
          <span class="sk-line" style:width={`${50 + ((i * 13) % 35)}%`}></span>
        </div>
      {/each}
    </div>
  {:else if error}
    <div class="state state--error" role="alert">
      <HugeiconsIcon icon={Alert02Icon} size={20} strokeWidth={1.5} color="currentColor" />
      <p class="state-detail">{error}</p>
      <button type="button" class="retry" onclick={load}>
        <HugeiconsIcon icon={RefreshIcon} size={14} strokeWidth={1.5} color="currentColor" />
        Retry
      </button>
    </div>
  {:else if entries.length === 0}
    <div class="state state--empty">
      <HugeiconsIcon icon={InboxIcon} size={22} strokeWidth={1.5} color="currentColor" />
      <p class="state-detail">No files in this workspace.</p>
    </div>
  {:else if isFiltering && visibleEntries.length === 0}
    <div class="state state--empty">
      <HugeiconsIcon icon={InboxIcon} size={22} strokeWidth={1.5} color="currentColor" />
      <p class="state-detail">No files match “{searchQuery.trim()}”.</p>
    </div>
  {:else}
    <ul role="tree" aria-label="Workspace files" class="tree-root">
      {#each visibleEntries as entry (entry.path)}
        <FileTreeNode
          {entry}
          client={resolvedClient}
          depth={0}
          {activePath}
          {onFileSelect}
        />
      {/each}
    </ul>
  {/if}
</nav>

<style>
  .file-tree {
    display: flex;
    flex-direction: column;
    min-height: 0;
    height: 100%;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 0.5rem;
  }

  .tree-root {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .state {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 0.5rem;
  }

  .state--empty,
  .state--error {
    align-items: center;
    text-align: center;
    padding: 2rem 1rem;
    color: var(--text-muted);
  }

  .state--error {
    color: #ef4444;
  }

  .state-detail {
    margin: 0;
    font-size: 0.8125rem;
    color: var(--text-muted);
  }

  .retry {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    margin-top: 0.25rem;
    padding: 0.4rem 0.75rem;
    font-size: 0.8125rem;
    font-weight: 500;
    color: var(--text-primary);
    background-color: var(--bg-elevated);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition:
      background-color var(--transition-fast),
      border-color var(--transition-fast);
  }

  .retry:hover {
    background-color: var(--bg-surface);
    border-color: var(--border-strong);
  }

  .retry:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  /* ---- Loading skeleton ---- */
  .sk-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding-block: 0.3rem;
    padding-inline-end: 0.5rem;
  }

  .sk-dot {
    flex: 0 0 auto;
    width: 0.9rem;
    height: 0.9rem;
    border-radius: var(--radius-sm);
  }

  .sk-line {
    height: 0.6rem;
    border-radius: var(--radius-full);
  }

  .sk-dot,
  .sk-line {
    background: linear-gradient(
      90deg,
      var(--bg-surface) 25%,
      var(--bg-elevated) 50%,
      var(--bg-surface) 75%
    );
    background-size: 200% 100%;
    animation: shimmer 1.4s ease-in-out infinite;
  }

  @keyframes shimmer {
    from {
      background-position: 200% 0;
    }
    to {
      background-position: -200% 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .sk-dot,
    .sk-line {
      animation: none;
    }
    .retry {
      transition: none;
    }
  }
</style>
