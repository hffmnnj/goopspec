<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { onMount } from 'svelte';
  import { HugeiconsIcon } from '@hugeicons/svelte';
  import { Add01Icon, InboxIcon, Alert02Icon, RefreshIcon } from '@hugeicons/core-free-icons';
  import GlassSurface from '../GlassSurface.svelte';
  import ThemeToggle from '../ThemeToggle.svelte';
  import ConnectionStatus from '../ConnectionStatus.svelte';
  import SessionCard from './SessionCard.svelte';
  import SessionSearch from './SessionSearch.svelte';
  import ProjectRail from './ProjectRail.svelte';
  import VcsBadge from './VcsBadge.svelte';
  import SessionDiffPanel from './SessionDiffPanel.svelte';
  import { Cancel01Icon } from '@hugeicons/core-free-icons';
  import { sessions as defaultStore } from '$lib/stores/sessions.svelte.js';
  import { projects as defaultProjects } from '$lib/stores/projects.svelte.js';
  import { activeSession } from '$lib/stores/active-session.svelte.js';
  import { chat } from '$lib/stores/chat.svelte.js';
  import { layout } from '$lib/stores/layout.svelte.js';
  import { filterSessions } from '$lib/sessions/search.js';
  import { buildSessionHierarchy, type SessionTreeNode } from '$lib/sessions/hierarchy.js';
  import {
    isNodeExpanded,
    toggleExpanded,
    expandActiveParent,
  } from '$lib/sessions/session-disclosure.js';
  import { needsNavigation, projectRoute, sessionRoute } from '$lib/routing/navigation.js';
  import type { Project } from '$lib/api/types.js';

  interface SessionsLike {
    sorted: import('$lib/api/types.js').Session[];
    loading: boolean;
    error: string | null;
    load(): Promise<void>;
    create(): Promise<unknown>;
    remove(id: string): Promise<unknown>;
    rename(id: string, title: string): Promise<unknown>;
  }

  interface ProjectsLike {
    projects: Project[];
    availableProjects: Project[];
    activeProject: Project | null;
    setActiveProject(project: Project): void;
    openProject(project: Project): void;
    closeProject(projectId: string): void;
    unopenedAvailable(): Project[];
    colorIndexFor(id: string): number;
  }

  interface SidebarProps {
    /** Override the session store (defaults to the shared reactive store). */
    store?: SessionsLike;
    /** Override the projects store (defaults to the shared reactive store). */
    projectsStore?: ProjectsLike;
  /**
   * Active session id override. The sidebar now prefers the shared
   * `activeSession` store; this prop lets tests / callers force a specific id.
   */
  activeSessionId?: string | null;
  /** Called when a session is selected (history load is handled internally). */
  onselect?: (id: string) => void;
  }

  let {
    store = defaultStore as unknown as SessionsLike,
    projectsStore = defaultProjects as unknown as ProjectsLike,
    activeSessionId,
    onselect,
  }: SidebarProps = $props();

  const SKELETON_COUNT = 5;

  let searchQuery = $state('');
  let diffSessionId = $state<string | null>(null);
  // Tracks *expanded* parents — empty means all children collapsed by default.
  let expandedSessionIds = $state(new Set<string>());
  const diffTitle = $derived(
    diffSessionId ? store.sorted.find((s) => s.id === diffSessionId)?.title ?? 'Session' : ''
  );

  // Active-session seam: prefer the T5.2 active-session store, then explicit prop, then chat store.
  const activeId = $derived(activeSession.activeId ?? activeSessionId ?? chat.activeSessionId);

  const items = $derived(filterSessions(store.sorted, searchQuery));
  const tree = $derived(buildSessionHierarchy(items));
  const isLoading = $derived(store.loading);
  const errorMsg = $derived(store.error);
  const isEmpty = $derived(!isLoading && !errorMsg && items.length === 0);

  const railOrientation = $derived<'vertical' | 'horizontal'>(
    layout.isPhone ? 'horizontal' : 'vertical'
  );

  onMount(() => {
    void store.load();
  });

  function handleProjectSelect(project: Project): void {
    navigate(projectRoute(project));
  }

  function handleProjectOpen(project: Project): void {
    navigate(projectRoute(project));
  }

  function handleProjectClose(projectId: string): void {
    projectsStore.closeProject(projectId);
  }

  function handleProjectColorIndex(id: string): number {
    return projectsStore.colorIndexFor(id);
  }

  function handlePopoverSession(project: Project, sessionId: string): void {
    navigate(sessionRoute(project, sessionId));
  }

  async function handleCreate(): Promise<void> {
    const created = await store.create();
    const id = (created as { id?: string } | undefined)?.id;
    const project = projectsStore.activeProject;
    if (id && project) navigate(sessionRoute(project, id));
    else if (id) onselect?.(id);
  }

  function handleSelect(id: string): void {
    const project = projectsStore.activeProject;
    if (project) navigate(sessionRoute(project, id));
    onselect?.(id);
  }

  function navigate(target: string): void {
    if (needsNavigation(page.url.pathname, target)) void goto(target);
  }

  function handleRename(id: string, title: string): void {
    void store.rename(id, title);
  }

  function handleDelete(id: string): void {
    void store.remove(id);
  }

  function handleViewDiff(id: string): void {
    diffSessionId = id;
  }

  function closeDiff(): void {
    diffSessionId = null;
  }

  function isExpanded(id: string): boolean {
    return isNodeExpanded(expandedSessionIds, id);
  }

  function toggleChildren(id: string): void {
    expandedSessionIds = toggleExpanded(expandedSessionIds, id);
  }

  // Nicety: if the active session is a child, reveal it by expanding its parent.
  $effect(() => {
    const next = expandActiveParent(expandedSessionIds, store.sorted, activeId);
    if (next !== expandedSessionIds) expandedSessionIds = next as Set<string>;
  });

  function onOverlayKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeDiff();
    }
  }
