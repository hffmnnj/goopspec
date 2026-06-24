<script lang="ts">
  import '../app.css';
  import { onMount } from 'svelte';
  import { initConnection } from '$lib/stores/connection.svelte.js';
  import { initTheme } from '$lib/stores/theme.svelte';
  import { settings } from '$lib/stores/settings.svelte';

  let { children } = $props();

  onMount(() => {
    const stopTheme = initTheme();
    const stopConnection = initConnection();
    settings.applyDom();
    return () => {
      stopConnection();
      stopTheme();
    };
  });
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
