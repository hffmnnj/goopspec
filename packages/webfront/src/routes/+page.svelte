<script lang="ts">
  import { HugeiconsIcon } from '@hugeicons/svelte';
  import { SparklesIcon } from '@hugeicons/core-free-icons';
  import GlassSurface from '$lib/components/GlassSurface.svelte';
  import ThemeToggle from '$lib/components/ThemeToggle.svelte';
</script>

<!-- Decorative backdrop: soft accent-tinted blobs give the glass something to
     refract so the blur + saturation is actually visible. -->
<div class="page">
  <div class="backdrop" aria-hidden="true">
    <span class="blob blob--a"></span>
    <span class="blob blob--b"></span>
    <span class="blob blob--c"></span>
  </div>

  <header class="top-bar">
    <GlassSurface variant="subtle" class="brand-pill">
      <HugeiconsIcon
        icon={SparklesIcon}
        size={16}
        color="currentColor"
        strokeWidth={1.5}
        class="text-[var(--accent)]"
        aria-hidden="true"
      />
      <span class="brand-pill__label">GoopSpec</span>
    </GlassSurface>
    <ThemeToggle />
  </header>

  <main class="stage">
    <GlassSurface element="section" variant="floating" class="hero-card">
      <p class="hero-card__eyebrow">Web Frontend</p>
      <h1 class="hero-card__title">GoopSpec</h1>
      <p class="hero-card__subtitle">
        A premium OpenCode-parity workspace, built on Liquid Glass.
      </p>
      <div class="hero-card__row">
        <GlassSurface variant="panel" class="stat">
          <span class="stat__value">Svelte 5</span>
          <span class="stat__label">runes</span>
        </GlassSurface>
        <GlassSurface variant="panel" class="stat">
          <span class="stat__value">Liquid</span>
          <span class="stat__label">glass</span>
        </GlassSurface>
      </div>
    </GlassSurface>
  </main>
</div>

<style>
  .page {
    position: relative;
    min-height: 100vh;
    width: 100%;
    overflow: hidden;
  }

  /* --- Decorative backdrop --------------------------------------------- */
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 0;
    pointer-events: none;
  }

  .blob {
    position: absolute;
    border-radius: var(--radius-full);
    filter: blur(80px);
    opacity: 0.55;
  }

  .blob--a {
    top: -8%;
    left: -6%;
    width: 42vw;
    height: 42vw;
    background: var(--accent);
  }

  .blob--b {
    bottom: -12%;
    right: -8%;
    width: 46vw;
    height: 46vw;
    background: var(--accent-hover);
    opacity: 0.4;
  }

  .blob--c {
    top: 30%;
    left: 38%;
    width: 30vw;
    height: 30vw;
    background: var(--accent-soft);
    opacity: 0.9;
  }

  /* --- Top bar ---------------------------------------------------------- */
  .top-bar {
    position: relative;
    z-index: 1;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1.25rem 1.5rem;
  }

  :global(.brand-pill) {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.4rem 0.85rem;
    border-radius: var(--radius-full) !important;
  }

  .brand-pill__label {
    font-size: 0.8125rem;
    font-weight: 600;
    letter-spacing: -0.01em;
  }

  /* --- Stage / hero ----------------------------------------------------- */
  .stage {
    position: relative;
    z-index: 1;
    display: grid;
    place-items: center;
    min-height: calc(100vh - 5rem);
    padding: 1.5rem;
  }

  :global(.hero-card) {
    width: min(28rem, 100%);
    padding: 2.25rem;
    text-align: center;
  }

  .hero-card__eyebrow {
    margin: 0 0 0.5rem;
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.14em;
    color: var(--accent);
  }

  .hero-card__title {
    margin: 0;
    font-size: clamp(2.5rem, 8vw, 3.5rem);
    font-weight: 700;
    letter-spacing: -0.035em;
    line-height: 1;
    color: var(--text-primary);
  }

  .hero-card__subtitle {
    margin: 0.85rem auto 0;
    max-width: 22rem;
    font-size: 0.9375rem;
    line-height: 1.5;
    color: var(--text-secondary);
  }

  .hero-card__row {
    display: flex;
    gap: 0.75rem;
    justify-content: center;
    margin-top: 1.75rem;
  }

  :global(.stat) {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.1rem;
    padding: 0.75rem 1.1rem;
  }

  .stat__value {
    font-size: 0.95rem;
    font-weight: 600;
    letter-spacing: -0.01em;
    color: var(--text-primary);
  }

  .stat__label {
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--text-muted);
  }
</style>