</script>

{#snippet renderSessionNode(node: SessionTreeNode, level: number)}
  <li class="list-item" class:list-item--child={level > 0} style={`--level: ${level}`}>
    <div class="session-row">
      {#if node.children.length > 0}
        <button
          type="button"
          class="children-toggle"
          aria-label={`${isExpanded(node.session.id) ? 'Collapse' : 'Expand'} child sessions for ${node.session.title}`}
          aria-expanded={isExpanded(node.session.id)}
          onclick={() => toggleChildren(node.session.id)}
        >
          {isExpanded(node.session.id) ? '▾' : '▸'}
        </button>
      {:else}
        <span class="children-spacer" aria-hidden="true"></span>
      {/if}
      <SessionCard
        session={node.session}
        active={node.session.id === activeId}
        childCount={node.children.length}
        onselect={handleSelect}
        onrename={handleRename}
        ondelete={handleDelete}
        onviewdiff={handleViewDiff}
      />
    </div>
    {#if node.children.length > 0 && isExpanded(node.session.id)}
      <ul class="child-list" role="group" aria-label={`Child sessions for ${node.session.title}`}>
        {#each node.children as child (child.session.id)}
          {@render renderSessionNode(child, level + 1)}
        {/each}
      </ul>
    {/if}
  </li>
{/snippet}

<GlassSurface variant="panel" element="aside" class="session-sidebar" aria-label="Sessions">
  <div class="sidebar-body" class:sidebar-body--phone={railOrientation === 'horizontal'}>
    <ProjectRail
      projects={projectsStore.projects}
      activeId={projectsStore.activeProject?.id ?? null}
      available={projectsStore.unopenedAvailable()}
      colorIndexFor={handleProjectColorIndex}
      orientation={railOrientation}
      onSelect={handleProjectSelect}
      onOpen={handleProjectOpen}
      onClose={handleProjectClose}
      onSelectSession={handlePopoverSession}
    />
    <div class="sidebar-main">
  <header class="header">
    <div class="header-title">
      <h2 class="heading">Sessions</h2>
      <VcsBadge />
    </div>
    <button
      type="button"
      class="new-btn"
      aria-label="New session"
      title="New session"
      onclick={handleCreate}
    >
      <HugeiconsIcon icon={Add01Icon} size={16} strokeWidth={1.5} color="currentColor" />
    </button>
  </header>

  <SessionSearch bind:value={searchQuery} />

  <div class="list-region" data-shortcut="session-list" tabindex="-1" aria-label="Session list region">
    {#if isLoading && items.length === 0}
      <div class="skeleton-list" aria-busy="true" aria-label="Loading sessions">
        {#each Array.from({ length: SKELETON_COUNT }) as _, i (i)}
          <div class="skeleton" aria-hidden="true">
            <div class="sk-line sk-title"></div>
            <div class="sk-line sk-meta"></div>
          </div>
        {/each}
      </div>
    {:else if errorMsg}
      <div class="state state--error" role="alert">
        <span class="state-icon" aria-hidden="true">
          <HugeiconsIcon icon={Alert02Icon} size={22} strokeWidth={1.5} color="currentColor" />
        </span>
        <p class="state-title">Couldn't load sessions</p>
        <p class="state-detail">{errorMsg}</p>
        <button type="button" class="retry-btn" onclick={() => store.load()}>
          <HugeiconsIcon icon={RefreshIcon} size={14} strokeWidth={1.5} color="currentColor" />
          Retry
        </button>
      </div>
    {:else if isEmpty}
      <div class="state state--empty">
        <span class="state-icon" aria-hidden="true">
          <HugeiconsIcon icon={InboxIcon} size={24} strokeWidth={1.5} color="currentColor" />
        </span>
        <p class="state-title">No sessions yet</p>
        <p class="state-detail">Start a conversation to create your first session.</p>
        <button type="button" class="cta-btn" onclick={handleCreate}>
          <HugeiconsIcon icon={Add01Icon} size={15} strokeWidth={1.5} color="currentColor" />
          New session
        </button>
      </div>
    {:else}
      <ul class="list" role="listbox" aria-label="Session list">
        {#each tree as node (node.session.id)}
          {@render renderSessionNode(node, 0)}
        {/each}
      </ul>
    {/if}
  </div>

  <footer class="footer">
    <ConnectionStatus />
    <ThemeToggle />
  </footer>
    </div>
  </div>
</GlassSurface>

{#if diffSessionId}
  <div
    class="diff-overlay"
    role="dialog"
    aria-modal="true"
    aria-label={`File changes for ${diffTitle}`}
    tabindex="-1"
    onkeydown={onOverlayKeydown}
  >
    <button type="button" class="diff-backdrop" aria-label="Close diff" onclick={closeDiff}></button>
    <div class="diff-sheet">
      <header class="diff-sheet-head">
        <h3 class="diff-sheet-title" title={diffTitle}>{diffTitle}</h3>
        <button type="button" class="diff-close" aria-label="Close diff" title="Close" onclick={closeDiff}>
          <HugeiconsIcon icon={Cancel01Icon} size={16} strokeWidth={1.5} color="currentColor" />
        </button>
      </header>
      <div class="diff-sheet-body">
        <SessionDiffPanel sessionId={diffSessionId} />
      </div>
    </div>
  </div>
{/if}

<style>
  :global(.session-sidebar) {
    display: flex;
    flex-direction: column;
    height: 100%;
    width: 100%;
    min-height: 0;
    overflow: hidden;
  }

  .sidebar-body {
    display: flex;
    flex-direction: row;
    flex: 1 1 auto;
    min-height: 0;
    height: 100%;
  }

  .sidebar-main {
    display: flex;
    flex-direction: column;
    flex: 1 1 auto;
    min-width: 0;
    min-height: 0;
    padding: 0.5rem;
    gap: 0.25rem;
  }

  /* Phone: rail collapses to a horizontal chip row above the session list. */
  .sidebar-body--phone {
    flex-direction: column;
  }

  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.5rem 0.5rem 0.5rem 0.75rem;
  }

  .header-title {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-width: 0;
  }

  .heading {
    margin: 0;
    flex: 0 0 auto;
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--text-secondary);
  }

  .new-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.875rem;
    height: 1.875rem;
    padding: 0;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background-color: var(--bg-elevated);
    color: var(--text-secondary);
    cursor: pointer;
    transition:
      background-color var(--transition-fast),
      border-color var(--transition-fast),
      color var(--transition-fast),
      transform var(--transition-fast);
  }

  .new-btn:hover {
    color: var(--accent-text);
    border-color: var(--border-strong);
    background-color: var(--bg-surface);
  }

  .new-btn:active {
    transform: scale(0.94);
  }

  .new-btn:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: 2px;
  }

  .list-region {
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 0 0.0625rem;
    border-radius: var(--radius-sm);
  }

  .list-region:focus {
    outline: none;
  }

  .list-region:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: -2px;
  }

  .list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
  }

  .list-item {
    margin: 0;
  }

  .session-row {
    display: grid;
    grid-template-columns: 1rem minmax(0, 1fr);
    gap: 0.125rem;
    align-items: stretch;
    margin-left: calc(var(--level, 0) * 0.875rem);
  }

  .children-toggle,
  .children-spacer {
    align-self: center;
    width: 1rem;
    height: 1rem;
  }

  .children-toggle {
    border: 0;
    padding: 0;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
    line-height: 1;
  }

  .children-toggle:hover {
    color: var(--text-primary);
    background-color: var(--bg-surface);
  }

  .child-list {
    list-style: none;
    margin: 0.125rem 0 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
  }

  /* ---- Skeleton loading ---- */
  .skeleton-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 0.25rem 0.5rem;
  }

  .skeleton {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    padding: 0.625rem 0.5rem;
  }

  .sk-line {
    height: 0.625rem;
    border-radius: var(--radius-full);
    background: linear-gradient(
      90deg,
      var(--bg-surface) 25%,
      var(--bg-elevated) 50%,
      var(--bg-surface) 75%
    );
    background-size: 200% 100%;
    animation: shimmer 1.4s ease-in-out infinite;
  }

  .sk-title {
    width: 70%;
  }

  .sk-meta {
    width: 40%;
    height: 0.5rem;
  }

  @keyframes shimmer {
    from {
      background-position: 200% 0;
    }
    to {
      background-position: -200% 0;
    }
  }

  /* ---- Empty / error states ---- */
  .state {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: 0.375rem;
    padding: 2rem 1rem;
    color: var(--text-secondary);
  }

  .state-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 3rem;
    height: 3rem;
    margin-bottom: 0.25rem;
    border-radius: var(--radius-full);
    background-color: var(--bg-surface);
    color: var(--text-muted);
  }

  .state--error .state-icon {
    color: var(--danger-text);
    background-color: rgba(239, 68, 68, 0.1);
  }

  .state-title {
    margin: 0;
    font-size: 0.8125rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .state-detail {
    margin: 0;
    font-size: 0.75rem;
    line-height: 1.4;
    color: var(--text-muted);
    max-width: 18rem;
  }

  .cta-btn,
  .retry-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    margin-top: 0.5rem;
    padding: 0.4rem 0.75rem;
    font-size: 0.75rem;
    font-weight: 500;
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition:
      background-color var(--transition-fast),
      border-color var(--transition-fast),
      transform var(--transition-fast);
  }

  .cta-btn {
    color: var(--accent-foreground);
    background-color: var(--accent);
    border: 1px solid var(--focus-ring);
  }

  .cta-btn:hover {
    background-color: var(--accent-hover);
    border-color: var(--accent-hover);
  }

  .retry-btn {
    color: var(--text-primary);
    background-color: var(--bg-elevated);
    border: 1px solid var(--border);
  }

  .retry-btn:hover {
    background-color: var(--bg-surface);
    border-color: var(--border-strong);
  }

  .cta-btn:active,
  .retry-btn:active {
    transform: scale(0.97);
  }

  .cta-btn:focus-visible,
  .retry-btn:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: 2px;
  }

  /* ---- Footer ---- */
  .footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    padding: 0.5rem 0.5rem 0.25rem;
    border-top: 1px solid var(--border);
    margin-top: 0.25rem;
  }

  /* ---- Session diff overlay ---- */
  .diff-overlay {
    position: fixed;
    inset: 0;
    z-index: 50;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
  }

  .diff-backdrop {
    position: absolute;
    inset: 0;
    border: none;
    padding: 0;
    background-color: rgba(0, 0, 0, 0.45);
    cursor: pointer;
    animation: diff-fade var(--transition-base);
  }

  .diff-sheet {
    position: relative;
    display: flex;
    flex-direction: column;
    width: min(40rem, 100%);
    max-height: min(80vh, 100%);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background-color: var(--bg-base);
    box-shadow: 0 1.25rem 3rem rgba(0, 0, 0, 0.35);
    overflow: hidden;
    animation: diff-rise var(--transition-base);
  }

  .diff-sheet-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    padding: 0.625rem 0.625rem 0.625rem 0.875rem;
    border-bottom: 1px solid var(--border);
    background-color: var(--bg-surface);
  }

  .diff-sheet-title {
    margin: 0;
    min-width: 0;
    font-size: 0.8125rem;
    font-weight: 600;
    color: var(--text-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .diff-close {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    width: 1.875rem;
    height: 1.875rem;
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

  .diff-close:hover {
    color: var(--text-primary);
    border-color: var(--border-strong);
    background-color: var(--bg-surface);
  }

  .diff-close:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: 2px;
  }

  .diff-sheet-body {
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 0.75rem;
  }

  @keyframes diff-fade {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  @keyframes diff-rise {
    from {
      opacity: 0;
      transform: translateY(0.5rem);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .sk-line {
      animation: none;
    }
    .new-btn:active,
    .cta-btn:active,
    .retry-btn:active {
      transform: none;
    }
    .diff-backdrop,
    .diff-sheet {
      animation: none;
    }
    .diff-close {
      transition: none;
    }
  }
</style>
