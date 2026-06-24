<script lang="ts">
  import AppShell from '$lib/components/AppShell.svelte';
  import ErrorState from '$lib/components/states/ErrorState.svelte';
  import LoadingState from '$lib/components/states/LoadingState.svelte';
  import { projects } from '$lib/stores/projects.svelte.js';

  let { data, children } = $props();
  let resolvingProject = $state(false);
  let projectRouteError = $state<string | null>(null);
  let routeVersion = 0;

  $effect(() => {
    const projectPath = data.projectPath;
    if (!projectPath) return;

    const version = ++routeVersion;
    resolvingProject = true;
    projectRouteError = null;

    void projects.ensureProjectPath(projectPath).catch((error) => {
      if (version !== routeVersion) return;
      projectRouteError = error instanceof Error ? error.message : 'Failed to open project';
    }).finally(() => {
      if (version === routeVersion) resolvingProject = false;
    });
  });
</script>

{#if data.projectError}
  <main class="route-state" aria-label="Project not found">
    <ErrorState
      title="Project not found"
      message="This project link is invalid. Return to the project list and choose a project again."
    />
    <a class="route-link" href="/">Back to projects</a>
  </main>
{:else if projectRouteError}
  <main class="route-state" aria-label="Project not found">
    <ErrorState
      title="Project not found"
      message={projectRouteError}
    />
    <a class="route-link" href="/">Back to projects</a>
  </main>
{:else if resolvingProject && projects.activeProject?.worktree !== data.projectPath}
  <main class="route-state" aria-label="Opening project">
    <LoadingState variant="spinner" label="Opening project…" />
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
