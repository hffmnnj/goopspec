<script lang="ts">
  import { HugeiconsIcon } from '@hugeicons/svelte';
  import { ArrowDown01Icon, ArrowRight01Icon, FileEditIcon, Alert02Icon } from '@hugeicons/core-free-icons';
  import { createClient } from '$lib/api/client.js';
  import type { FileDiff, OpenCodeClient } from '$lib/api/types.js';
  import DiffView from '../chat/DiffView.svelte';
  import {
    fileKey,
    fileName,
    startsExpanded,
    statLabel,
    toggleLabel,
    toUnifiedDiff,
  } from './session-diff-panel.js';

  interface SessionDiffPanelProps {
    /** Session whose file changes to show; null shows the idle empty state. */
    sessionId: string | null;
    /** Override the API client (defaults to the configured adapter). */
    client?: Pick<OpenCodeClient, 'getSessionDiff'>;
  }

  let { sessionId, client = createClient() }: SessionDiffPanelProps = $props();

  let diffs = $state<FileDiff[]>([]);
  let loading = $state(false);
  let error = $state<string | null>(null);
  let expanded = $state<Set<string>>(new Set());

  const isEmpty = $derived(!loading && !error && diffs.length === 0);

  $effect(() => {
    const id = sessionId;
    if (!id) {
      diffs = [];
      error = null;
      loading = false;
      return;
    }
    void load(id);
  });

  async function load(id: string): Promise<void> {
    loading = true;
    error = null;
    try {
      const result = await client.getSessionDiff(id);
      if (sessionId !== id) return;
      diffs = result;
      const autoExpand = startsExpanded(result.length);
      expanded = new Set(autoExpand ? result.map((d, i) => fileKey(d, i)) : []);
    } catch (err) {
      if (sessionId !== id) return;
      error = err instanceof Error ? err.message : 'Failed to load diff';
      diffs = [];
    } finally {
      if (sessionId === id) loading = false;
    }
  }

  function toggle(key: string): void {
    const next = new Set(expanded);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    expanded = next;
  }
</script>

<div class="diff-panel" aria-label="Session file changes">
  {#if loading}
    <div class="state" aria-busy="true" aria-label="Loading diff">
      <div class="sk-line"></div>
      <div class="sk-line sk-short"></div>
    </div>
  {:else if error}
    <div class="state state--error" role="alert">
      <span class="state-icon" aria-hidden="true">
        <HugeiconsIcon icon={Alert02Icon} size={20} strokeWidth={1.5} color="currentColor" />
      </span>
      <p class="state-title">Couldn't load diff</p>
      <p class="state-detail">{error}</p>
    </div>
  {:else if isEmpty}
    <div class="state">
      <span class="state-icon" aria-hidden="true">
        <HugeiconsIcon icon={FileEditIcon} size={20} strokeWidth={1.5} color="currentColor" />
      </span>
      <p class="state-title">No file changes yet</p>
    </div>
  {:else}
    <ul class="file-list" role="list">
      {#each diffs as diff, i (fileKey(diff, i))}
        {@const key = fileKey(diff, i)}
        {@const open = expanded.has(key)}
        <li class="file">
          <button
            type="button"
            class="file-head"
            aria-expanded={open}
            aria-label={toggleLabel(diff.file, open)}
            onclick={() => toggle(key)}
          >
            <span class="file-chevron" aria-hidden="true">
              <HugeiconsIcon
                icon={open ? ArrowDown01Icon : ArrowRight01Icon}
                size={14}
                strokeWidth={1.8}
                color="currentColor"
              />
            </span>
            <span class="file-name" title={diff.file}>{fileName(diff.file)}</span>
            <span class="file-stat" aria-hidden="true">{statLabel(diff)}</span>
          </button>
          {#if open}
            <div class="file-body">
              <DiffView diff={toUnifiedDiff(diff)} tool={diff.file} />
            </div>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .diff-panel {
    display: flex;
    flex-direction: column;
    min-height: 0;
    width: 100%;
  }

  .state {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: 0.375rem;
    padding: 2rem 1rem;
    color: var(--text-secondary);
  }

  .state-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 2.5rem;
    height: 2.5rem;
    border-radius: var(--radius-full);
    background-color: var(--bg-surface);
    color: var(--text-muted);
  }

  .state--error .state-icon {
    color: var(--danger-text);
    background-color: rgba(239, 68, 68, 0.1);
  }

  .state-title {
    margin: 0;
    font-size: 0.8125rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .state-detail {
    margin: 0;
    font-size: 0.75rem;
    line-height: 1.4;
    color: var(--text-muted);
    max-width: 22rem;
  }

  .sk-line {
    height: 0.75rem;
    width: 60%;
    margin: 0.25rem auto;
    border-radius: var(--radius-full);
    background: linear-gradient(
      90deg,
      var(--bg-surface) 25%,
      var(--bg-elevated) 50%,
      var(--bg-surface) 75%
    );
    background-size: 200% 100%;
    animation: diff-shimmer 1.4s ease-in-out infinite;
  }

  .sk-short {
    width: 40%;
  }

  @keyframes diff-shimmer {
    from {
      background-position: 200% 0;
    }
    to {
      background-position: -200% 0;
    }
  }

  .file-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .file {
    border: 1px solid var(--border);
    border-radius: var(--radius);
    overflow: hidden;
    background-color: var(--bg-elevated);
  }

  .file-head {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    padding: 0.5rem 0.625rem;
    border: none;
    background-color: var(--bg-surface);
    color: var(--text-primary);
    cursor: pointer;
    text-align: left;
    transition: background-color var(--transition-fast);
  }

  .file-head:hover {
    background-color: var(--bg-elevated);
  }

  .file-head:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: -2px;
  }

  .file-chevron {
    display: inline-flex;
    flex: 0 0 auto;
    color: var(--text-secondary);
  }

  .file-name {
    flex: 1 1 auto;
    min-width: 0;
    font-family: var(--font-mono);
    font-size: 0.75rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .file-stat {
    flex: 0 0 auto;
    font-family: var(--font-mono);
    font-size: 0.6875rem;
    font-weight: 600;
    color: var(--text-muted);
  }

  .file-body {
    padding: 0.5rem;
  }

  @media (prefers-reduced-motion: reduce) {
    .sk-line {
      animation: none;
    }
    .file-head {
      transition: none;
    }
  }
</style>
