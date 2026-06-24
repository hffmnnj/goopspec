<script lang="ts">
  import { goto } from '$app/navigation';
  import EmptyState from '$lib/components/states/EmptyState.svelte';
  import { encodeProjectPath } from '$lib/routing/path-codec.js';
  import { projects } from '$lib/stores/projects.svelte.js';

  $effect(() => {
    const target = projects.activeProject ?? projects.openedProjects[0];
    if (target) void goto(`/${encodeProjectPath(target.worktree)}`, { replaceState: true });
  });
</script>

<svelte:head>
  <title>GoopSpec</title>
</svelte:head>

<main class="root-state" aria-label="No project selected">
  <EmptyState
    title="No project selected"
    description="Open a project from the sidebar to start working with URL-based project routes."
  />
</main>

<style>
  .root-state {
    min-height: 100dvh;
    display: grid;
    place-items: center;
    padding: 1rem;
    background: var(--bg-base);
  }
</style>
