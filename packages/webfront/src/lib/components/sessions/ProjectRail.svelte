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
  import ProjectPopover from './ProjectPopover.svelte';
  import { ui } from '$lib/stores/ui.svelte.js';

  interface ProjectRailProps {
    /** Opened projects to render, one avatar per entry. */
    projects: Project[];
    /** Id of the currently-active project, if any. */
    activeId?: string | null;
    /** Called when a project avatar is activated. */
    onSelect?: (project: Project) => void;
    /** Projects available to open but not yet in the rail (add-picker source). */
    available?: Project[];
    /** Open/add a project (by picked entry or manual path). */
    onOpen?: (project: Project) => void;
    /** Close/remove a project from the rail. */
    onClose?: (projectId: string) => void;
    /** Resolve the stable palette index for a project's avatar color. */
    colorIndexFor?: (id: string) => number;
    /** Navigate to a specific session within a project (from the hover popover). */
    onSelectSession?: (project: Project, sessionId: string) => void;
    /** Open a project's settings page (from the hover popover). */
    onOpenSettings?: (project: Project) => void;
    /** Start a new session in a project (from the hover popover). */
    onNewSession?: (project: Project) => void;
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
    onClose,
    colorIndexFor,
    onSelectSession,
    onOpenSettings,
    onNewSession,
    orientation = 'vertical',
  }: ProjectRailProps = $props();

  const isEmpty = $derived(projects.length === 0);

  let hoveredId = $state<string | null>(null);
  let hoverTimer: ReturnType<typeof setTimeout> | undefined;

  const HOVER_DELAY = 180;

  function color(project: Project): string {
    return projectColor(project.id, colorIndexFor?.(project.id));
  }

  function handleSelect(project: Project): void {
    onSelect?.(project);
  }

  function scheduleHover(id: string): void {
    clearTimeout(hoverTimer);
    hoverTimer = setTimeout(() => {
      hoveredId = id;
    }, HOVER_DELAY);
  }

  function showNow(id: string): void {
    clearTimeout(hoverTimer);
    hoveredId = id;
  }

  function clearHover(): void {
    clearTimeout(hoverTimer);
    hoveredId = null;
  }

  function openProjectPicker(): void {
    ui.addProjectOpen = true;
  }
</script>

<nav
  class="project-rail"
  class:project-rail--horizontal={orientation === 'horizontal'}
  aria-label="Projects"
>
  {#if isEmpty}
    <span class="rail-avatar rail-avatar--placeholder" aria-hidden="true" title="No projects opened">
      <HugeiconsIcon icon={Add01Icon} size={16} strokeWidth={1.5} color="currentColor" />
    </span>
  {:else}
    <ul class="rail-list" role="list">
      {#each projects as project (project.id)}
        {@const active = isActiveProject(project, activeId)}
        {@const label = projectLabel(project)}
        <li
          class="rail-item"
          onmouseenter={() => scheduleHover(project.id)}
          onmouseleave={clearHover}
        >
          <button
            type="button"
            class={avatarClass(active)}
            style:--avatar-color={color(project)}
            aria-current={avatarAriaCurrent(active)}
            aria-label={label}
            title={label}
            onclick={() => handleSelect(project)}
            onfocus={() => showNow(project.id)}
            onblur={clearHover}
          >
            <span class="rail-initial" aria-hidden="true">{projectInitial(project.worktree)}</span>
          </button>
          {#if hoveredId === project.id}
            <ProjectPopover
              {project}
              {orientation}
              onclose={clearHover}
              oncloseproject={() => {
                clearHover();
                onClose?.(project.id);
              }}
              onselectsession={(sessionId) => {
                clearHover();
                onSelectSession?.(project, sessionId);
              }}
              onopensettings={() => {
                clearHover();
                onOpenSettings?.(project);
              }}
              onnewsession={() => {
                clearHover();
                onNewSession?.(project);
              }}
            />
          {/if}
        </li>
      {/each}
    </ul>
  {/if}

  <div class="rail-add">
    <button
      type="button"
      class="rail-avatar rail-avatar--add"
      aria-label="Add project"
      aria-haspopup="dialog"
      aria-expanded={ui.addProjectOpen}
      title="Add project"
      onclick={openProjectPicker}
    >
      <HugeiconsIcon icon={Add01Icon} size={16} strokeWidth={1.75} color="currentColor" />
    </button>
  </div>
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
    position: relative;
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

  /* ---- Add-project affordance ---- */
  .rail-add {
    position: relative;
    margin-top: 0.5rem;
    padding-top: 0.5rem;
    border-top: 1px solid var(--border);
    display: flex;
    justify-content: center;
    width: 100%;
  }

  .rail-avatar--add {
    background-color: var(--bg-elevated);
    color: var(--text-secondary);
    border: 1px dashed var(--border-strong);
  }

  .rail-avatar--add:hover {
    color: var(--accent-text);
    border-color: var(--accent);
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

  .project-rail--horizontal .rail-add {
    margin-top: 0;
    margin-left: 0.5rem;
    padding-top: 0;
    padding-left: 0.5rem;
    border-top: none;
    border-left: 1px solid var(--border);
    width: auto;
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
