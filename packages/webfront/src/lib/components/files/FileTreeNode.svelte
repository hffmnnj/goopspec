<script lang="ts">
  import { HugeiconsIcon } from '@hugeicons/svelte';
  import {
    Folder01Icon,
    FolderOpenIcon,
    File01Icon,
    SourceCodeIcon,
    Image01Icon,
    ArrowRight01Icon,
    Loading03Icon,
    Alert02Icon
  } from '@hugeicons/core-free-icons';
  import { untrack } from 'svelte';
  import { listDirectory, fileKind, type FileKind } from '$lib/api/files.js';
  import type { FileEntry, OpenCodeClient } from '$lib/api/types.js';
  import FileTreeNode from './FileTreeNode.svelte';

  interface FileTreeNodeProps {
    entry: FileEntry;
    client: OpenCodeClient;
    depth: number;
    activePath?: string;
    onFileSelect?: (path: string) => void;
  }

  let { entry, client, depth, activePath, onFileSelect }: FileTreeNodeProps = $props();

  // `entry` is stable per node instance (keyed {#each}); seed preloaded children once.
  const preloaded = untrack(() => entry.children);

  let expanded = $state(false);
  let loaded = $state(preloaded !== undefined);
  let loading = $state(false);
  let error = $state<string | null>(null);
  let children = $state<FileEntry[]>(preloaded ?? []);

  const isDirectory = $derived(entry.type === 'directory');
  const isActive = $derived(!isDirectory && activePath === entry.path);
  const kind = $derived<FileKind>(fileKind(entry));

  const FILE_ICON = {
    code: SourceCodeIcon,
    image: Image01Icon,
    text: File01Icon,
    directory: File01Icon
  } as const;

  async function loadChildren(): Promise<void> {
    if (loaded || loading) return;
    loading = true;
    error = null;
    try {
      children = await listDirectory(client, entry.path);
      loaded = true;
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load directory';
    } finally {
      loading = false;
    }
  }

  async function toggle(): Promise<void> {
    if (!isDirectory) {
      onFileSelect?.(entry.path);
      return;
    }
    expanded = !expanded;
    if (expanded && !loaded) await loadChildren();
  }

  function activate(): void {
    if (isDirectory) void toggle();
    else onFileSelect?.(entry.path);
  }

  async function handleKeydown(event: KeyboardEvent): Promise<void> {
    switch (event.key) {
      case 'Enter':
      case ' ':
        event.preventDefault();
        activate();
        break;
      case 'ArrowRight':
        if (isDirectory) {
          event.preventDefault();
          if (!expanded) {
            expanded = true;
            if (!loaded) await loadChildren();
          }
        }
        break;
      case 'ArrowLeft':
        if (isDirectory && expanded) {
          event.preventDefault();
          expanded = false;
        }
        break;
    }
  }

  // Indentation: each level adds a fixed inset; row content starts after it.
  const indent = $derived(`${depth * 0.875 + 0.5}rem`);
</script>

<li role="none" class="node">
  <div
    role="treeitem"
    aria-expanded={isDirectory ? expanded : undefined}
    aria-selected={isActive}
    aria-current={isActive ? 'true' : undefined}
    aria-label={entry.name}
    tabindex={0}
    class="row"
    class:active={isActive}
    class:directory={isDirectory}
    style:padding-inline-start={indent}
    onclick={activate}
    onkeydown={handleKeydown}
  >
    <span class="chevron" class:hidden={!isDirectory} aria-hidden="true">
      {#if loading}
        <span class="spin">
          <HugeiconsIcon icon={Loading03Icon} size={13} strokeWidth={1.5} color="currentColor" />
        </span>
      {:else}
        <span class="chev-icon" class:open={expanded}>
          <HugeiconsIcon icon={ArrowRight01Icon} size={13} strokeWidth={2} color="currentColor" />
        </span>
      {/if}
    </span>

    <span class="type-icon" class:dir={isDirectory} aria-hidden="true">
      {#if isDirectory}
        <HugeiconsIcon icon={expanded ? FolderOpenIcon : Folder01Icon} size={15} strokeWidth={1.5} color="currentColor" />
      {:else}
        <HugeiconsIcon icon={FILE_ICON[kind]} size={15} strokeWidth={1.5} color="currentColor" />
      {/if}
    </span>

    <span class="name">{entry.name}</span>
  </div>

  {#if isDirectory && expanded}
    {#if error}
      <div class="child-state error" role="alert" style:padding-inline-start={indent}>
        <HugeiconsIcon icon={Alert02Icon} size={13} strokeWidth={1.5} color="currentColor" />
        <span>{error}</span>
      </div>
    {:else if loaded && children.length === 0}
      <div class="child-state muted" style:padding-inline-start={indent}>Empty folder</div>
    {:else if children.length > 0}
      <ul role="group" class="children">
        {#each children as child (child.path)}
          <FileTreeNode entry={child} {client} depth={depth + 1} {activePath} {onFileSelect} />
        {/each}
      </ul>
    {/if}
  {/if}
</li>

<style>
  .node {
    list-style: none;
  }

  .children {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .row {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    width: 100%;
    padding-block: 0.25rem;
    padding-inline-end: 0.5rem;
    border-radius: var(--radius-sm);
    color: var(--text-secondary);
    cursor: pointer;
    user-select: none;
    transition:
      color var(--transition-fast),
      background-color var(--transition-fast);
  }

  .row:hover {
    color: var(--text-primary);
    background-color: var(--bg-surface);
  }

  .row:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
  }

  .row.active {
    color: var(--accent);
    background-color: var(--accent-soft);
  }

  .chevron {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    width: 1rem;
    height: 1rem;
    color: var(--text-muted);
  }

  .chevron.hidden {
    visibility: hidden;
  }

  .chev-icon {
    display: inline-flex;
    transition: transform var(--transition-fast) var(--ease-out);
  }

  .chev-icon.open {
    transform: rotate(90deg);
  }

  .type-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    color: var(--text-muted);
  }

  .type-icon.dir {
    color: var(--accent);
  }

  .row.active .type-icon {
    color: var(--accent);
  }

  .name {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 0.8125rem;
    line-height: 1.2;
  }

  .child-state {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    padding-block: 0.25rem;
    padding-inline-end: 0.5rem;
    font-size: 0.75rem;
  }

  .child-state.muted {
    color: var(--text-muted);
  }

  .child-state.error {
    color: #ef4444;
  }

  .spin {
    display: inline-flex;
    animation: spin 0.9s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .row,
    .chev-icon,
    .spin {
      transition: none;
      animation: none;
    }
  }
</style>
