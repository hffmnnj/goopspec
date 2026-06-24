<script lang="ts">
  import { HugeiconsIcon } from '@hugeicons/svelte';
  import { FileEditIcon } from '@hugeicons/core-free-icons';
  import { parseUnifiedDiff, type DiffLine } from '$lib/diff/parse.js';

  interface DiffViewProps {
    /** Raw unified-diff text from an edit/write tool result. */
    diff: string;
    /** Originating tool name — used only for the accessible label. */
    tool?: string;
  }

  let { diff, tool }: DiffViewProps = $props();

  const parsed = $derived(parseUnifiedDiff(diff));
  const path = $derived(parsed.newPath ?? parsed.oldPath ?? tool ?? 'diff');

  // Flatten hunks into a render list, inserting a separator row between hunks
  // so the gutters read continuously while still marking discontinuities.
  interface Row {
    kind: 'sep' | DiffLine['type'];
    content: string;
    oldNo?: number;
    newNo?: number;
    key: string;
  }

  const rows = $derived.by<Row[]>(() => {
    const out: Row[] = [];
    parsed.hunks.forEach((hunk, h) => {
      if (h > 0) out.push({ kind: 'sep', content: '⋯', key: `sep-${h}` });
      hunk.lines.forEach((line, i) => {
        out.push({
          kind: line.type,
          content: line.content,
          oldNo: line.oldLineNo,
          newNo: line.newLineNo,
          key: `${h}-${i}`,
        });
      });
    });
    return out;
  });

  // Collapse very large diffs behind a toggle to keep transcripts dense.
  const COLLAPSE_THRESHOLD = 40;
  let expanded = $state(false);
  const isLong = $derived(rows.length > COLLAPSE_THRESHOLD);
  const visibleRows = $derived(isLong && !expanded ? rows.slice(0, COLLAPSE_THRESHOLD) : rows);
  const hiddenCount = $derived(rows.length - COLLAPSE_THRESHOLD);

  const SYMBOL: Record<Row['kind'], string> = {
    add: '+',
    remove: '−',
    context: ' ',
    header: '',
    sep: '',
  };

  const summaryLabel = $derived(
    `${parsed.additions} addition${parsed.additions === 1 ? '' : 's'}, ` +
      `${parsed.deletions} deletion${parsed.deletions === 1 ? '' : 's'} in ${path}`
  );
</script>

