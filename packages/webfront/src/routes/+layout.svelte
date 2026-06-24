<script lang="ts">
  import '../app.css';
  import { onMount } from 'svelte';
  import { initTheme } from '$lib/stores/theme.svelte';
  import ThemeToggle from '$lib/components/ThemeToggle.svelte';

  let { children } = $props();

  onMount(() => initTheme());
</script>

<svelte:head>
  <title>GoopSpec</title>
  <meta
    name="description"
    content="GoopSpec web frontend for OpenCode-compatible agent workflows"
  />
</svelte:head>

<main class="relative min-h-screen antialiased">
  <div class="theme-toggle-slot">
    <ThemeToggle />
  </div>

  {@render children?.()}
</main>

<style>
  .theme-toggle-slot {
    position: fixed;
    top: 1rem;
    right: 1rem;
    z-index: 50;
  }
</style>
