<script lang="ts">
  import { HugeiconsIcon } from '@hugeicons/svelte';
  import { Loading03Icon } from '@hugeicons/core-free-icons';

  interface SpinnerProps {
    /** Icon diameter in px. */
    size?: number;
    /** Accessible label; when omitted the spinner is purely decorative. */
    label?: string;
    /** Additional classes. */
    class?: string;
  }

  let { size = 18, label, class: className = '' }: SpinnerProps = $props();
</script>

<span
  class={`spinner ${className}`.trim()}
  role={label ? 'status' : undefined}
  aria-label={label}
  aria-hidden={label ? undefined : 'true'}
>
  <HugeiconsIcon icon={Loading03Icon} {size} strokeWidth={2} color="currentColor" />
</span>

<style>
  .spinner {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--text-muted);
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .spinner {
      animation-duration: 1.8s;
    }
  }
</style>
