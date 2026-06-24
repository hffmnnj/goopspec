<script lang="ts">
  import { HugeiconsIcon } from '@hugeicons/svelte';
  import {
    Folder01Icon,
    FolderLibraryIcon,
    ArrowDown01Icon,
    Add01Icon,
    Tick02Icon,
    Delete02Icon
  } from '@hugeicons/core-free-icons';
  import GlassSurface from './GlassSurface.svelte';
  import {
    workspace as defaultWorkspace,
    formatWorkspacePath
  } from '$lib/stores/workspace.svelte.js';
  import type { WorkspaceStore } from '$lib/stores/workspace.svelte.js';

  interface WorkspaceSwitcherProps {
    /** Override the workspace store (tests). */
    workspaceStore?: WorkspaceStore;
  }

  let { workspaceStore = defaultWorkspace }: WorkspaceSwitcherProps = $props();

  let open = $state(false);
  let addMode = $state(false);
  let newPath = $state('');
  let activeDescendant = $state<string | null>(null);
  let triggerEl = $state<HTMLButtonElement | null>(null);
  let popoverEl = $state<HTMLDivElement | null>(null);
  let addInputEl = $state<HTMLInputElement | null>(null);

  const currentDisplay = $derived(formatWorkspacePath(workspaceStore.currentPath));
  const currentFull = $derived(workspaceStore.currentPath ?? '');

  const menuItemIds = $derived(() =>
    workspaceStore.recentPaths.map((path: string, index: number) => `workspace-option-${index}-${path.replace(/\//g, '-')}`)
  );

  function openMenu(): void {
    open = true;
    addMode = false;
    newPath = '';
    activeDescendant = menuItemIds()[0] ?? null;
  }

  function closeMenu(): void {
    open = false;
    addMode = false;
    newPath = '';
    activeDescendant = null;
    triggerEl?.focus();
  }

  function toggleMenu(): void {
    if (open) closeMenu();
    else openMenu();
  }

  function switchTo(path: string): void {
    workspaceStore.setWorkspace(path);
    closeMenu();
  }

  function startAdd(): void {
    addMode = true;
    queueMicrotask(() => addInputEl?.focus());
  }

  function confirmAdd(): void {
    const trimmed = newPath.trim();
    if (!trimmed) {
      addMode = false;
      return;
    }
    workspaceStore.addRecent(trimmed);
    workspaceStore.setWorkspace(trimmed);
    closeMenu();
  }

  function cancelAdd(): void {
    addMode = false;
    newPath = '';
    queueMicrotask(() => triggerEl?.focus());
  }

  function remove(path: string, event: Event): void {
    event.stopPropagation();
    workspaceStore.removeRecent(path);
    if (workspaceStore.recentPaths.length === 0 && !addMode) {
      closeMenu();
    }
  }

  function moveActive(direction: number): void {
    const ids = menuItemIds();
    if (ids.length === 0) return;
    const current = activeDescendant ? ids.indexOf(activeDescendant) : -1;
    const next = Math.max(0, Math.min(ids.length - 1, current + direction));
    activeDescendant = ids[next];
  }

  function activateCurrent(): void {
    if (!activeDescendant) return;
    const option = document.getElementById(activeDescendant);
    option?.click();
  }

  function handleTriggerKeydown(event: KeyboardEvent): void {
    if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (!open) openMenu();
    }
  }

  function handlePopoverKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      if (addMode) cancelAdd();
      else closeMenu();
      return;
    }

    if (addMode) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      moveActive(1);
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      moveActive(-1);
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      activateCurrent();
      return;
    }
    if (event.key === 'Tab') {
      const focusable = popoverEl?.querySelectorAll<HTMLElement>(
        'button, input, [tabindex]:not([tabindex="-1"])'
      );
      if (!focusable || focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }
  }

  function handleAddInputKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      confirmAdd();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      cancelAdd();
    }
  }

  function handleClickOutside(event: MouseEvent): void {
    const target = event.target as Node | null;
    if (!popoverEl || !triggerEl || !target) return;
    if (!popoverEl.contains(target) && !triggerEl.contains(target)) {
      closeMenu();
    }
  }

  $effect(() => {
    if (!open) return;
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  });
</script>

