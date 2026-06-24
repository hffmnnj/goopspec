<script lang="ts">
  import { renderMarkdown } from '$lib/markdown/render.js';
  import CodeBlock from './CodeBlock.svelte';

  interface MarkdownProps {
    text: string;
  }

  let { text }: MarkdownProps = $props();

  const blocks = $derived(renderMarkdown(text));
</script>

<div class="prose">
  {#each blocks as block, index (index)}
    {#if block.kind === 'code'}
      <CodeBlock code={block.code} lang={block.lang} />
    {:else}
      <!-- Sanitized by renderMarkdown via DOMPurify before reaching here. -->
      {@html block.html}
    {/if}
  {/each}
</div>

<style>
  .prose {
    max-width: 100%;
    color: var(--text-primary);
    font-size: 0.9375rem;
    line-height: 1.65;
    overflow-wrap: anywhere;
  }

  /* Headings — tight Linear/Vercel hierarchy. */
  .prose :global(h1),
  .prose :global(h2),
  .prose :global(h3),
  .prose :global(h4) {
    margin: 1.25em 0 0.5em;
    font-weight: 600;
    line-height: 1.3;
    color: var(--text-primary);
  }

  .prose :global(:first-child) {
    margin-top: 0;
  }
  .prose :global(:last-child) {
    margin-bottom: 0;
  }

  .prose :global(h1) {
    font-size: 1.375rem;
  }
  .prose :global(h2) {
    font-size: 1.1875rem;
  }
  .prose :global(h3) {
    font-size: 1.0625rem;
  }
  .prose :global(h4) {
    font-size: 0.9375rem;
  }

  .prose :global(p) {
    margin: 0 0 0.75em;
  }

  .prose :global(a) {
    color: var(--accent-text);
    text-decoration: underline;
    text-underline-offset: 2px;
    text-decoration-thickness: 1px;
  }
  .prose :global(a:hover) {
    color: var(--accent-hover);
  }

  .prose :global(strong) {
    font-weight: 600;
    color: var(--text-primary);
  }
  .prose :global(em) {
    font-style: italic;
  }
  .prose :global(del) {
    color: var(--text-muted);
  }

  /* Lists. */
  .prose :global(ul),
  .prose :global(ol) {
    margin: 0 0 0.75em;
    padding-left: 1.5em;
  }
  .prose :global(li) {
    margin: 0.25em 0;
  }
  .prose :global(li > ul),
  .prose :global(li > ol) {
    margin: 0.25em 0;
  }

  /* GFM task lists. */
  .prose :global(li:has(> input[type='checkbox'])) {
    list-style: none;
    margin-left: -1.25em;
  }
  .prose :global(input[type='checkbox']) {
    margin-right: 0.5em;
    accent-color: var(--accent);
    vertical-align: middle;
  }

  /* Inline code. */
  .prose :global(:not(pre) > code) {
    padding: 0.125em 0.375em;
    font-family: var(--font-mono);
    font-size: 0.85em;
    color: var(--text-primary);
    background-color: var(--bg-surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
  }

  /* Blockquotes. */
  .prose :global(blockquote) {
    margin: 0 0 0.75em;
    padding: 0.25em 0 0.25em 1em;
    border-left: 3px solid var(--border-strong);
    color: var(--text-secondary);
  }
  .prose :global(blockquote p) {
    margin-bottom: 0.5em;
  }

  /* GFM tables. */
  .prose :global(table) {
    width: max-content;
    max-width: 100%;
    margin: 0 0 0.875em;
    border-collapse: collapse;
    font-size: 0.875rem;
  }
  .prose :global(th),
  .prose :global(td) {
    padding: 0.4em 0.75em;
    border: 1px solid var(--border);
    text-align: left;
  }
  .prose :global(th) {
    font-weight: 600;
    background-color: var(--bg-surface);
    color: var(--text-primary);
  }
  .prose :global(tbody tr:nth-child(even)) {
    background-color: var(--bg-elevated);
  }

  .prose :global(hr) {
    margin: 1.25em 0;
    border: none;
    border-top: 1px solid var(--border);
  }

  .prose :global(img) {
    max-width: 100%;
    height: auto;
    border-radius: var(--radius-sm);
  }
</style>
