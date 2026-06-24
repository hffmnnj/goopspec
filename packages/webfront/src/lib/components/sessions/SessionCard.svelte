<script lang="ts">
  import { tick } from 'svelte';
  import { HugeiconsIcon } from '@hugeicons/svelte';
  import {
    PencilEdit01Icon,
    Delete02Icon,
    GitCompareIcon,
    MessageMultiple01Icon,
    Coins01Icon,
    Tick02Icon,
    Cancel01Icon,
  } from '@hugeicons/core-free-icons';
  import type { Session } from '$lib/api/types.js';
  import {
    relativeTime,
    absoluteTime,
    sessionTitle,
    sessionMeta,
    previewText,
    resolveRename,
    ariaCurrent,
    type SessionWithPreview,
  } from './session-card.js';

  interface SessionCardProps {
    session: Session & SessionWithPreview;
    active?: boolean;
    onselect?: (id: string) => void;
    onrename?: (id: string, title: string) => void;
    ondelete?: (id: string) => void;
    onviewdiff?: (id: string) => void;
  }

  let {
    session,
    active = false,
    onselect,
    onrename,
    ondelete,
    onviewdiff,
  }: SessionCardProps = $props();

  const ICON = 13;
  const STROKE = 1.5;

  let editing = $state(false);
  let confirmingDelete = $state(false);
  let draft = $state('');
  let inputEl = $state<HTMLInputElement | null>(null);

  const title = $derived(sessionTitle(session));
  const meta = $derived(sessionMeta(session));
  const preview = $derived(previewText(session));
  const stamp = $derived(relativeTime(session.updatedAt));
  const stampFull = $derived(absoluteTime(session.updatedAt));

  function select(): void {
    if (editing) return;
    onselect?.(session.id);
  }

  function onRowKeydown(event: KeyboardEvent): void {
    if (editing) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      select();
    }
  }

  async function startRename(event?: Event): Promise<void> {
    event?.stopPropagation();
    confirmingDelete = false;
    draft = title;
    editing = true;
    await tick();
    inputEl?.focus();
    inputEl?.select();
  }

  function commitRename(): void {
    const next = resolveRename(draft, title);
    if (next) onrename?.(session.id, next);
    editing = false;
  }

  function cancelRename(): void {
    editing = false;
  }

  function onInputKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      commitRename();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      cancelRename();
    }
  }

  function askDelete(event?: Event): void {
    event?.stopPropagation();
    confirmingDelete = true;
  }

  function confirmDelete(event?: Event): void {
    event?.stopPropagation();
    confirmingDelete = false;
    ondelete?.(session.id);
  }

  function cancelDelete(event?: Event): void {
    event?.stopPropagation();
    confirmingDelete = false;
  }

  function viewDiff(event?: Event): void {
    event?.stopPropagation();
    onviewdiff?.(session.id);
  }
</script>

<div
  class="session-card"
  class:session-card--active={active}
  class:session-card--editing={editing}
  role="option"
  tabindex={editing ? -1 : 0}
  aria-selected={active}
  aria-current={ariaCurrent(active)}
  aria-label={`Session: ${title}`}
  onclick={select}
  onkeydown={onRowKeydown}
  ondblclick={startRename}
