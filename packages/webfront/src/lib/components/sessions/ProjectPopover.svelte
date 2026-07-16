<script lang="ts" module>
  import { createClient } from '$lib/api/client.js';
  import type { Session } from '$lib/api/types.js';
  import { ProjectSessionCache } from './project-popover.js';

  /**
   * Shared cache so hovering the same project repeatedly (or remounting the
   * popover) fetches its recent sessions at most once per worktree.
   */
  const sharedCache = new ProjectSessionCache((worktree) =>
    createClient().listSessions(worktree)
  );

  function defaultLoadSessions(worktree: string): Promise<Session[]> {
    return sharedCache.get(worktree);
  }
</script>

<script lang="ts">
  import { onMount } from 'svelte';
  import { HugeiconsIcon } from '@hugeicons/svelte';
  import { Settings01Icon, Add01Icon } from '@hugeicons/core-free-icons';
  import GlassSurface from '../GlassSurface.svelte';
  import type { Project } from '$lib/api/types.js';
  import { relativeTime, sessionTitle } from './session-card.js';
  import { popoverProjectName, isActiveSession, sessionHint } from './project-popover.js';
  import { activeSession } from '$lib/stores/active-session.svelte.js';

  interface ProjectPopoverProps {
    /** The project whose name + recent sessions the popover describes. */
    project: Project;
    /** Fetch recent sessions for a worktree (cached by default). */
    loadSessions?: (worktree: string) => Promise<Session[]>;
    /** Navigate to a session within this project. */
    onselectsession?: (sessionId: string) => void;
    /** Open the project's settings page. */
    onopensettings?: () => void;
    /** Start a new session in this project. */
    onnewsession?: () => void;
    /** Close/remove this project from the rail. */
    oncloseproject?: () => void;
    /** Dismiss the popover (Escape / pointer leave). */
    onclose?: () => void;
    /**
     * Id of the session currently open. Defaults to the shared active-session
     * store; exposed as a prop so tests can force a value without the store.
     */
    activeSessionId?: string | null;
    orientation?: 'vertical' | 'horizontal';
  }

  let {
    project,
    loadSessions = defaultLoadSessions,
    onselectsession,
    onopensettings,
    onnewsession,
    oncloseproject,
    onclose,
    activeSessionId,
    orientation = 'vertical',
  }: ProjectPopoverProps = $props();

  let sessions = $state<Session[]>([]);
  let loading = $state(true);
  let failed = $state(false);

  const name = $derived(popoverProjectName(project.worktree));
  const path = $derived(project.worktree || '/');
  const showEmpty = $derived(!loading && !failed && sessions.length === 0);
  const activeId = $derived(activeSessionId ?? activeSession.activeId);

  onMount(() => {
    let cancelled = false;
    loadSessions(project.worktree)
      .then((result) => {
        if (cancelled) return;
        sessions = result;
        loading = false;
      })
      .catch(() => {
        if (cancelled) return;
        failed = true;
        loading = false;
      });
    return () => {
      cancelled = true;
    };
  });

  function onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      onclose?.();
    }
  }
</script>

<div
  class="popover"
  class:popover--horizontal={orientation === 'horizontal'}
  role="dialog"
  tabindex="-1"
  aria-label={`Project ${name}`}
  onkeydown={onKeydown}
  onmouseleave={() => onclose?.()}
