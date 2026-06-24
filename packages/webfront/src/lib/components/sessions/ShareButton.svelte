<script lang="ts">
  import { HugeiconsIcon } from '@hugeicons/svelte';
  import {
    Share08Icon,
    Copy01Icon,
    Download04Icon,
    Tick02Icon,
  } from '@hugeicons/core-free-icons';
  import { chat } from '$lib/stores/chat.svelte.js';
  import {
    exportConversationToMarkdown,
    copyToClipboard,
    downloadMarkdown,
    exportFilename,
  } from '$lib/sessions/export.js';

  interface ShareButtonProps {
    /** Optional session title (falls back to chat active session display). */
    title?: string;
    /** Optional session id for the download filename. */
    sessionId?: string | null;
    /** Read messages from somewhere other than the default chat store. */
    messages?: import('$lib/api/types.js').Message[];
    /** ARIA label for the trigger button. */
    label?: string;
  }

  let {
    title,
    sessionId = chat.activeSessionId,
    messages = chat.messages,
    label = 'Share conversation',
  }: ShareButtonProps = $props();

  const FEEDBACK_DURATION_MS = 2000;

  let open = $state(false);
  let copied = $state(false);
  let downloading = $state(false);
  let feedbackTimer: ReturnType<typeof setTimeout> | null = null;
  let buttonEl = $state<HTMLButtonElement | null>(null);

  const hasMessages = $derived(messages.length > 0);
  const filename = $derived(exportFilename(sessionId, title));
  const displayTitle = $derived(title?.trim() || 'Conversation');
  const currentIcon = $derived(copied ? Tick02Icon : Share08Icon);
  const currentLabel = $derived(copied ? 'Copied to clipboard' : label);

  function clearFeedback(): void {
    if (feedbackTimer) {
      clearTimeout(feedbackTimer);
      feedbackTimer = null;
    }
  }

  function showCopiedFeedback(): void {
    clearFeedback();
    copied = true;
    open = false;
    feedbackTimer = setTimeout(() => {
      copied = false;
    }, FEEDBACK_DURATION_MS);
  }

  async function handleCopy(): Promise<void> {
    if (!hasMessages) return;
    const markdown = exportConversationToMarkdown(messages, { title: displayTitle });
    try {
      await copyToClipboard(markdown);
      showCopiedFeedback();
    } catch {
      // Fail silently in the UI; a future toast system (T10.1) can surface this.
      open = false;
    }
  }

  function handleDownload(): void {
    if (!hasMessages) return;
    const markdown = exportConversationToMarkdown(messages, { title: displayTitle });
    downloading = true;
    downloadMarkdown(markdown, filename);
    open = false;
    setTimeout(() => {
      downloading = false;
    }, 300);
  }

  function toggleMenu(): void {
    if (!hasMessages) return;
    open = !open;
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && open) {
      event.preventDefault();
      open = false;
      buttonEl?.focus();
    }
  }

  function clickOutside(node: HTMLElement): { destroy: () => void } {
    const handler = (event: MouseEvent) => {
      if (!node.contains(event.target as Node)) {
        open = false;
      }
    };
    document.addEventListener('mousedown', handler, true);
    return {
      destroy() {
        document.removeEventListener('mousedown', handler, true);
      },
    };
  }
</script>

<div class="share" role="group" aria-label={label} use:clickOutside>
  <button
    bind:this={buttonEl}
    type="button"
    class="share-btn"
    class:share-btn--success={copied}
    aria-label={currentLabel}
    title={currentLabel}
    disabled={!hasMessages}
    onclick={toggleMenu}
    onkeydown={handleKeydown}
  >
    <HugeiconsIcon icon={currentIcon} size={16} strokeWidth={1.5} color="currentColor" />
    <span class="share-label" aria-live="polite" aria-atomic="true">
      {#if copied}Copied{:else}Share{/if}
    </span>
  </button>

  {#if open && hasMessages}
    <div class="menu" role="menu" aria-label="Export options">
      <button
        type="button"
        class="menu-item"
        role="menuitem"
        onclick={handleCopy}
        disabled={copied}
      >
        <HugeiconsIcon icon={Copy01Icon} size={15} strokeWidth={1.5} color="currentColor" />
        <span>Copy as Markdown</span>
      </button>
      <button
        type="button"
        class="menu-item"
        role="menuitem"
        onclick={handleDownload}
        disabled={downloading}
      >
        <HugeiconsIcon icon={Download04Icon} size={15} strokeWidth={1.5} color="currentColor" />
        <span>Download .md</span>
      </button>
    </div>
  {/if}
</div>

<style>
  .share {
    position: relative;
    display: inline-flex;
    align-items: center;
  }

  .share-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.375rem 0.625rem;
    font-size: 0.75rem;
    font-weight: 500;
    color: var(--text-secondary);
    background-color: var(--bg-elevated);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition:
      background-color var(--transition-fast),
      border-color var(--transition-fast),
      color var(--transition-fast);
  }

  .share-btn:hover:not(:disabled) {
    color: var(--accent);
    background-color: var(--bg-surface);
    border-color: var(--border-strong);
  }

  .share-btn:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .share-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .share-btn--success {
    color: var(--accent);
  }

  .share-label {
    min-width: 2.75rem;
  }

  .menu {
    position: absolute;
    top: calc(100% + 0.375rem);
    right: 0;
    z-index: 50;
    display: flex;
    flex-direction: column;
    min-width: 10rem;
    padding: 0.25rem;
    background-color: var(--bg-elevated);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    box-shadow: var(--shadow-md);
  }

  .menu-item {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    padding: 0.5rem 0.625rem;
    font-size: 0.75rem;
    font-weight: 500;
    color: var(--text-secondary);
    background: transparent;
    border: none;
    border-radius: var(--radius-sm);
    cursor: pointer;
    text-align: left;
    transition:
      background-color var(--transition-fast),
      color var(--transition-fast);
  }

  .menu-item:hover:not(:disabled) {
    background-color: var(--bg-surface);
    color: var(--text-primary);
  }

  .menu-item:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
  }

  .menu-item:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  @media (prefers-reduced-motion: reduce) {
    .share-btn,
    .menu-item {
      transition: none;
    }
  }
</style>
