<script lang="ts">
  import { activeSession } from '$lib/stores/active-session.svelte.js';

  let { data } = $props();

  $effect(() => {
    if (activeSession.activeId !== data.sessionId) activeSession.select(data.sessionId);
  });
</script>

<svelte:head>
  <title>{data.sessionId} · GoopSpec</title>
</svelte:head>
