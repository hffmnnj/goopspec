<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';

  // Bare /settings has no content of its own — redirect to the first section.
  onMount(() => {
    void goto('/settings/appearance', { replaceState: true });
  });
</script>

<p class="redirect-note" role="status">Opening appearance settings…</p>

<style>
  .redirect-note {
    margin: 0;
    color: var(--text-muted);
    font-size: 0.875rem;
  }
</style>