<div class="workspace-switcher">
  <button
    bind:this={triggerEl}
    type="button"
    class="trigger"
    aria-haspopup="menu"
    aria-expanded={open}
    aria-controls={open ? 'workspace-menu' : undefined}
    title={currentFull || 'Select a workspace'}
    onclick={toggleMenu}
    onkeydown={handleTriggerKeydown}
  >
    <span class="trigger-icon" aria-hidden="true">
      <HugeiconsIcon icon={workspaceStore.currentPath ? Folder01Icon : FolderLibraryIcon} size={16} strokeWidth={1.5} color="currentColor" />
    </span>
    <span class="trigger-label">{currentDisplay}</span>
    <span class="trigger-chevron" class:open aria-hidden="true">
      <HugeiconsIcon icon={ArrowDown01Icon} size={14} strokeWidth={1.5} color="currentColor" />
    </span>
  </button>

  {#if open}
    <div
      class="popover"
      id="workspace-menu"
      role="menu"
      tabindex={-1}
      aria-label="Workspaces"
      aria-activedescendant={activeDescendant ?? undefined}
      bind:this={popoverEl}
      onkeydown={handlePopoverKeydown}
    >
      <GlassSurface variant="floating" class="popover-surface">
        {#if addMode}
          <div class="add-row" role="group" aria-label="Add workspace">
            <input
              bind:this={addInputEl}
              type="text"
              class="add-input"
              placeholder="/path/to/workspace"
              aria-label="Workspace path"
              autocomplete="off"
              autocapitalize="off"
              spellcheck="false"
              bind:value={newPath}
              onkeydown={handleAddInputKeydown}
            />
            <button type="button" class="add-confirm" onclick={confirmAdd} aria-label="Add workspace">
              <HugeiconsIcon icon={Add01Icon} size={14} strokeWidth={1.5} color="currentColor" />
            </button>
            <button type="button" class="add-cancel" onclick={cancelAdd} aria-label="Cancel">
              <span aria-hidden="true">×</span>
            </button>
          </div>
        {:else}
          <button type="button" class="add-workspace" role="menuitem" onclick={startAdd}>
            <span class="option-icon" aria-hidden="true">
              <HugeiconsIcon icon={Add01Icon} size={14} strokeWidth={1.5} color="currentColor" />
            </span>
            <span class="option-name">Add workspace…</span>
          </button>

          {#if workspaceStore.recentPaths.length > 0}
            <ul class="recent-list" role="none">
              {#each workspaceStore.recentPaths as path, index (path)}
                {@const optionId = `workspace-option-${index}-${path.replace(/\//g, '-')}`}
                {@const isSelected = workspaceStore.currentPath === path}
                <li role="none" class="workspace-row" class:selected={isSelected}>
                  <button
                    id={optionId}
                    type="button"
                    class="workspace-option"
                    class:selected={isSelected}
                    class:active={activeDescendant === optionId}
                    role="menuitem"
                    aria-current={isSelected ? 'true' : undefined}
                    onclick={() => switchTo(path)}
                    onmouseenter={() => (activeDescendant = optionId)}
                  >
                    <span class="option-icon" aria-hidden="true">
                      <HugeiconsIcon icon={Folder01Icon} size={14} strokeWidth={1.5} color="currentColor" />
                    </span>
                    <span class="option-name" title={path}>
                      {formatWorkspacePath(path)}
                    </span>
                    {#if isSelected}
                      <span class="option-check" aria-hidden="true">
                        <HugeiconsIcon icon={Tick02Icon} size={14} strokeWidth={2} color="currentColor" />
                      </span>
                    {/if}
                  </button>
                  <button
                    type="button"
                    class="remove-btn"
                    aria-label={`Remove ${path} from recent workspaces`}
                    onclick={(event) => remove(path, event)}
                  >
                    <HugeiconsIcon icon={Delete02Icon} size={13} strokeWidth={1.5} color="currentColor" />
                  </button>
                </li>
              {/each}
            </ul>
          {:else}
            <div class="empty-state" role="status">No recent workspaces.</div>
          {/if}
        {/if}
      </GlassSurface>
    </div>
  {/if}
</div>

<style>
  .workspace-switcher {
    position: relative;
    display: inline-flex;
  }

  .trigger {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    max-width: 16rem;
    padding: 0.375rem 0.625rem 0.375rem 0.5rem;
    font: inherit;
    font-size: 0.8125rem;
    font-weight: 500;
    color: var(--text-secondary);
    background-color: transparent;
    border: 1px solid var(--border);
    border-radius: var(--radius-full);
    cursor: pointer;
    transition:
      border-color var(--transition-fast),
      background-color var(--transition-fast),
      color var(--transition-fast);
  }

  .trigger:hover {
    color: var(--text-primary);
    background-color: var(--bg-surface);
    border-color: var(--border-strong);
  }

  .trigger:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .trigger-icon {
    display: inline-flex;
    color: var(--accent);
  }

  .trigger-label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .trigger-chevron {
    display: inline-flex;
    color: var(--text-muted);
    transition: transform var(--transition-fast);
  }

  .trigger-chevron.open {
    transform: rotate(180deg);
  }

  .popover {
    position: absolute;
    top: calc(100% + 0.375rem);
    left: 0;
    z-index: 40;
    width: 18rem;
    max-height: min(24rem, 60vh);
    border-radius: var(--radius-lg);
  }

  :global(.popover-surface) {
    display: flex;
    flex-direction: column;
    max-height: inherit;
    padding: 0.5rem;
  }

  .add-workspace,
  .workspace-option,
  .add-confirm,
  .add-cancel {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font: inherit;
    color: var(--text-secondary);
    background: transparent;
    border: none;
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition:
      background-color var(--transition-fast),
      color var(--transition-fast);
  }

  .add-workspace {
    width: 100%;
    padding: 0.5rem 0.625rem;
    font-size: 0.8125rem;
    text-align: left;
  }

  .add-workspace:hover,
  .add-workspace:focus-visible {
    background-color: var(--bg-surface);
    color: var(--text-primary);
  }

  .recent-list {
    list-style: none;
    margin: 0.25rem 0 0;
    padding: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
  }

  .workspace-row {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0;
    border-radius: var(--radius-sm);
  }

  .workspace-row:hover,
  .workspace-row.selected {
    background-color: var(--bg-surface);
  }

  .workspace-option {
    position: relative;
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.625rem;
    font: inherit;
    font-size: 0.8125rem;
    font-weight: 400;
    text-align: left;
    color: var(--text-secondary);
    background: transparent;
    border: none;
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition:
      background-color var(--transition-fast),
      color var(--transition-fast);
  }

  .workspace-option:hover,
  .workspace-option.active,
  .workspace-option:focus-visible {
    color: var(--text-primary);
  }

  .workspace-option.selected {
    color: var(--accent);
  }

  .option-icon {
    display: inline-flex;
    flex: 0 0 auto;
    color: var(--text-muted);
  }

  .workspace-option.selected .option-icon {
    color: var(--accent);
  }

  .option-name {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .option-check {
    display: inline-flex;
    flex: 0 0 auto;
    color: var(--accent);
  }

  .remove-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    width: 1.75rem;
    height: 1.75rem;
    margin-inline-end: 0.25rem;
    padding: 0;
    color: var(--text-muted);
    background: transparent;
    border: none;
    border-radius: var(--radius-sm);
    cursor: pointer;
    opacity: 0;
    transition:
      opacity var(--transition-fast),
      background-color var(--transition-fast),
      color var(--transition-fast);
  }

  .workspace-row:hover .remove-btn,
  .workspace-row:has(.workspace-option:focus-visible) .remove-btn,
  .remove-btn:focus-visible {
    opacity: 1;
  }

  .remove-btn:hover,
  .remove-btn:focus-visible {
    background-color: var(--bg-elevated);
    color: #ef4444;
  }

  .empty-state {
    padding: 1rem;
    font-size: 0.8125rem;
    text-align: center;
    color: var(--text-muted);
  }

  .add-row {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.375rem;
  }

  .add-input {
    flex: 1 1 auto;
    min-width: 0;
    padding: 0.5rem 0.625rem;
    font: inherit;
    font-size: 0.8125rem;
    color: var(--text-primary);
    background-color: var(--bg-base);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    outline: none;
  }

  .add-input:focus-visible {
    border-color: var(--accent);
  }

  .add-confirm,
  .add-cancel {
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    width: 2rem;
    height: 2rem;
    padding: 0;
    color: var(--text-secondary);
    background-color: var(--bg-base);
    border: 1px solid var(--border);
  }

  .add-confirm:hover,
  .add-confirm:focus-visible,
  .add-cancel:hover,
  .add-cancel:focus-visible {
    background-color: var(--bg-surface);
    color: var(--text-primary);
    border-color: var(--border-strong);
  }

  .add-cancel {
    font-size: 1rem;
    line-height: 1;
  }

  @media (prefers-reduced-motion: reduce) {
    .trigger,
    .trigger-chevron,
    .add-workspace,
    .workspace-option,
    .remove-btn,
    .add-confirm,
    .add-cancel {
      transition: none;
    }
  }
</style>
