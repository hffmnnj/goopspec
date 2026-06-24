<script lang="ts">
  import { HugeiconsIcon } from '@hugeicons/svelte';
  import { Add01Icon } from '@hugeicons/core-free-icons';
  import type { Project } from '$lib/api/types.js';
  import {
    projectColor,
    projectInitial,
    projectLabel,
    isActiveProject,
    avatarClass,
    avatarAriaCurrent,
  } from './project-rail.js';

  interface ProjectRailProps {
    /** Projects to render, one avatar per entry. */
    projects: Project[];
    /** Id of the currently-active project, if any. */
    activeId?: string | null;
    /** Called when a project avatar is activated. */
    onSelect?: (project: Project) => void;
    /**
     * Orientation. `vertical` (default) for the desktop sidebar rail;
     * `horizontal` for the phone chip row above the session list.
     */
    orientation?: 'vertical' | 'horizontal';
  }

  let {
    projects,
    activeId = null,
    onSelect,
    orientation = 'vertical',
  }: ProjectRailProps = $props();

  const isEmpty = $derived(projects.length === 0);

  function handleSelect(project: Project): void {
    onSelect?.(project);
  }
</script>

<nav
  class="project-rail"
  class:project-rail--horizontal={orientation === 'horizontal'}
  aria-label="Projects"
>
  {#if isEmpty}
    <span class="rail-avatar rail-avatar--placeholder" aria-hidden="true" title="No projects yet">
      <HugeiconsIcon icon={Add01Icon} size={16} strokeWidth={1.5} color="currentColor" />
    </span>
  {:else}
    <ul class="rail-list" role="list">
      {#each projects as project (project.id)}
        {@const active = isActiveProject(project, activeId)}
        {@const label = projectLabel(project)}
        <li class="rail-item">
          <button
            type="button"
            class={avatarClass(active)}
            style:--avatar-color={projectColor(project.id)}
            aria-current={avatarAriaCurrent(active)}
            aria-label={label}
            title={label}
            onclick={() => handleSelect(project)}
          >
            <span class="rail-initial" aria-hidden="true">{projectInitial(project.worktree)}</span>
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</nav>

<style>
  .project-rail {
    display: flex;
    flex-direction: column;
    flex: 0 0 auto;
    align-items: center;
    width: 3.25rem;
    height: 100%;
    min-height: 0;
    padding: 0.5rem 0.5rem;
    border-right: 1px solid var(--border);
    overflow-y: auto;
    overscroll-behavior: contain;
  }

  .rail-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
  }

  .rail-item {
    margin: 0;
  }

  .rail-avatar {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 2rem;
    height: 2rem;
    padding: 0;
    border: none;
    border-radius: var(--radius-full);
    background-color: var(--avatar-color, var(--bg-elevated));
    color: #fff;
    cursor: pointer;
    box-shadow: 0 0 0 0 transparent;
    transition:
      box-shadow var(--transition-fast),
      transform var(--transition-fast),
      opacity var(--transition-fast);
  }

  .rail-avatar:hover {
    transform: scale(1.06);
  }

  .rail-avatar:active {
    transform: scale(0.94);
  }

  .rail-avatar:focus-visible {
    outline: none;
    box-shadow:
      0 0 0 2px var(--bg-base),
      0 0 0 4px var(--focus-ring);
  }

  .rail-avatar--active {
    box-shadow:
      0 0 0 2px var(--bg-base),
      0 0 0 4px var(--accent);
  }

  .rail-avatar--placeholder {
    background-color: var(--bg-elevated);
    color: var(--text-muted);
    opacity: 0.6;
    cursor: default;
  }

  .rail-initial {
    font-size: 0.8125rem;
    font-weight: 600;
    line-height: 1;
    text-transform: uppercase;
  }

  /* ---- Horizontal (phone) chip row ---- */
  .project-rail--horizontal {
    flex-direction: row;
    width: 100%;
    height: auto;
    padding: 0.5rem;
    border-right: none;
    border-bottom: 1px solid var(--border);
    overflow-x: auto;
    overflow-y: hidden;
  }

  .project-rail--horizontal .rail-list {
    flex-direction: row;
    align-items: center;
    width: max-content;
  }

  @media (prefers-reduced-motion: reduce) {
    .rail-avatar {
      transition: box-shadow var(--transition-fast);
    }
    .rail-avatar:hover,
    .rail-avatar:active {
      transform: none;
    }
  }
</style>
