<script lang="ts">
  interface SkeletonProps {
    /** Preset shape. `line` is the primitive; presets compose multiple lines. */
    variant?: 'line' | 'text' | 'card' | 'list' | 'circle';
    /** Width (any CSS length). Applies to `line`/`circle`. */
    width?: string;
    /** Height (any CSS length). Applies to `line`/`circle`. */
    height?: string;
    /** Number of rows for `text` / `list` presets. */
    lines?: number;
    /** Additional classes. */
    class?: string;
  }

  let {
    variant = 'line',
    width,
    height,
    lines = 3,
    class: className = '',
  }: SkeletonProps = $props();

  const rows = $derived(Array.from({ length: Math.max(1, lines) }, (_, i) => i));
</script>

{#if variant === 'line'}
  <span class={`sk sk--line ${className}`.trim()} style:width={width} style:height={height} aria-hidden="true"></span>
{:else if variant === 'circle'}
  <span class={`sk sk--circle ${className}`.trim()} style:width={width ?? '2.5rem'} style:height={height ?? '2.5rem'} aria-hidden="true"></span>
{:else if variant === 'text'}
  <span class={`sk-text ${className}`.trim()} aria-hidden="true">
    {#each rows as i (i)}
      <span class="sk sk--line" style:width={i === rows.length - 1 ? '60%' : '100%'}></span>
    {/each}
  </span>
{:else if variant === 'card'}
  <span class={`sk-card ${className}`.trim()} aria-hidden="true">
    <span class="sk sk--line" style:width="70%"></span>
    <span class="sk sk--line" style:width="100%"></span>
    <span class="sk sk--line" style:width="45%"></span>
  </span>
{:else if variant === 'list'}
  <span class={`sk-list ${className}`.trim()} aria-hidden="true">
    {#each rows as i (i)}
      <span class="sk-list__row">
        <span class="sk sk--circle" style:width="1.75rem" style:height="1.75rem"></span>
        <span class="sk-list__lines">
          <span class="sk sk--line" style:width="65%"></span>
          <span class="sk sk--line" style:width="40%" style:height="0.5rem"></span>
        </span>
      </span>
    {/each}
  </span>
{/if}

<style>
  .sk {
    display: block;
    background: linear-gradient(
      90deg,
      var(--bg-surface) 25%,
      var(--bg-elevated) 50%,
      var(--bg-surface) 75%
    );
    background-size: 200% 100%;
    animation: shimmer 1.4s ease-in-out infinite;
  }

  .sk--line {
    height: 0.75rem;
    border-radius: var(--radius-full);
  }

  .sk--circle {
    border-radius: var(--radius-full);
    flex: 0 0 auto;
  }

  .sk-text,
  .sk-card {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .sk-list {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .sk-list__row {
    display: flex;
    align-items: center;
    gap: 0.625rem;
  }

  .sk-list__lines {
    flex: 1 1 auto;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  @keyframes shimmer {
    from {
      background-position: 200% 0;
    }
    to {
      background-position: -200% 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .sk {
      animation: none;
    }
  }
</style>
