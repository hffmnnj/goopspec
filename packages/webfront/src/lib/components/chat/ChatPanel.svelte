<script lang="ts">
  import { MessageAdd01Icon } from '@hugeicons/core-free-icons';
  import { chat as defaultChat, type ChatStore } from '$lib/stores/chat.svelte.js';
  import { createClient } from '$lib/api/client.js';
  import type { OpenCodeClient } from '$lib/api/types.js';
  import MessageList from './MessageList.svelte';
  import MessageInput from './MessageInput.svelte';
  import ModelSwitcher from '$lib/components/ModelSwitcher.svelte';
  import ShareButton from '$lib/components/sessions/ShareButton.svelte';
  import EmptyState from '$lib/components/states/EmptyState.svelte';
  import ErrorState from '$lib/components/states/ErrorState.svelte';

  interface ChatPanelProps {
    /** Chat store to bind to; defaults to the shared singleton. */
    chat?: ChatStore;
    /** Session title shown in the header. */
    title?: string;
    /** Disable input (e.g. disconnected from the server). */
    disabled?: boolean;
    /** Interrupt handler — wired to the streaming reducer by T3.2 / Wave 8. */
    onstop?: () => void;
    /** Override the OpenCode client used by the model switcher. */
    client?: OpenCodeClient;
    /** Text to append to the message composer, e.g. a selected file mention. */
    composerInsertText?: string;
    /** Monotonic signal for composerInsertText. */
    composerInsertNonce?: number;
  }

  let {
    chat = defaultChat,
    title = 'New conversation',
    disabled = false,
    onstop,
    client,
    composerInsertText,
    composerInsertNonce = 0,
  }: ChatPanelProps = $props();

  const switcherClient = $derived(client ?? createClient());

  const isEmpty = $derived(!chat.loading && chat.messages.length === 0);

  function handleSend(text: string): void {
    void chat.sendMessage(text);
  }
</script>

<section class="chat-panel" aria-label="Conversation">
  <header class="chat-header">
    <h1 class="chat-title">{title}</h1>
    <div class="header-slot">
      <ShareButton
        {title}
        sessionId={chat.activeSessionId}
        messages={chat.messages}
      />
      <ModelSwitcher client={switcherClient} />
    </div>
  </header>

  {#if chat.error}
    <div class="chat-error-region">
      <ErrorState
        inline
        title="Message failed"
        message={chat.error}
      />
    </div>
  {/if}

  <div class="chat-body">
    {#if chat.loading}
      <div class="skeleton" aria-busy="true" aria-label="Loading conversation">
        {#each Array(4) as _, index (index)}
          <div class="skeleton-row" class:assistant={index % 2 === 1}>
            <span class="skeleton-avatar"></span>
            <span class="skeleton-lines">
              <span class="skeleton-line" style:width="72%"></span>
              <span class="skeleton-line" style:width="48%"></span>
            </span>
          </div>
        {/each}
      </div>
    {:else if isEmpty}
      <div class="empty-wrap">
        <EmptyState
          icon={MessageAdd01Icon}
          iconSize={28}
          title="Start a conversation"
          description="Send a message to begin a new conversation."
        />
      </div>
    {:else}
      <MessageList messages={chat.messages} streaming={chat.streaming} />
    {/if}
  </div>

  <footer class="chat-footer">
    <MessageInput
      onsend={handleSend}
      {onstop}
      streaming={chat.streaming}
      disabled={disabled || chat.loading}
      insertText={composerInsertText}
      insertNonce={composerInsertNonce}
    />
  </footer>
</section>

<style>
  .chat-panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    background-color: var(--bg-base);
  }

  .chat-header {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 0.875rem 1.25rem;
    border-bottom: 1px solid var(--border);
  }

  .chat-title {
    margin: 0;
    font-size: 0.9375rem;
    font-weight: 600;
    color: var(--text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .header-slot {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .chat-error-region {
    margin: 0.75rem 1.25rem 0;
  }

  .chat-body {
    position: relative;
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }

  .chat-footer {
    padding: 0.875rem 1.25rem 1.25rem;
    max-width: calc(48rem + 2.5rem);
    width: 100%;
    margin: 0 auto;
  }

  .empty-wrap {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .skeleton {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
    max-width: 48rem;
    width: 100%;
    margin: 0 auto;
    padding: 1.5rem 1rem;
  }

  .skeleton-row {
    display: grid;
    grid-template-columns: 1.75rem 1fr;
    gap: 0.75rem;
  }

  .skeleton-avatar {
    width: 1.75rem;
    height: 1.75rem;
    border-radius: var(--radius-full);
    background-color: var(--bg-surface);
  }

  .skeleton-lines {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding-top: 0.25rem;
  }

  .skeleton-line {
    height: 0.75rem;
    border-radius: var(--radius-sm);
    background: linear-gradient(
      90deg,
      var(--bg-surface) 0%,
      var(--bg-elevated) 50%,
      var(--bg-surface) 100%
    );
    background-size: 200% 100%;
    animation: shimmer 1.5s ease-in-out infinite;
  }

  @keyframes shimmer {
    from {
      background-position: 200% 0;
    }
    to {
      background-position: -200% 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .skeleton-line {
      animation: none;
    }
  }
</style>
