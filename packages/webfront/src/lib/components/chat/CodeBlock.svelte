<script lang="ts">
  import { HugeiconsIcon } from '@hugeicons/svelte';
  import { Copy01Icon, Tick02Icon } from '@hugeicons/core-free-icons';
  import { highlightCode } from '$lib/markdown/shiki.js';

  interface CodeBlockProps {
    code: string;
    lang?: string;
  }

  let { code, lang = '' }: CodeBlockProps = $props();

  let highlighted = $state<string | null>(null);
  let copied = $state(false);
  let copyResetTimer: ReturnType<typeof setTimeout> | undefined;

  const label = $derived(lang ? lang.toLowerCase() : 'text');

  // Highlight lazily on the client. Shiki never runs during SSR/prerender, so
  // the plain <pre> fallback is what the static HTML ships with.
  $effect(() => {
    const source = code;
    const language = lang;
    let cancelled = false;
    highlightCode(source, language).then((html) => {
      if (!cancelled) highlighted = html;
    });
    return () => {
      cancelled = true;
    };
  });

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(code);
      copied = true;
      clearTimeout(copyResetTimer);
      copyResetTimer = setTimeout(() => {
        copied = false;
      }, 2000);
    } catch {
      // Clipboard denied (insecure context / permission) — leave state idle.
    }
  }

  $effect(() => () => clearTimeout(copyResetTimer));
</script>

<figure class="code-block">
  <figcaption class="bar">
    <span class="lang" aria-hidden="true">{label}</span>
    <button
      type="button"
      class="copy"
      class:copied
      onclick={copy}
      aria-label={copied ? 'Copied to clipboard' : 'Copy code to clipboard'}
    >
      <HugeiconsIcon
        icon={copied ? Tick02Icon : Copy01Icon}
        size={15}
        strokeWidth={2}
        color="currentColor"
      />
      <span class="copy-text">{copied ? 'Copied' : 'Copy'}</span>
    </button>
  </figcaption>

  <div class="scroll">
    {#if highlighted}
      <!-- Shiki output: already escaped + dual-theme, safe to inline. -->
      {@html highlighted}
    {:else}
      <pre class="fallback"><code>{code}</code></pre>
    {/if}
  </div>
</figure>

<style>
  .code-block {
    margin: 0.875rem 0;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    overflow: hidden;
    background-color: var(--bg-elevated);
  }

  .bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.375rem 0.375rem 0.375rem 0.75rem;
    border-bottom: 1px solid var(--border);
    background-color: var(--bg-surface);
  }

  .lang {
    font-family: var(--font-mono);
    font-size: 0.6875rem;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--text-muted);
  }

  .copy {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.25rem 0.5rem;
    font-size: 0.75rem;
    font-weight: 500;
    color: var(--text-secondary);
    background-color: transparent;
    border: 1px solid transparent;
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition:
      color var(--transition-fast),
      background-color var(--transition-fast),
      border-color var(--transition-fast);
  }

  .copy:hover {
    color: var(--text-primary);
    background-color: var(--bg-elevated);
    border-color: var(--border);
  }

  .copy:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: 2px;
  }

  .copy.copied {
    color: var(--accent-text);
  }

  .copy-text {
    line-height: 1;
  }

  .scroll {
    overflow-x: auto;
    font-family: var(--font-mono);
    font-size: 0.8125rem;
    line-height: 1.6;
  }

  /* Shiki emits `<pre class="shiki">`; normalize padding + dual-theme swap. */
  .scroll :global(pre.shiki),
  .scroll .fallback {
    margin: 0;
    padding: 0.875rem 1rem;
    background-color: transparent !important;
    overflow-x: visible;
  }

  .scroll .fallback {
    color: var(--text-primary);
    white-space: pre;
  }

  /* Dual-theme: Shiki writes both colors as CSS vars; pick by data-theme. */
  .scroll :global(pre.shiki span) {
    color: var(--shiki-light);
  }

  :global([data-theme='dark']) .scroll :global(pre.shiki span) {
    color: var(--shiki-dark);
  }

  @media (prefers-reduced-motion: reduce) {
    .copy {
      transition: none;
    }
  }
</style>