{#if rows.length === 0}
  <pre class="diff-empty">{diff}</pre>
{:else}
  <figure class="diff" aria-label={`Diff: ${summaryLabel}`}>
    <figcaption class="diff-head">
      <span class="diff-file">
        <span class="diff-file-icon" aria-hidden="true">
          <HugeiconsIcon icon={FileEditIcon} size={14} strokeWidth={1.8} color="currentColor" />
        </span>
        <span class="diff-path" title={path}>{path}</span>
      </span>
      <span class="diff-stat" aria-hidden="true">
        <span class="diff-add">+{parsed.additions}</span>
        <span class="diff-del">−{parsed.deletions}</span>
      </span>
    </figcaption>

    <div class="diff-scroll" role="table" aria-label={summaryLabel}>
      {#each visibleRows as row (row.key)}
        {#if row.kind === 'sep'}
          <div class="diff-row diff-row--sep" role="presentation">
            <span class="gutter gutter--old"></span>
            <span class="gutter gutter--new"></span>
            <span class="diff-sign" aria-hidden="true"></span>
            <span class="diff-code">{row.content}</span>
          </div>
        {:else}
          <div class="diff-row diff-row--{row.kind}" role="row">
            <span class="gutter gutter--old" role="cell" aria-hidden={row.oldNo == null}>
              {row.oldNo ?? ''}
            </span>
            <span class="gutter gutter--new" role="cell" aria-hidden={row.newNo == null}>
              {row.newNo ?? ''}
            </span>
            <span class="diff-sign" aria-hidden="true">{SYMBOL[row.kind]}</span>
            <span class="diff-code" role="cell">{row.content || ' '}</span>
          </div>
        {/if}
      {/each}
    </div>

    {#if isLong}
      <button type="button" class="diff-more" onclick={() => (expanded = !expanded)}>
        {expanded ? 'Collapse diff' : `Show ${hiddenCount} more lines`}
      </button>
    {/if}
  </figure>
{/if}

<style>
  .diff {
    margin: 0;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    overflow: hidden;
    background-color: var(--bg-elevated);
  }

  .diff-empty {
    margin: 0;
    padding: 0.75rem;
    font-family: var(--font-mono);
    font-size: 0.8125rem;
    line-height: 1.6;
    color: var(--text-primary);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    background-color: var(--bg-base);
    border-radius: var(--radius-sm);
  }

  .diff-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.4375rem 0.625rem 0.4375rem 0.75rem;
    border-bottom: 1px solid var(--border);
    background-color: var(--bg-surface);
  }

  .diff-file {
    display: inline-flex;
    align-items: center;
    gap: 0.4375rem;
    min-width: 0;
  }

  .diff-file-icon {
    display: inline-flex;
    color: var(--text-secondary);
    flex-shrink: 0;
  }

  .diff-path {
    font-family: var(--font-mono);
    font-size: 0.75rem;
    color: var(--text-secondary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    direction: rtl; /* keep the filename visible when the path overflows */
    text-align: left;
  }

  .diff-stat {
    display: inline-flex;
    gap: 0.5rem;
    font-family: var(--font-mono);
    font-size: 0.75rem;
    font-weight: 600;
    flex-shrink: 0;
  }

  .diff-add {
    color: var(--diff-add-fg);
  }
  .diff-del {
    color: var(--diff-remove-fg);
  }

  .diff-scroll {
    overflow-x: auto;
    font-family: var(--font-mono);
    font-size: 0.8125rem;
    line-height: 1.55;
  }

  .diff-row {
    display: grid;
    grid-template-columns: auto auto auto 1fr;
    align-items: baseline;
    min-width: max-content;
  }

  .gutter {
    padding: 0 0.5rem;
    text-align: right;
    color: var(--text-muted);
    background-color: var(--bg-surface);
    user-select: none;
    -webkit-user-select: none;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .gutter--new {
    border-right: 1px solid var(--border);
  }

  .diff-sign {
    width: 1.25rem;
    padding-left: 0.5rem;
    text-align: center;
    color: var(--text-muted);
    user-select: none;
    -webkit-user-select: none;
  }

  .diff-code {
    padding-right: 0.75rem;
    white-space: pre;
    color: var(--text-primary);
    overflow-wrap: normal;
  }

  /* Added lines — green-tinted, harmonizing with the brand accent. */
  .diff-row--add .diff-code,
  .diff-row--add .diff-sign {
    color: var(--diff-add-fg);
  }
  .diff-row--add .diff-code,
  .diff-row--add .gutter {
    background-color: var(--diff-add-bg);
  }

  /* Removed lines — red-tinted. */
  .diff-row--remove .diff-code,
  .diff-row--remove .diff-sign {
    color: var(--diff-remove-fg);
  }
  .diff-row--remove .diff-code,
  .diff-row--remove .gutter {
    background-color: var(--diff-remove-bg);
  }

  .diff-row--header .diff-code {
    color: var(--text-muted);
    font-style: italic;
  }

  .diff-row--sep .diff-code {
    color: var(--text-muted);
    background-color: var(--bg-surface);
    text-align: center;
    letter-spacing: 0.2em;
  }
  .diff-row--sep .gutter {
    color: transparent;
  }

  .diff-more {
    display: block;
    width: 100%;
    padding: 0.375rem 0.75rem;
    font-size: 0.75rem;
    font-weight: 500;
    color: var(--text-secondary);
    background-color: var(--bg-surface);
    border: none;
    border-top: 1px solid var(--border);
    cursor: pointer;
    transition: color var(--transition-fast), background-color var(--transition-fast);
  }

  .diff-more:hover {
    color: var(--text-primary);
    background-color: var(--bg-elevated);
  }

  .diff-more:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: -2px;
  }

  @media (prefers-reduced-motion: reduce) {
    .diff-more {
      transition: none;
    }
  }
</style>
