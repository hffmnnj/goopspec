<script lang="ts">
  import { tick } from 'svelte';
  import { HugeiconsIcon } from '@hugeicons/svelte';
  import { ArrowDown01Icon, UserIcon, AiBrain01Icon } from '@hugeicons/core-free-icons';
  import type { Message } from '$lib/api/types.js';
  import { groupParts } from '$lib/api/messages.js';
  import Markdown from './Markdown.svelte';
  import ToolCard from './ToolCard.svelte';

  interface MessageListProps {
    messages: Message[];
    /** True while the latest assistant message is still streaming. */
    streaming?: boolean;
  }

  let { messages, streaming = false }: MessageListProps = $props();

  let viewport = $state<HTMLDivElement | null>(null);
  let atBottom = $state(true);
  /** Pixels of slack before we consider the user "scrolled up". */
  const BOTTOM_THRESHOLD = 64;

  const showJumpButton = $derived(!atBottom && messages.length > 0);

  function isNearBottom(el: HTMLDivElement): boolean {
    return el.scrollHeight - el.scrollTop - el.clientHeight <= BOTTOM_THRESHOLD;
  }

  function handleScroll(): void {
    if (!viewport) return;
    atBottom = isNearBottom(viewport);
  }

  function scrollToBottom(behavior: ScrollBehavior = 'smooth'): void {
    if (!viewport) return;
    viewport.scrollTo({ top: viewport.scrollHeight, behavior });
  }

  // Auto-follow new content only when the user is already pinned to the bottom,
  // so reading scrollback is never yanked away.
  $effect(() => {
    // Touch reactive deps so the effect re-runs on new messages / stream ticks.
    void messages.length;
    void streaming;
    if (!atBottom) return;
    tick().then(() => scrollToBottom('smooth'));
  });
</script>

<div class="message-list" bind:this={viewport} onscroll={handleScroll}>
  <div class="messages">
    {#each messages as message (message.id)}
      <article class="row row--{message.role}" aria-label={`${message.role} message`}>
        <div class="avatar" aria-hidden="true">
          {#if message.role === 'user'}
            <HugeiconsIcon icon={UserIcon} size={16} strokeWidth={1.5} color="currentColor" />
          {:else}
            <HugeiconsIcon icon={AiBrain01Icon} size={16} strokeWidth={1.5} color="currentColor" />
          {/if}
        </div>

        <div class="bubble">
          {#each groupParts(message.parts) as group, index (index)}
            {#if group.kind === 'text'}
              <Markdown text={group.text} />
            {:else if group.kind === 'tool'}
              <ToolCard invoke={group.invoke} result={group.result} />
            {/if}
          {/each}

          {#if streaming && message.role === 'assistant' && message === messages[messages.length - 1]}
            <span class="cursor" aria-hidden="true">
              <span class="dot"></span>
              <span class="dot"></span>
              <span class="dot"></span>
            </span>
          {/if}
        </div>
      </article>
    {/each}
  </div>
</div>

{#if showJumpButton}
  <button
    type="button"
    class="jump"
    aria-label="Jump to latest message"
    title="Jump to latest"
    onclick={() => scrollToBottom('smooth')}
  >
    <HugeiconsIcon icon={ArrowDown01Icon} size={18} strokeWidth={1.5} color="currentColor" />
  </button>
{/if}

<style>
  .message-list {
    position: relative;
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    scroll-behavior: smooth;
    padding: 1.5rem 1rem;
  }

  .messages {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
    max-width: 48rem;
    margin: 0 auto;
  }

  .row {
    display: grid;
    grid-template-columns: 1.75rem 1fr;
    gap: 0.75rem;
    align-items: start;
  }

  .avatar {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.75rem;
    height: 1.75rem;
    border-radius: var(--radius-full);
    border: 1px solid var(--border);
    color: var(--text-secondary);
    background-color: var(--bg-elevated);
  }

  .row--user .avatar {
    color: var(--accent-foreground);
    background-color: var(--accent);
    border-color: transparent;
  }

  .bubble {
    min-width: 0;
    padding-top: 0.125rem;
    color: var(--text-primary);
    font-size: 0.9375rem;
    line-height: 1.65;
  }

  .row--user .bubble {
    color: var(--text-secondary);
  }

  .cursor {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    margin-left: 0.125rem;
    vertical-align: middle;
  }

  .cursor .dot {
    width: 0.375rem;
    height: 0.375rem;
    border-radius: var(--radius-full);
    background-color: var(--text-muted);
    animation: blink 1.4s ease-in-out infinite;
  }

  .cursor .dot:nth-child(2) {
    animation-delay: 0.2s;
  }

  .cursor .dot:nth-child(3) {
    animation-delay: 0.4s;
  }

  .jump {
    position: absolute;
    bottom: 1.25rem;
    left: 50%;
    transform: translateX(-50%);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 2.25rem;
    height: 2.25rem;
    border-radius: var(--radius-full);
    border: 1px solid var(--border-strong);
    background-color: var(--bg-elevated);
    color: var(--text-primary);
    cursor: pointer;
    box-shadow: var(--shadow-md);
    transition:
      transform var(--transition-fast),
      background-color var(--transition-fast);
  }

  .jump:hover {
    background-color: var(--bg-surface);
    transform: translateX(-50%) translateY(-1px);
  }

  .jump:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  @keyframes blink {
    0%,
    60%,
    100% {
      opacity: 0.25;
    }
    30% {
      opacity: 1;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .message-list {
      scroll-behavior: auto;
    }
    .cursor .dot {
      animation: none;
      opacity: 0.6;
    }
    .jump:hover {
      transform: translateX(-50%);
    }
  }
</style>
