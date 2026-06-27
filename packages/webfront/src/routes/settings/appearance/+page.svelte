<script lang="ts">
  import { HugeiconsIcon } from '@hugeicons/svelte';
  import { Sun03Icon, Moon02Icon } from '@hugeicons/core-free-icons';
  import { theme, setTheme, type Theme } from '$lib/stores/theme.svelte.js';
  import { settings, type Density, type MotionPreference } from '$lib/stores/settings.svelte.js';

  const THEME_OPTIONS: { value: Theme; label: string; icon: typeof Sun03Icon }[] = [
    { value: 'light', label: 'Light', icon: Sun03Icon },
    { value: 'dark', label: 'Dark', icon: Moon02Icon }
  ];

  const MOTION_OPTIONS: { value: MotionPreference; label: string }[] = [
    { value: 'system', label: 'System' },
    { value: 'full', label: 'Full' },
    { value: 'reduced', label: 'Reduced' }
  ];

  /** Whether compact density is active. */
  const isCompact = $derived(settings.current.density === 'compact');

  function toggleDensity(): void {
    settings.setDensity((isCompact ? 'comfortable' : 'compact') as Density);
  }
</script>

<section class="settings-section" aria-labelledby="appearance-heading">
  <header class="section-header">
    <h2 id="appearance-heading" class="section-title">Appearance</h2>
    <p class="section-subtitle">Theme, motion, and density preferences.</p>
  </header>

  <div class="fields">
    <!-- Theme -------------------------------------------------------------- -->
    <div class="field">
      <span class="field-label" id="label-theme">Theme</span>
      <div class="segmented" role="radiogroup" aria-labelledby="label-theme">
        {#each THEME_OPTIONS as opt (opt.value)}
          <button
            type="button"
            role="radio"
            aria-checked={theme.current === opt.value}
            class="segment"
            class:active={theme.current === opt.value}
            onclick={() => setTheme(opt.value)}
          >
            <HugeiconsIcon icon={opt.icon} size={15} color="currentColor" strokeWidth={1.5} />
            {opt.label}
          </button>
        {/each}
      </div>
    </div>

    <!-- Motion ------------------------------------------------------------- -->
    <div class="field">
      <span class="field-label" id="label-motion">Motion</span>
      <div class="segmented" role="radiogroup" aria-labelledby="label-motion">
        {#each MOTION_OPTIONS as opt (opt.value)}
          <button
            type="button"
            role="radio"
            aria-checked={settings.current.motion === opt.value}
            class="segment"
            class:active={settings.current.motion === opt.value}
            onclick={() => settings.setMotion(opt.value)}
          >
            {opt.label}
          </button>
        {/each}
      </div>
    </div>

    <!-- Density ------------------------------------------------------------ -->
    <div class="field field--row">
      <label class="field-label" for="density-toggle">Compact density</label>
      <button
        id="density-toggle"
        type="button"
        role="switch"
        aria-label="Compact density"
        aria-checked={isCompact}
        class="switch"
        class:on={isCompact}
        onclick={toggleDensity}
      >
        <span class="switch-thumb"></span>
      </button>
    </div>
  </div>
</section>

<style>
  .settings-section {
    max-width: 56rem;
  }

  .section-header {
    margin-bottom: 1.5rem;
  }

  .section-title {
    margin: 0;
    font-size: 1.375rem;
    font-weight: 600;
    letter-spacing: -0.02em;
    color: var(--text-primary);
  }

  .section-subtitle {
    margin: 0.375rem 0 0;
    font-size: 0.9375rem;
    color: var(--text-secondary);
  }

  /* --- Fields ------------------------------------------------------------ */
  .fields {
    display: flex;
    flex-direction: column;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 0.625rem;
    padding: 1rem 0;
    border-bottom: 1px solid var(--border);
  }

  .field:last-child {
    border-bottom: none;
  }

  .field--row {
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
  }

  .field-label {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    font-size: 0.8125rem;
    font-weight: 500;
    color: var(--text-primary);
  }

  /* --- Segmented control ------------------------------------------------- */
  .segmented {
    display: inline-flex;
    gap: 0.25rem;
    padding: 0.25rem;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background-color: var(--bg-base);
    width: fit-content;
  }

  .segment {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.4rem 0.75rem;
    font-size: 0.8125rem;
    font-weight: 500;
    color: var(--text-secondary);
    background: transparent;
    border: none;
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition:
      color var(--transition-fast),
      background-color var(--transition-fast);
  }

  .segment:hover {
    color: var(--text-primary);
  }

  .segment.active {
    color: var(--accent-foreground);
    background-color: var(--accent);
  }

  .segment:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: 2px;
  }

  /* --- Switch ------------------------------------------------------------ */
  .switch {
    position: relative;
    width: 2.5rem;
    height: 1.5rem;
    padding: 0;
    border: 1px solid var(--border);
    border-radius: var(--radius-full);
    background-color: var(--bg-surface);
    cursor: pointer;
    transition: background-color var(--transition-base);
    flex-shrink: 0;
  }

  .switch.on {
    background-color: var(--accent);
    border-color: var(--focus-ring);
  }

  .switch-thumb {
    position: absolute;
    top: 50%;
    left: 0.1875rem;
    width: 1.0625rem;
    height: 1.0625rem;
    border-radius: var(--radius-full);
    background-color: var(--text-primary);
    transform: translate(0, -50%);
    transition: transform var(--transition-base) var(--ease-out);
  }

  .switch.on .switch-thumb {
    background-color: var(--accent-foreground);
    transform: translate(1rem, -50%);
  }

  .switch:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: 2px;
  }

  @media (prefers-reduced-motion: reduce) {
    .segment,
    .switch,
    .switch-thumb {
      transition: none;
    }
  }
</style>
