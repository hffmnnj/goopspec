<script lang="ts">
  import '../app.css';
</script>

<svelte:head>
  <title>GoopSpec</title>
  <meta
    name="description"
    content="GoopSpec web frontend for OpenCode-compatible agent workflows"
  />
</svelte:head>

<main class="min-h-screen bg-[Canvas] text-[CanvasText] antialiased">
  <slot />
</main>