>
  <span class="accent-rail" aria-hidden="true"></span>

  <div class="body">
    <div class="top">
      {#if editing}
        <input
          bind:this={inputEl}
          bind:value={draft}
          class="rename-input"
          type="text"
          aria-label="Rename session"
          onkeydown={onInputKeydown}
          onblur={commitRename}
          onclick={(e) => e.stopPropagation()}
        />
      {:else}
        <span class="title" title={title}>{title}</span>
        <time class="stamp" datetime={session.updatedAt} title={stampFull}>{stamp}</time>
      {/if}
    </div>

    {#if preview}
      <p class="preview">{preview}</p>
    {/if}

    {#if meta.hasMessages || meta.hasCost}
      <div class="meta" aria-hidden={false}>
        {#if meta.hasMessages}
          <span class="chip" title={`${meta.messages} messages`}>
            <HugeiconsIcon icon={MessageMultiple01Icon} size={ICON} strokeWidth={STROKE} color="currentColor" />
            {meta.messages}
          </span>
        {/if}
        {#if meta.hasCost}
          <span class="chip" title={`Cost: ${meta.cost}`}>
            <HugeiconsIcon icon={Coins01Icon} size={ICON} strokeWidth={STROKE} color="currentColor" />
            {meta.cost}
          </span>
        {/if}
      </div>
    {/if}
  </div>

  {#if !editing}
    {#if confirmingDelete}
      <div class="confirm" role="group" aria-label="Confirm delete">
        <button
          type="button"
          class="icon-btn icon-btn--danger"
          aria-label="Confirm delete session"
          title="Delete"
          onclick={confirmDelete}
        >
          <HugeiconsIcon icon={Tick02Icon} size={15} strokeWidth={STROKE} color="currentColor" />
        </button>
        <button
          type="button"
          class="icon-btn"
          aria-label="Cancel delete"
          title="Cancel"
          onclick={cancelDelete}
        >
          <HugeiconsIcon icon={Cancel01Icon} size={15} strokeWidth={STROKE} color="currentColor" />
        </button>
      </div>
    {:else}
      <div class="actions">
        <button
          type="button"
          class="icon-btn"
          aria-label="View session diff"
          title="View diff"
          onclick={viewDiff}
        >
          <HugeiconsIcon icon={GitCompareIcon} size={15} strokeWidth={STROKE} color="currentColor" />
        </button>
        <button
          type="button"
          class="icon-btn"
          aria-label="Rename session"
          title="Rename"
          onclick={startRename}
        >
          <HugeiconsIcon icon={PencilEdit01Icon} size={15} strokeWidth={STROKE} color="currentColor" />
        </button>
        <button
          type="button"
          class="icon-btn icon-btn--danger"
          aria-label="Delete session"
          title="Delete"
          onclick={askDelete}
        >
          <HugeiconsIcon icon={Delete02Icon} size={15} strokeWidth={STROKE} color="currentColor" />
        </button>
      </div>
    {/if}
  {/if}
</div>

<style>
  .session-card {
    position: relative;
    display: flex;
    align-items: stretch;
    gap: 0.5rem;
    padding: 0.625rem 0.625rem 0.625rem 0.75rem;
    border: 1px solid transparent;
    border-radius: var(--radius);
    background: transparent;
    cursor: pointer;
    user-select: none;
    transition:
      background-color var(--transition-fast),
      border-color var(--transition-fast);
  }

  .session-card:hover {
    background-color: var(--bg-surface);
  }

  .session-card:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: 2px;
  }

  .session-card--active {
    background-color: var(--accent-soft);
    border-color: var(--border);
  }

  .session-card--active:hover {
    background-color: var(--accent-soft);
  }

  /* Accent left-rail: a clear active marker, animated in on selection. */
  .accent-rail {
    position: absolute;
    left: 0;
    top: 0.5rem;
    bottom: 0.5rem;
    width: 3px;
    border-radius: var(--radius-full);
    background-color: var(--accent);
    opacity: 0;
    transform: scaleY(0.4);
    transform-origin: center;
    transition:
      opacity var(--transition-base),
      transform var(--transition-base);
  }

  .session-card--active .accent-rail {
    opacity: 1;
    transform: scaleY(1);
  }

  .body {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .top {
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
  }

  .title {
    flex: 1 1 auto;
    min-width: 0;
    font-size: 0.8125rem;
    font-weight: 500;
    line-height: 1.3;
    color: var(--text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .stamp {
    flex: 0 0 auto;
    font-size: 0.6875rem;
    line-height: 1.3;
    color: var(--text-muted);
    font-variant-numeric: tabular-nums;
  }

  .rename-input {
    flex: 1 1 auto;
    min-width: 0;
    margin: -0.125rem 0;
    padding: 0.125rem 0.375rem;
    font: inherit;
    font-size: 0.8125rem;
    font-weight: 500;
    color: var(--text-primary);
    background-color: var(--bg-base);
    border: 1px solid var(--focus-ring);
    border-radius: var(--radius-sm);
    outline: none;
  }

  .preview {
    margin: 0;
    font-size: 0.75rem;
    line-height: 1.4;
    color: var(--text-secondary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .meta {
    display: flex;
    align-items: center;
    gap: 0.625rem;
    margin-top: 0.0625rem;
  }

  .chip {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    font-size: 0.6875rem;
    color: var(--text-muted);
    font-variant-numeric: tabular-nums;
  }

  .actions,
  .confirm {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    gap: 0.125rem;
    align-self: flex-start;
  }

  /* Actions hide by default and reveal on hover OR keyboard focus within the
   * card — never hover-only, so keyboard users can reach rename/delete. */
  .actions {
    opacity: 0;
    transition: opacity var(--transition-fast);
  }

  .session-card:hover .actions,
  .session-card:focus-within .actions {
    opacity: 1;
  }

  .icon-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.625rem;
    height: 1.625rem;
    padding: 0;
    border: none;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
    transition:
      background-color var(--transition-fast),
      color var(--transition-fast);
  }

  .icon-btn:hover {
    background-color: var(--bg-elevated);
    color: var(--text-primary);
  }

  .icon-btn:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: 1px;
    opacity: 1;
  }

  .icon-btn--danger:hover {
    color: var(--danger-text);
    background-color: rgba(239, 68, 68, 0.12);
  }

  @media (prefers-reduced-motion: reduce) {
    .accent-rail,
    .actions,
    .session-card,
    .icon-btn {
      transition: none;
    }
  }
</style>
