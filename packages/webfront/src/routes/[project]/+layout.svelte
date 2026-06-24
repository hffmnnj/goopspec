<script lang="ts">
  import AppShell from '$lib/components/AppShell.svelte';
  import ErrorState from '$lib/components/states/ErrorState.svelte';

  let { data, children } = $props();
</script>

{#if data.projectError}
  <main class="route-state" aria-label="Project not found">
    <ErrorState
      title="Project not found"
      message="This project link is invalid. Return to the project list and choose a project again."
    />
    <a class="route-link" href="/">Back to projects</a>
  </main>
{:else}
  <AppShell />
  {@render children?.()}
{/if}

<style>
  .route-state {
    min-height: 100dvh;
    display: grid;
    place-content: center;
    gap: 0.75rem;
    padding: 1rem;
    background: var(--bg-base);
  }

  .route-link {
    justify-self: center;
    color: var(--accent);
    font-size: 0.875rem;
    text-decoration: none;
  }

  .route-link:hover {
    text-decoration: underline;
  }
</style>
