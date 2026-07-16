<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';

  // Bare project settings has no content of its own — redirect to the first section.
  onMount(() => {
    void goto(`/${page.params.project}/settings/agents`, { replaceState: true });
  });
</script>

<p class="redirect-note" role="status">Opening project agents…</p>

<style>
  .redirect-note {
    margin: 0;
    color: var(--text-muted);
    font-size: 0.875rem;
  }
</style>
