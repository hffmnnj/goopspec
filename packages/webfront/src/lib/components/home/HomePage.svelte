<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { HugeiconsIcon } from '@hugeicons/svelte';
  import {
    FolderAddIcon,
    Add01Icon,
    Message01Icon,
    ArrowRight01Icon,
    SparklesIcon,
    CommandIcon,
    Clock01Icon,
    Rocket01Icon,
    WifiConnected03Icon,
    WifiDisconnected03Icon,
  } from '@hugeicons/core-free-icons';

  import GlassSurface from '../GlassSurface.svelte';
  import { projectColor } from '../sessions/project-rail.js';

  import { projects as defaultProjects, type ProjectsStore } from '$lib/stores/projects.svelte.js';
  import { sessions as defaultSessions, type SessionsStore } from '$lib/stores/sessions.svelte.js';
  import { connection as defaultConnection } from '$lib/stores/connection.svelte.js';
  import { activeSession } from '$lib/stores/active-session.svelte.js';
  import { ui } from '$lib/stores/ui.svelte.js';
  import { createClient } from '$lib/api/client.js';
  import { fetchSessions } from '$lib/api/sessions.js';
  import type { OpenCodeClient } from '$lib/api/types.js';
  import { defaultShortcuts } from '$lib/keyboard/shortcuts.js';
  import { formatCombo } from '$lib/keyboard/registry.js';
  import { projectRoute, sessionRoute } from '$lib/routing/navigation.js';
  import {
    buildRecentProjects,
    buildRecentSessions,
    buildShortcutHints,
    describeConnection,
    isOnboarding,
    newSessionTarget,
    type ProjectSession,
  } from './home.js';

  interface HomePageProps {
    /** Override the projects store (tests). */
    projectsStore?: ProjectsStore;
    /** Override the sessions store (tests). */
    sessionsStore?: SessionsStore;
    /** Override the connection store (tests). */
    connectionStore?: typeof defaultConnection;
    /** Override the API client used to fetch recent sessions (tests). */
    client?: OpenCodeClient;
    /** Override the navigate function (tests). */
    navigate?: (target: string) => void;
  }

  let {
    projectsStore = defaultProjects,
    sessionsStore = defaultSessions,
    connectionStore = defaultConnection,
    client,
    navigate = (target: string) => void goto(target),
  }: HomePageProps = $props();

  const apiClient = $derived(client ?? createClient());

  let recentEntries = $state<ProjectSession[]>([]);

  const opened = $derived(projectsStore.openedProjects);
  const onboarding = $derived(isOnboarding(opened));

  const recentProjects = $derived(
    buildRecentProjects(opened, (id) => projectsStore.colorIndexFor(id), {
      limit: 8,
      sessionCountFor: (id) =>
        recentEntries.filter((entry) => entry.project.id === id).length || undefined,
    })
  );

  const recentSessions = $derived(buildRecentSessions(recentEntries, { limit: 6 }));

  const connectionInfo = $derived(
    describeConnection(connectionStore.current.status, connectionStore.current.serverUrl)
  );

  const shortcutHints = $derived(
    buildShortcutHints(defaultShortcuts, (combo) => formatCombo(combo))
  );

  onMount(() => {
    void loadRecentSessions();
  });

  /**
   * Lazily fetch recent sessions for the active (or most recent) project so the
   * resume list has content. Degrades to an empty list when disconnected.
   */
  async function loadRecentSessions(): Promise<void> {
    const target = newSessionTarget(projectsStore.activeProject, opened);
    if (!target) return;
    try {
      const directory = target.id === 'local' ? undefined : target.worktree;
      const list = await fetchSessions(apiClient, directory);
      recentEntries = list.map((session) => ({ session, project: target }));
    } catch {
      recentEntries = [];
    }
  }

  function openPicker(): void {
    ui.addProjectOpen = true;
  }

  async function handleNewSession(): Promise<void> {
    const target = newSessionTarget(projectsStore.activeProject, opened);
    if (!target) {
      openPicker();
      return;
    }
    if (projectsStore.activeProject?.id !== target.id) projectsStore.setActiveProject(target);
    const created = await sessionsStore.create();
    if (created) {
      activeSession.select(created.id);
      navigate(sessionRoute(target, created.id));
    }
  }

  function openProjectCard(card: { id: string; path: string }): void {
    const project = opened.find((p) => p.id === card.id);
    if (project) navigate(projectRoute(project));
  }

  function openSettings(): void {
    void goto('/settings/server');
  }
