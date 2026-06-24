<script lang="ts">
  import CodeBlock from './CodeBlock.svelte';
  import { normalizeOutput, truncateLines, OUTPUT_LINE_LIMIT } from './tool-card.js';

  interface ToolOutputProps {
    /** Raw tool output (string | object | unknown). */
    output?: unknown;
    /** Error text from the tool result, if the call failed. */
    error?: string;
    /** Tool name — lets T4.2 decide whether a diff view applies. */
    tool?: string;
  }

  let { output, error, tool }: ToolOutputProps = $props();

  const normalized = $derived(normalizeOutput(output, error));
  // Forwarded to the diff seam so T4.2's <DiffView> can vary by tool.
  const diffTool = $derived(tool ?? '');

  let expanded = $state(false);
  const clip = $derived(truncateLines(normalized.text));
  const visible = $derived(expanded ? normalized.text : clip.preview);
  const hiddenLines = $derived(clip.totalLines - OUTPUT_LINE_LIMIT);
</script>

{#if normalized.kind === 'empty'}
  <p class="empty">No output.</p>
{:else if normalized.kind === 'diff'}
  <!--
    T4.2 EXTENSION POINT — diff rendering.
    When the result is an edit/write whose output is a unified diff,
    T4.2 swaps this branch for <DiffView diff={normalized.text} {tool} />.
    Until then a plain `diff`-highlighted CodeBlock is the fallback.
  -->
  <div class="diff-seam" data-tool={diffTool}>
    <CodeBlock code={visible} lang="diff" />
  </div>
  {#if clip.truncated}
    <button type="button" class="more" onclick={() => (expanded = !expanded)}>
      {expanded ? 'Show less' : `Show ${hiddenLines} more lines`}
    </button>
  {/if}
{:else if normalized.kind === 'json'}
  <CodeBlock code={visible} lang="json" />
  {#if clip.truncated}
    <button type="button" class="more" onclick={() => (expanded = !expanded)}>
      {expanded ? 'Show less' : `Show ${hiddenLines} more lines`}
    </button>
  {/if}
{:else}
  <pre class="text" class:error={error != null}>{visible}</pre>
  {#if clip.truncated}
    <button type="button" class="more" onclick={() => (expanded = !expanded)}>
      {expanded ? 'Show less' : `Show ${hiddenLines} more lines`}
    </button>
  {/if}
{/if}

<style>
  .empty {
    margin: 0;
    padding: 0.5rem 0.75rem;
    font-size: 0.8125rem;
    color: var(--text-muted);
    font-style: italic;
  }

  .text {
    margin: 0;
    padding: 0.75rem;
    max-height: none;
    overflow-x: auto;
    font-family: var(--font-mono);
    font-size: 0.8125rem;
    line-height: 1.6;
    color: var(--text-primary);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    background-color: var(--bg-base);
    border-radius: var(--radius-sm);
  }

  .text.error {
    color: #f87171;
    background-color: rgba(248, 113, 113, 0.06);
  }

  .more {
    display: inline-flex;
    margin: 0.375rem 0 0;
    padding: 0.25rem 0.5rem;
    font-size: 0.75rem;
    font-weight: 500;
    color: var(--text-secondary);
    background-color: transparent;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition:
      color var(--transition-fast),
      background-color var(--transition-fast),
      border-color var(--transition-fast);
  }

  .more:hover {
    color: var(--text-primary);
    background-color: var(--bg-surface);
    border-color: var(--border-strong);
  }

  .more:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  @media (prefers-reduced-motion: reduce) {
    .more {
      transition: none;
    }
  }
</style>
