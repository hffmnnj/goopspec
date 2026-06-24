<script lang="ts">
  import { HugeiconsIcon } from '@hugeicons/svelte';
  import { Settings01Icon } from '@hugeicons/core-free-icons';

  interface SettingsButtonProps {
    /** Invoked when the button is activated. Wire to open the settings panel. */
    onclick?: () => void;
  }

  let { onclick }: SettingsButtonProps = $props();
</script>

<button
  type="button"
  class="settings-button"
  aria-label="Open settings"
  title="Settings"
  {onclick}
>
  <HugeiconsIcon icon={Settings01Icon} size={18} color="currentColor" strokeWidth={1.5} />
</button>

<style>
  .settings-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 2.25rem;
    height: 2.25rem;
    padding: 0;
    border: 1px solid var(--border);
    border-radius: var(--radius-full);
    background-color: var(--bg-elevated);
    color: var(--text-secondary);
    cursor: pointer;
    transition:
      background-color var(--transition-fast),
      border-color var(--transition-fast),
      color var(--transition-fast),
      transform var(--transition-fast);
  }

  .settings-button:hover {
    color: var(--text-primary);
    border-color: var(--border-strong);
    background-color: var(--bg-surface);
  }

  .settings-button:active {
    transform: scale(0.94);
  }

  .settings-button:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  @media (prefers-reduced-motion: reduce) {
    .settings-button:active {
      transform: none;
    }
  }
</style>