</script>

<main id="home" class="home" aria-labelledby="home-title">
  <div class="home-scroll">
    <!-- Brand hero -->
    <header class="hero">
      <div class="hero-glow" aria-hidden="true"></div>
      <span class="hero-eyebrow">
        <HugeiconsIcon icon={SparklesIcon} size={14} strokeWidth={1.5} color="currentColor" />
        Agentic workspace
      </span>
      <h1 id="home-title" class="hero-title">GoopSpec</h1>
      <p class="hero-tagline">Plan, build, and ship with your agents — all in one workspace.</p>

      <div class="hero-status">
        {#if connectionInfo.connected}
          <span class="conn conn--on" role="status" aria-label={connectionInfo.label}>
            <span class="conn-dot" aria-hidden="true"></span>
            <HugeiconsIcon icon={WifiConnected03Icon} size={14} strokeWidth={1.5} color="currentColor" />
            {connectionInfo.label}
          </span>
        {:else}
          <button type="button" class="conn conn--off" onclick={openSettings} title={connectionInfo.hint ?? undefined}>
            <span class="conn-dot conn-dot--off" aria-hidden="true"></span>
            <HugeiconsIcon icon={WifiDisconnected03Icon} size={14} strokeWidth={1.5} color="currentColor" />
            {connectionInfo.label}
          </button>
          {#if connectionInfo.hint}
            <span class="conn-hint">{connectionInfo.hint}</span>
          {/if}
        {/if}
      </div>
    </header>

    <!-- Primary actions -->
    <section class="actions" aria-label="Quick actions">
      <div class="action-wrap">
        <button type="button" class="action-card" onclick={openPicker}>
          <span class="action-icon">
            <HugeiconsIcon icon={FolderAddIcon} size={22} strokeWidth={1.5} color="currentColor" />
          </span>
          <span class="action-text">
            <span class="action-title">Open project</span>
            <span class="action-sub">Add a worktree to your workspace</span>
          </span>
          <span class="action-arrow" aria-hidden="true">
            <HugeiconsIcon icon={ArrowRight01Icon} size={18} strokeWidth={1.5} color="currentColor" />
          </span>
        </button>
      </div>

      <button type="button" class="action-card action-card--accent" onclick={handleNewSession}>
        <span class="action-icon">
          <HugeiconsIcon icon={Add01Icon} size={22} strokeWidth={1.5} color="currentColor" />
        </span>
        <span class="action-text">
          <span class="action-title">New session</span>
          <span class="action-sub">
            {opened.length > 0 ? 'Start a conversation now' : 'Open a project to begin'}
          </span>
        </span>
        <span class="action-arrow" aria-hidden="true">
          <HugeiconsIcon icon={ArrowRight01Icon} size={18} strokeWidth={1.5} color="currentColor" />
        </span>
      </button>
    </section>

    {#if onboarding}
      <!-- First-run onboarding -->
      <section class="onboarding" aria-label="Get started">
        <GlassSurface variant="panel" class="onboarding-surface">
          <span class="onboarding-icon" aria-hidden="true">
            <HugeiconsIcon icon={Rocket01Icon} size={28} strokeWidth={1.5} color="currentColor" />
          </span>
          <h2 class="onboarding-title">Open your first project</h2>
          <p class="onboarding-text">
            Point GoopSpec at a project directory to load its sessions and start working with
            your agents. Your opened projects stay in the rail for next time.
          </p>
          <button type="button" class="onboarding-cta" onclick={openPicker}>
            <HugeiconsIcon icon={FolderAddIcon} size={16} strokeWidth={1.5} color="currentColor" />
            Open a project
          </button>
        </GlassSurface>
      </section>
    {:else}
      <!-- Recent projects -->
      <section class="block" aria-labelledby="recent-projects-title">
        <div class="block-head">
          <h2 id="recent-projects-title" class="block-title">Recent projects</h2>
        </div>
        <ul class="project-grid" role="list">
          {#each recentProjects as card (card.id)}
            <li>
              <button
                type="button"
                class="project-card"
                onclick={() => openProjectCard(card)}
                aria-label={`Open ${card.name} (${card.path})`}
              >
                <span
                  class="project-avatar"
                  style:background-color={projectColor(card.id, card.colorIndex)}
                  aria-hidden="true"
                >
                  {card.initial}
                </span>
                <span class="project-meta">
                  <span class="project-name">{card.name}</span>
                  <span class="project-path" title={card.path}>{card.path}</span>
                  {#if card.sessionCount}
                    <span class="project-count">
                      {card.sessionCount} {card.sessionCount === 1 ? 'session' : 'sessions'}
                    </span>
                  {/if}
                </span>
              </button>
            </li>
          {/each}
        </ul>
      </section>

      <!-- Recent sessions -->
      {#if recentSessions.length > 0}
        <section class="block" aria-labelledby="recent-sessions-title">
          <div class="block-head">
            <h2 id="recent-sessions-title" class="block-title">Recent sessions</h2>
          </div>
          <ul class="session-list" role="list">
            {#each recentSessions as row (row.id)}
              <li>
                <button
                  type="button"
                  class="session-row"
                  onclick={() => navigate(sessionRoute(row.project, row.id))}
                  aria-label={`Resume ${row.title} in ${row.projectName}`}
                >
                  <span class="session-icon" aria-hidden="true">
                    <HugeiconsIcon icon={Message01Icon} size={16} strokeWidth={1.5} color="currentColor" />
                  </span>
                  <span class="session-title">{row.title}</span>
                  <span class="session-project">{row.projectName}</span>
                  <span class="session-time" title={row.updatedAt}>
                    <HugeiconsIcon icon={Clock01Icon} size={12} strokeWidth={1.5} color="currentColor" />
                    {row.updatedLabel}
                  </span>
                </button>
              </li>
            {/each}
          </ul>
        </section>
      {/if}
    {/if}

    <!-- Shortcut hints -->
    {#if shortcutHints.length > 0}
      <footer class="shortcuts" aria-label="Keyboard shortcuts">
        <HugeiconsIcon icon={CommandIcon} size={13} strokeWidth={1.5} color="currentColor" />
        {#each shortcutHints as hint (hint.combo)}
          <span class="shortcut">
            <kbd class="kbd">{hint.combo}</kbd>
            <span class="shortcut-label">{hint.description}</span>
          </span>
        {/each}
      </footer>
    {/if}
  </div>
</main>

<style>
  .home {
    flex: 1 1 auto;
    min-height: 0;
    display: flex;
    flex-direction: column;
    background: var(--bg-base);
  }

  .home-scroll {
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    width: 100%;
    max-width: 64rem;
    margin: 0 auto;
    padding: clamp(1.5rem, 4vw, 4rem) clamp(1rem, 4vw, 2.5rem) 2.5rem;
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
    gap: clamp(1.75rem, 4vw, 3rem);
  }

  /* ---- Hero ---- */
  .hero {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.5rem;
    padding-top: 1rem;
  }

  .hero-glow {
    position: absolute;
    top: -3rem;
    left: -2rem;
    width: 22rem;
    height: 22rem;
    max-width: 80vw;
    border-radius: var(--radius-full);
    background: radial-gradient(circle at center, var(--accent) 0%, transparent 68%);
    opacity: 0.1;
    filter: blur(56px);
    pointer-events: none;
    z-index: 0;
  }

  /*
   * Lift the real hero content above the decorative glow. This MUST exclude
   * `.hero-glow` itself — a blanket `.hero > *` rule would override the glow's
   * `position: absolute` back to `relative`, dropping it into flow as a ~22rem
   * tall flex item that pushed all hero content ~352px down the page.
   */
  .hero > :global(*:not(.hero-glow)) {
    position: relative;
    z-index: 1;
  }

  .hero-eyebrow {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.25rem 0.625rem;
    font-size: 0.6875rem;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--accent-text);
    background-color: var(--accent-soft);
    border-radius: var(--radius-full);
  }

  .hero-title {
    margin: 0.25rem 0 0;
    font-family: var(--font-sans);
    font-size: clamp(2.5rem, 7vw, 4.25rem);
    font-weight: 700;
    letter-spacing: -0.04em;
    line-height: 1;
    color: var(--text-primary);
  }

  .hero-tagline {
    margin: 0;
    max-width: 34rem;
    font-size: clamp(0.95rem, 2vw, 1.125rem);
    line-height: 1.5;
    color: var(--text-secondary);
  }

  .hero-status {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem 0.75rem;
    margin-top: 0.625rem;
  }

  .conn {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.3rem 0.7rem;
    font-size: 0.75rem;
    font-weight: 500;
    border-radius: var(--radius-full);
    border: 1px solid var(--border);
  }

  .conn--on {
    color: var(--accent-text);
    background-color: var(--accent-soft);
    border-color: transparent;
  }

  .conn--off {
    color: var(--text-secondary);
    background-color: var(--bg-elevated);
    cursor: pointer;
    transition: border-color var(--transition-fast), color var(--transition-fast);
  }

  .conn--off:hover {
    color: var(--text-primary);
    border-color: var(--border-strong);
  }

  .conn--off:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: 2px;
  }

  .conn-dot {
    width: 0.5rem;
    height: 0.5rem;
    border-radius: var(--radius-full);
    background-color: var(--accent);
    box-shadow: 0 0 0 3px var(--accent-soft);
  }

  .conn-dot--off {
    background-color: var(--text-muted);
    box-shadow: none;
  }

  .conn-hint {
    font-size: 0.75rem;
    color: var(--text-muted);
  }

  /* ---- Primary actions ---- */
  .actions {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr));
    gap: 0.875rem;
  }

  .action-wrap {
    position: relative;
  }

  .action-card {
    display: flex;
    align-items: center;
    gap: 0.875rem;
    width: 100%;
    padding: 1rem 1.125rem;
    text-align: left;
    color: var(--text-primary);
    background-color: var(--bg-elevated);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    cursor: pointer;
    transition:
      transform var(--transition-base),
      border-color var(--transition-fast),
      background-color var(--transition-fast),
      box-shadow var(--transition-base);
  }

  .action-card:hover {
    transform: translateY(-2px);
    border-color: var(--border-strong);
    box-shadow: var(--shadow-md);
  }

  .action-card:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: 2px;
  }

  .action-card--accent {
    color: var(--accent-foreground);
    background-color: var(--accent);
    border-color: transparent;
  }

  .action-card--accent:hover {
    background-color: var(--accent-hover);
  }

  .action-card--accent .action-sub {
    color: rgba(9, 9, 11, 0.7);
  }

  .action-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    width: 2.75rem;
    height: 2.75rem;
    border-radius: var(--radius);
    background-color: var(--bg-surface);
    color: var(--accent-text);
  }

  .action-card--accent .action-icon {
    background-color: rgba(9, 9, 11, 0.12);
    color: var(--accent-foreground);
  }

  .action-text {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
    min-width: 0;
    flex: 1 1 auto;
  }

  .action-title {
    font-size: 0.9375rem;
    font-weight: 600;
  }

  .action-sub {
    font-size: 0.8125rem;
    color: var(--text-muted);
  }

  .action-arrow {
    display: inline-flex;
    flex: 0 0 auto;
    color: var(--text-muted);
    transition: transform var(--transition-base);
  }

  .action-card--accent .action-arrow {
    color: var(--accent-foreground);
  }

  .action-card:hover .action-arrow {
    transform: translateX(3px);
  }

  /* ---- Onboarding ---- */
  .onboarding {
    display: flex;
  }

  :global(.onboarding-surface) {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.625rem;
    width: 100%;
    padding: clamp(1.5rem, 4vw, 2.5rem);
    border-radius: var(--radius-lg);
  }

  .onboarding-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 3.25rem;
    height: 3.25rem;
    border-radius: var(--radius);
    color: var(--accent-text);
    background-color: var(--accent-soft);
  }

  .onboarding-title {
    margin: 0.25rem 0 0;
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .onboarding-text {
    margin: 0;
    max-width: 32rem;
    font-size: 0.9375rem;
    line-height: 1.55;
    color: var(--text-secondary);
  }

  .onboarding-cta {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    margin-top: 0.5rem;
    padding: 0.55rem 1rem;
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--accent-foreground);
    background-color: var(--accent);
    border: 1px solid transparent;
    border-radius: var(--radius);
    cursor: pointer;
    transition: background-color var(--transition-fast), transform var(--transition-fast);
  }

  .onboarding-cta:hover {
    background-color: var(--accent-hover);
  }

  .onboarding-cta:active {
    transform: scale(0.97);
  }

  .onboarding-cta:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: 2px;
  }

  /* ---- Blocks (recent projects / sessions) ---- */
  .block {
    display: flex;
    flex-direction: column;
    gap: 0.875rem;
  }

  .block-title {
    margin: 0;
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--text-secondary);
  }

  .project-grid {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(15rem, 1fr));
    gap: 0.75rem;
  }

  .project-card {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    width: 100%;
    padding: 0.875rem;
    text-align: left;
    background-color: var(--bg-elevated);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    cursor: pointer;
    transition:
      transform var(--transition-base),
      border-color var(--transition-fast),
      box-shadow var(--transition-base);
  }

  .project-card:hover {
    transform: translateY(-2px);
    border-color: var(--border-strong);
    box-shadow: var(--shadow-sm);
  }

  .project-card:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: 2px;
  }

  .project-avatar {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    width: 2.5rem;
    height: 2.5rem;
    border-radius: var(--radius);
    font-size: 1rem;
    font-weight: 700;
    color: #fff;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.35);
  }

  .project-meta {
    display: flex;
    flex-direction: column;
    gap: 0.0625rem;
    min-width: 0;
  }

  .project-name {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--text-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .project-path {
    font-size: 0.6875rem;
    color: var(--text-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .project-count {
    margin-top: 0.125rem;
    font-size: 0.6875rem;
    color: var(--accent-text);
  }

  /* ---- Recent sessions ---- */
  .session-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .session-row {
    display: flex;
    align-items: center;
    gap: 0.625rem;
    width: 100%;
    padding: 0.625rem 0.75rem;
    text-align: left;
    background-color: transparent;
    border: 1px solid transparent;
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: background-color var(--transition-fast), border-color var(--transition-fast);
  }

  .session-row:hover {
    background-color: var(--bg-elevated);
    border-color: var(--border);
  }

  .session-row:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: 2px;
  }

  .session-icon {
    display: inline-flex;
    flex: 0 0 auto;
    color: var(--text-muted);
  }

  .session-title {
    flex: 1 1 auto;
    min-width: 0;
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--text-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .session-project {
    flex: 0 0 auto;
    max-width: 40%;
    font-size: 0.75rem;
    color: var(--text-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .session-time {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    flex: 0 0 auto;
    font-size: 0.6875rem;
    color: var(--text-muted);
    font-variant-numeric: tabular-nums;
  }

  /* ---- Shortcut hints ---- */
  .shortcuts {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem 1.25rem;
    margin-top: auto;
    padding-top: 1rem;
    border-top: 1px solid var(--border);
    color: var(--text-muted);
  }

  .shortcut {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
  }

  .kbd {
    display: inline-flex;
    align-items: center;
    min-width: 1.5rem;
    height: 1.375rem;
    padding: 0 0.4rem;
    font-family: var(--font-mono);
    font-size: 0.6875rem;
    color: var(--text-secondary);
    background-color: var(--bg-surface);
    border: 1px solid var(--border);
    border-bottom-width: 2px;
    border-radius: var(--radius-sm);
  }

  .shortcut-label {
    font-size: 0.75rem;
  }

  /* ---- Responsive ---- */
  @media (max-width: 639px) {
    .actions,
    .project-grid {
      grid-template-columns: 1fr;
    }

    .session-project {
      display: none;
    }
  }

  /* ---- Reduced motion ---- */
  @media (prefers-reduced-motion: reduce) {
    .action-card,
    .project-card,
    .session-row,
    .action-arrow,
    .conn--off,
    .onboarding-cta {
      transition: none;
    }

    .action-card:hover,
    .project-card:hover {
      transform: none;
    }

    .action-card:hover .action-arrow {
      transform: none;
    }

    .onboarding-cta:active {
      transform: none;
    }
  }
</style>
