<script lang="ts">
  import { activeSession } from '$lib/stores/active-session.svelte.js';
  import { chat } from '$lib/stores/chat.svelte.js';

  $effect(() => {
    activeSession.clear();
    chat.clear();
  });
</script>

<svelte:head>
  <title>GoopSpec Project</title>
</svelte:head>
