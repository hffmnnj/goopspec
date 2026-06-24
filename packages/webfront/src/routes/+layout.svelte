<script lang="ts">
  import '../app.css';
  import { onMount } from 'svelte';
  import { initTheme } from '$lib/stores/theme.svelte';

  let { children } = $props();

  onMount(() => initTheme());
</script>

<svelte:head>
  <meta
    name="description"
    content="GoopSpec web frontend for OpenCode-compatible agent workflows"
  />
</svelte:head>

<div class="app-root">
  {@render children?.()}
</div>

<style>
  .app-root {
    min-height: 100dvh;
    isolation: isolate;
  }
</style>
