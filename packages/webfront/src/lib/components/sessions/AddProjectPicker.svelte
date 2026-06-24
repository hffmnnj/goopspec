<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { HugeiconsIcon } from '@hugeicons/svelte';
  import { FolderAddIcon } from '@hugeicons/core-free-icons';
  import GlassSurface from '../GlassSurface.svelte';
  import type { Project } from '$lib/api/types.js';
  import { projectName } from './project-rail.js';

  interface AddProjectPickerProps {
    /** Server projects available to open but not yet in the rail. */
    available?: Project[];
    /** Open the chosen (or manually-entered) project. */
    onpick?: (project: Project) => void;
    /** Dismiss the picker without opening anything. */
    onclose?: () => void;
    orientation?: 'vertical' | 'horizontal';
  }

  let {
    available = [],
    onpick,
    onclose,
    orientation = 'vertical',
  }: AddProjectPickerProps = $props();

  let pathInput = $state('');
  let container = $state<HTMLDivElement | null>(null);
  let firstField = $state<HTMLInputElement | null>(null);

  const trimmedPath = $derived(pathInput.trim());
  const canSubmitPath = $derived(trimmedPath.length > 0);

  onMount(async () => {
    await tick();
    firstField?.focus();
  });

  function projectFromPath(path: string): Project {
    return { id: path, worktree: path, time: { created: Date.now() } };
  }

  function pickServer(project: Project): void {
    onpick?.(project);
  }

  function submitPath(event: SubmitEvent): void {
    event.preventDefault();
    if (!canSubmitPath) return;
    onpick?.(projectFromPath(trimmedPath));
    pathInput = '';
  }

  function onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      onclose?.();
    }
  }

  function onFocusOut(event: FocusEvent): void {
    const next = event.relatedTarget as Node | null;
    if (next && container?.contains(next)) return;
    onclose?.();
  }
</script>

<div
  class="picker"
  class:picker--horizontal={orientation === 'horizontal'}
  bind:this={container}
  role="dialog"
  tabindex="-1"
  aria-label="Add a project"
  onkeydown={onKeydown}
  onfocusout={onFocusOut}
>
  <GlassSurface variant="floating" class="picker-surface">
    <form class="path-form" onsubmit={submitPath}>
      <label class="path-label" for="add-project-path">Open a path</label>
      <div class="path-row">
        <input
          id="add-project-path"
          class="path-input"
          type="text"
          placeholder="/path/to/project"
          autocomplete="off"
          spellcheck="false"
          bind:value={pathInput}
          bind:this={firstField}
        />
        <button type="submit" class="path-submit" disabled={!canSubmitPath} aria-label="Open path">
          <HugeiconsIcon icon={FolderAddIcon} size={16} strokeWidth={1.5} color="currentColor" />
        </button>
      </div>
    </form>

    {#if available.length > 0}
      <div class="divider" role="separator"></div>
      <p class="list-label" id="add-project-available">Available projects</p>
      <ul class="server-list" role="list" aria-labelledby="add-project-available">
        {#each available as project (project.id)}
          <li>
            <button type="button" class="server-item" onclick={() => pickServer(project)}>
              <span class="server-name">{projectName(project.worktree) || 'Untitled'}</span>
              <span class="server-path" title={project.worktree}>{project.worktree}</span>
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  </GlassSurface>
</div>

<style>
  .picker {
    position: absolute;
    top: 0;
    left: calc(100% + 0.5rem);
    z-index: 60;
    width: 16rem;
    max-width: min(16rem, calc(100vw - 4rem));
    animation: picker-in var(--transition-base);
  }

  .picker--horizontal {
    top: calc(100% + 0.5rem);
    left: auto;
    right: 0;
  }

  :global(.picker-surface) {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 0.625rem;
    border-radius: var(--radius);
    border: 1px solid var(--border);
    box-shadow: 0 0.75rem 2rem rgba(0, 0, 0, 0.3);
  }

  .path-form {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
  }

  .path-label,
  .list-label {
    margin: 0;
    font-size: 0.6875rem;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--text-muted);
  }

  .path-row {
    display: flex;
    gap: 0.375rem;
  }

  .path-input {
    flex: 1 1 auto;
    min-width: 0;
    padding: 0.4rem 0.5rem;
    font-size: 0.8125rem;
    color: var(--text-primary);
    background-color: var(--bg-base);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
  }

  .path-input:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: 1px;
  }

  .path-submit {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    width: 2rem;
    height: 2rem;
    padding: 0;
    color: var(--accent-foreground);
    background-color: var(--accent);
    border: 1px solid var(--focus-ring);
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: background-color var(--transition-fast);
  }

  .path-submit:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .path-submit:not(:disabled):hover {
    background-color: var(--accent-hover);
  }

  .path-submit:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: 2px;
  }

  .divider {
    height: 1px;
    background-color: var(--border);
  }

  .server-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
    max-height: 14rem;
    overflow-y: auto;
    overscroll-behavior: contain;
  }

  .server-item {
    display: flex;
    flex-direction: column;
    gap: 0.0625rem;
    width: 100%;
    padding: 0.375rem 0.5rem;
    text-align: left;
    background: transparent;
    border: none;
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: background-color var(--transition-fast);
  }

  .server-item:hover {
    background-color: var(--bg-surface);
  }

  .server-item:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: -2px;
  }

  .server-name {
    font-size: 0.8125rem;
    font-weight: 500;
    color: var(--text-primary);
  }

  .server-path {
    font-size: 0.6875rem;
    color: var(--text-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  @keyframes picker-in {
    from {
      opacity: 0;
      transform: translateX(-0.25rem);
    }
    to {
      opacity: 1;
      transform: translateX(0);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .picker {
      animation: none;
    }
    .path-submit,
    .server-item {
      transition: none;
    }
  }
</style>
