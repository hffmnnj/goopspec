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
  let previouslyFocused: HTMLElement | null = null;

  const trimmedPath = $derived(pathInput.trim());
  const canSubmitPath = $derived(trimmedPath.length > 0);

  onMount(() => {
    previouslyFocused = document.activeElement as HTMLElement | null;
    void tick().then(() => firstField?.focus());
    return () => previouslyFocused?.focus?.();
  });

  function focusables(): HTMLElement[] {
    if (!container) return [];
    const selector =
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    return Array.from(container.querySelectorAll<HTMLElement>(selector));
  }

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
      return;
    }
    if (event.key !== 'Tab') return;

    const elements = focusables();
    if (elements.length === 0) return;
    const first = elements[0];
    const last = elements[elements.length - 1];
    const active = document.activeElement as HTMLElement | null;
    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

</script>

<button
  type="button"
  class="picker-backdrop"
  aria-label="Close add project"
  data-orientation={orientation}
  onclick={onclose}
></button>
  <div
    class="picker-panel"
    bind:this={container}
    role="dialog"
    tabindex="-1"
    aria-modal="true"
    aria-labelledby="add-project-title"
    onkeydown={onKeydown}
  >
  <GlassSurface variant="floating" class="picker-surface">
    <header class="picker-header">
      <div>
        <h2 id="add-project-title" class="picker-title">Add project</h2>
        <p class="picker-subtitle">Open a worktree or choose one from the server.</p>
      </div>
      <button type="button" class="close-button" aria-label="Close add project" onclick={onclose}>
        ×
      </button>
    </header>

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
  .picker-backdrop {
    position: fixed;
    inset: 0;
    z-index: 1000;
    display: grid;
    place-items: center;
    padding: max(1rem, var(--safe-top)) max(1rem, var(--safe-right)) max(1rem, var(--safe-bottom)) max(1rem, var(--safe-left));
    background: rgba(4, 7, 12, 0.58);
    backdrop-filter: blur(10px);
    animation: backdrop-in var(--transition-base);
    border: 0;
  }

  .picker-panel {
    position: fixed;
    inset: 50% auto auto 50%;
    z-index: 1001;
    transform: translate(-50%, -50%);
    width: min(34rem, calc(100vw - 2rem));
    max-height: min(36rem, calc(100vh - 2rem));
    outline: none;
  }

  :global(.picker-surface) {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    width: 100%;
    max-height: inherit;
    padding: 1rem;
    border-radius: var(--radius-lg);
    border: 1px solid var(--border);
    box-shadow: 0 0.75rem 2rem rgba(0, 0, 0, 0.3);
    animation: picker-in var(--transition-base);
    overflow: hidden;
  }

  .picker-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
  }

  .picker-title {
    margin: 0;
    font-size: 1rem;
    font-weight: 650;
    color: var(--text-primary);
  }

  .picker-subtitle {
    margin: 0.25rem 0 0;
    font-size: 0.8125rem;
    color: var(--text-muted);
  }

  .close-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 2rem;
    height: 2rem;
    padding: 0;
    color: var(--text-secondary);
    background: transparent;
    border: 1px solid var(--border);
    border-radius: var(--radius-full);
    cursor: pointer;
    font-size: 1.25rem;
    line-height: 1;
  }

  .close-button:hover {
    color: var(--text-primary);
    border-color: var(--border-strong);
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
      transform: translateY(0.5rem) scale(0.98);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  @keyframes backdrop-in {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .picker-backdrop,
    :global(.picker-surface) {
      animation: none;
    }
    .path-submit,
    .server-item {
      transition: none;
    }
  }
</style>
