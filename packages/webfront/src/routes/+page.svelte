<script lang="ts">
  import AppShell from '$lib/components/AppShell.svelte';
  import HomePage from '$lib/components/home/HomePage.svelte';
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
  <HomePage />
{/snippet}
