<script lang="ts">
  import ErrorState from '$lib/components/states/ErrorState.svelte';
  import LoadingState from '$lib/components/states/LoadingState.svelte';
  import { syncSessionRoute, type RouteSyncResult } from '$lib/routing/route-sync.js';
  import { activeSession } from '$lib/stores/active-session.svelte.js';
  import { projects } from '$lib/stores/projects.svelte.js';
  import { sessions } from '$lib/stores/sessions.svelte.js';

  let { data } = $props();
  let routeStatus = $state<RouteSyncResult | { status: 'loading' } | null>(null);
  let routeVersion = 0;

  $effect(() => {
    if (!data.projectPath) return;

    const version = ++routeVersion;
    routeStatus = { status: 'loading' };

    void syncSessionRoute({
      projectPath: data.projectPath,
      sessionId: data.sessionId,
      projectsStore: projects,
      sessionsStore: sessions,
      activeSessionStore: activeSession,
    }).then((result) => {
      if (version === routeVersion) routeStatus = result;
    });
  });
</script>

<svelte:head>
  <title>{data.sessionId} · GoopSpec</title>
</svelte:head>

{#if routeStatus?.status === 'loading'}
  <section class="route-overlay" aria-label="Loading session">
    <LoadingState variant="spinner" label="Loading session…" />
  </section>
{:else if routeStatus?.status === 'session-not-found'}
  <section class="route-overlay" aria-label="Session not found">
    <ErrorState
      title="Session not found"
      message="This session does not exist in the selected project. Choose another session from the sidebar."
    />
    <a class="route-link" href={`/${data.projectParam}`}>Back to project</a>
  </section>
{:else if routeStatus?.status === 'error'}
  <section class="route-overlay" aria-label="Session route error">
    <ErrorState title="Couldn't load session" message={routeStatus.message} />
    <a class="route-link" href={`/${data.projectParam}`}>Back to project</a>
  </section>
{/if}

<style>
  .route-overlay {
    position: fixed;
    inset: 50% auto auto 50%;
    z-index: 60;
    width: min(28rem, calc(100vw - 2rem));
    transform: translate(-50%, -50%);
    padding: 1rem;
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    background: var(--bg-elevated);
    box-shadow: var(--shadow-xl);
  }

  .route-link {
    display: block;
    margin-top: 0.75rem;
    color: var(--accent);
    font-size: 0.875rem;
    text-align: center;
    text-decoration: none;
  }

  .route-link:hover {
    text-decoration: underline;
  }
</style>
