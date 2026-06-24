<script lang="ts">
  import AppShell from '$lib/components/AppShell.svelte';
  import EmptyState from '$lib/components/states/EmptyState.svelte';
  import { activeSession } from '$lib/stores/active-session.svelte.js';
  import { chat } from '$lib/stores/chat.svelte.js';

  // The root route is the no-project landing screen. Unlike the project/session
  // routes it does not select a session, so clear any lingering active session
  // and chat history when it mounts.
  $effect(() => {
    activeSession.clear();
    chat.clear();
  });
</script>

<svelte:head>
  <title>GoopSpec</title>
</svelte:head>

<AppShell main={homeMain} />

{#snippet homeMain()}
  <section class="home-placeholder" aria-label="Home">
    <EmptyState
      title="No project selected"
      description="Open a project from the sidebar to start working."
    />
  </section>
{/snippet}

<style>
  .home-placeholder {
    flex: 1 1 auto;
    min-height: 0;
    display: grid;
    place-items: center;
    padding: 1rem;
    background: var(--bg-base);
  }
</style>
