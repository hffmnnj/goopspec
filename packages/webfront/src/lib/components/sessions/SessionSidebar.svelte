<script lang="ts">
  import { onMount } from 'svelte';
  import { HugeiconsIcon } from '@hugeicons/svelte';
  import { Add01Icon, InboxIcon, Alert02Icon, RefreshIcon } from '@hugeicons/core-free-icons';
  import GlassSurface from '../GlassSurface.svelte';
  import ThemeToggle from '../ThemeToggle.svelte';
  import ConnectionStatus from '../ConnectionStatus.svelte';
  import SessionCard from './SessionCard.svelte';
  import SessionSearch from './SessionSearch.svelte';
  import { sessions as defaultStore } from '$lib/stores/sessions.svelte.js';
  import { activeSession } from '$lib/stores/active-session.svelte.js';
  import { chat } from '$lib/stores/chat.svelte.js';
  import { filterSessions } from '$lib/sessions/search.js';

  interface SessionsLike {
    sorted: import('$lib/api/types.js').Session[];
    loading: boolean;
    error: string | null;
    load(): Promise<void>;
    create(): Promise<unknown>;
    remove(id: string): Promise<unknown>;
    rename(id: string, title: string): Promise<unknown>;
  }

  interface SidebarProps {
    /** Override the session store (defaults to the shared reactive store). */
    store?: SessionsLike;
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
    activeSessionId,
    onselect,
  }: SidebarProps = $props();

  const SKELETON_COUNT = 5;

  let searchQuery = $state('');

  // Active-session seam: prefer the T5.2 active-session store, then explicit prop, then chat store.
  const activeId = $derived(activeSession.activeId ?? activeSessionId ?? chat.activeSessionId);

  const items = $derived(filterSessions(store.sorted, searchQuery));
  const isLoading = $derived(store.loading);
  const errorMsg = $derived(store.error);
  const isEmpty = $derived(!isLoading && !errorMsg && items.length === 0);

  onMount(() => {
    void store.load();
  });

  async function handleCreate(): Promise<void> {
    const created = await store.create();
    const id = (created as { id?: string } | undefined)?.id;
    if (id) onselect?.(id);
  }

  function handleSelect(id: string): void {
    activeSession.select(id);
    onselect?.(id);
  }

  function handleRename(id: string, title: string): void {
    void store.rename(id, title);
  }

  function handleDelete(id: string): void {
    void store.remove(id);
  }
</script>

<GlassSurface variant="panel" element="aside" class="session-sidebar" aria-label="Sessions">
  <header class="header">
    <h2 class="heading">Sessions</h2>
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

  <div class="list-region">
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
        {#each items as session (session.id)}
          <li class="list-item">
            <SessionCard
              {session}
              active={session.id === activeId}
              onselect={handleSelect}
              onrename={handleRename}
              ondelete={handleDelete}
            />
          </li>
        {/each}
      </ul>
    {/if}
  </div>

  <footer class="footer">
    <ConnectionStatus />
    <ThemeToggle />
  </footer>
</GlassSurface>

<style>
  :global(.session-sidebar) {
    display: flex;
    flex-direction: column;
    height: 100%;
    width: 100%;
    min-height: 0;
    padding: 0.5rem;
    gap: 0.25rem;
  }

  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.5rem 0.5rem 0.5rem 0.75rem;
  }

  .heading {
    margin: 0;
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

  @media (prefers-reduced-motion: reduce) {
    .sk-line {
      animation: none;
    }
    .new-btn:active,
    .cta-btn:active,
    .retry-btn:active {
      transform: none;
    }
  }
</style>