>
  <GlassSurface variant="floating" class="popover-surface">
    <header class="pop-head">
      <div class="pop-head-text">
        <h3 class="pop-name">{name}</h3>
        <p class="pop-path" title={path}>{path}</p>
      </div>
      <button
        type="button"
        class="pop-settings"
        aria-label={`Settings for ${name}`}
        title="Project settings"
        onclick={() => {
          onopensettings?.();
          onclose?.();
        }}
      >
        <HugeiconsIcon icon={Settings01Icon} size={15} strokeWidth={1.5} color="currentColor" />
      </button>
    </header>

    <section class="pop-sessions" aria-label="Recent sessions">
      <p class="pop-section-label">Recent sessions</p>
      {#if loading}
        <p class="pop-state" aria-busy="true">Loading…</p>
      {:else if failed}
        <p class="pop-state">Couldn't load sessions</p>
      {:else if showEmpty}
        <p class="pop-state">No sessions yet</p>
      {:else}
        <ul class="pop-list" role="list">
          {#each sessions as session (session.id)}
            {@const active = isActiveSession(session, activeId)}
            {@const hint = sessionHint(session)}
            <li>
              <button
                type="button"
                class="pop-session"
                class:pop-session--active={active}
                aria-current={active ? 'true' : undefined}
                onclick={() => onselectsession?.(session.id)}
              >
                <span class="pop-session-main">
                  <span class="pop-session-row">
                    {#if active}
                      <span class="pop-active-dot" aria-hidden="true"></span>
                    {/if}
                    <span class="pop-session-title">{sessionTitle(session)}</span>
                    <span class="pop-session-time">{relativeTime(session.updatedAt)}</span>
                  </span>
                  {#if active || hint}
                    <span class="pop-session-hint">
                      {#if active}<span class="pop-active-label">Active</span>{/if}
                      {#if active && hint}<span aria-hidden="true">·</span>{/if}
                      {#if hint}{hint}{/if}
                    </span>
                  {/if}
                </span>
              </button>
            </li>
          {/each}
        </ul>
      {/if}

      <button type="button" class="pop-new-session" onclick={() => onnewsession?.()}>
        <HugeiconsIcon icon={Add01Icon} size={14} strokeWidth={1.75} color="currentColor" />
        New session
      </button>
    </section>

    <footer class="pop-foot">
      <button type="button" class="pop-close-project" onclick={() => oncloseproject?.()}>
        Close project
      </button>
    </footer>
  </GlassSurface>
</div>

<style>
  .popover {
    position: absolute;
    top: 0;
    left: calc(100% + 0.5rem);
    z-index: 60;
    width: 16.5rem;
    max-width: min(16.5rem, calc(100vw - 4rem));
    animation: pop-in var(--transition-base);
  }

  .popover--horizontal {
    top: calc(100% + 0.5rem);
    left: 0;
  }

  :global(.popover-surface) {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 0.625rem;
    border-radius: var(--radius);
    border: 1px solid var(--border);
    box-shadow: 0 0.75rem 2rem rgba(0, 0, 0, 0.3);
  }

  .pop-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.5rem;
  }

  .pop-head-text {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
    min-width: 0;
  }

  .pop-settings {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    width: 1.625rem;
    height: 1.625rem;
    padding: 0;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background-color: var(--bg-elevated);
    color: var(--text-secondary);
    cursor: pointer;
    transition:
      color var(--transition-fast),
      border-color var(--transition-fast),
      background-color var(--transition-fast);
  }

  .pop-settings:hover {
    color: var(--accent-text);
    border-color: var(--border-strong);
    background-color: var(--bg-surface);
  }

  .pop-settings:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: 2px;
  }

  .pop-name {
    margin: 0;
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--text-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .pop-path {
    margin: 0;
    font-size: 0.6875rem;
    color: var(--text-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .pop-section-label {
    margin: 0 0 0.25rem;
    font-size: 0.625rem;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--text-muted);
  }

  .pop-state {
    margin: 0;
    font-size: 0.75rem;
    color: var(--text-muted);
    padding: 0.25rem 0;
  }

  .pop-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
    max-height: 12rem;
    overflow-y: auto;
    overscroll-behavior: contain;
  }

  .pop-session {
    display: flex;
    align-items: center;
    width: 100%;
    padding: 0.3125rem 0.5rem;
    text-align: left;
    background: transparent;
    border: none;
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: background-color var(--transition-fast);
  }

  .pop-session:hover {
    background-color: var(--bg-surface);
  }

  .pop-session:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: -2px;
  }

  .pop-session--active {
    background-color: var(--bg-surface);
  }

  .pop-session-main {
    display: flex;
    flex-direction: column;
    gap: 0.0625rem;
    width: 100%;
    min-width: 0;
  }

  .pop-session-row {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    min-width: 0;
  }

  .pop-active-dot {
    flex: 0 0 auto;
    width: 0.375rem;
    height: 0.375rem;
    border-radius: var(--radius-full);
    background-color: var(--accent, var(--success, #22c55e));
    box-shadow: 0 0 0 0 var(--accent, #22c55e);
    animation: pop-pulse 2s ease-out infinite;
  }

  .pop-session-title {
    flex: 1 1 auto;
    min-width: 0;
    font-size: 0.8125rem;
    color: var(--text-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .pop-session-time {
    flex: 0 0 auto;
    font-size: 0.6875rem;
    color: var(--text-muted);
    font-variant-numeric: tabular-nums;
  }

  .pop-session-hint {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    font-size: 0.625rem;
    color: var(--text-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .pop-active-label {
    color: var(--accent-text, var(--text-secondary));
    font-weight: 600;
  }

  .pop-new-session {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    width: 100%;
    margin-top: 0.25rem;
    padding: 0.3125rem 0.5rem;
    font-size: 0.75rem;
    color: var(--text-secondary);
    background: transparent;
    border: none;
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition:
      color var(--transition-fast),
      background-color var(--transition-fast);
  }

  .pop-new-session:hover {
    color: var(--accent-text);
    background-color: var(--bg-surface);
  }

  .pop-new-session:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: -2px;
  }

  @keyframes pop-pulse {
    0% {
      box-shadow: 0 0 0 0 color-mix(in srgb, var(--accent, #22c55e) 55%, transparent);
    }
    70% {
      box-shadow: 0 0 0 0.3rem color-mix(in srgb, var(--accent, #22c55e) 0%, transparent);
    }
    100% {
      box-shadow: 0 0 0 0 color-mix(in srgb, var(--accent, #22c55e) 0%, transparent);
    }
  }

  .pop-foot {
    display: flex;
    justify-content: flex-end;
    border-top: 1px solid var(--border);
    padding-top: 0.375rem;
  }

  .pop-close-project {
    font-size: 0.75rem;
    color: var(--danger-text, var(--text-secondary));
    background: transparent;
    border: none;
    padding: 0.25rem 0.375rem;
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: background-color var(--transition-fast);
  }

  .pop-close-project:hover {
    background-color: var(--bg-surface);
  }

  .pop-close-project:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: 2px;
  }

  @keyframes pop-in {
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
    .popover {
      animation: none;
    }
    .pop-session,
    .pop-close-project,
    .pop-settings,
    .pop-new-session {
      transition: none;
    }
    .pop-active-dot {
      animation: none;
    }
  }
</style>
