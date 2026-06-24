<script lang="ts">
  import { HugeiconsIcon } from '@hugeicons/svelte';
  import { Navigation03Icon, StopIcon } from '@hugeicons/core-free-icons';

  interface MessageInputProps {
    /** Submit handler — receives the trimmed text. */
    onsend: (text: string) => void;
    /** Interrupt handler — invoked when the stop button is pressed. */
    onstop?: () => void;
    /** True while a reply is streaming; swaps send for stop and locks input. */
    streaming?: boolean;
    /** Disable the whole control (e.g. disconnected). */
    disabled?: boolean;
    /** Placeholder copy. */
    placeholder?: string;
  }

  let {
    onsend,
    onstop,
    streaming = false,
    disabled = false,
    placeholder = 'Send a message…',
  }: MessageInputProps = $props();

  let value = $state('');
  let textarea = $state<HTMLTextAreaElement | null>(null);

  const trimmed = $derived(value.trim());
  const canSend = $derived(trimmed.length > 0 && !streaming && !disabled);

  function resize(): void {
    if (!textarea) return;
    textarea.style.height = 'auto';
    // Cap growth to roughly ten lines; scroll beyond that.
    const max = 220;
    textarea.style.height = `${Math.min(textarea.scrollHeight, max)}px`;
  }

  function submit(): void {
    if (!canSend) return;
    onsend(trimmed);
    value = '';
    queueMicrotask(resize);
  }

  function handleInput(): void {
    resize();
  }

  function handleKeydown(event: KeyboardEvent): void {
    const isEnter = event.key === 'Enter';
    if (!isEnter) return;

    // Enter sends; Shift+Enter inserts a newline. Cmd/Ctrl+Enter also sends,
    // matching the OpenCode convention.
    if (event.shiftKey) return;
    event.preventDefault();
    submit();
  }

  function handleStop(): void {
    onstop?.();
  }
</script>

<form
  class="message-input"
  class:is-disabled={disabled}
  onsubmit={(event) => {
    event.preventDefault();
    submit();
  }}
>
  <textarea
    bind:this={textarea}
    bind:value
    class="field"
    rows="1"
    {placeholder}
    {disabled}
    aria-label="Message"
    data-role="message-input"
    autocomplete="off"
    autocapitalize="sentences"
    spellcheck="true"
    oninput={handleInput}
    onkeydown={handleKeydown}
  ></textarea>

  {#if streaming}
    <button
      type="button"
      class="action stop"
      aria-label="Stop generating"
      title="Stop generating"
      onclick={handleStop}
    >
      <HugeiconsIcon icon={StopIcon} size={18} strokeWidth={1.5} color="currentColor" />
    </button>
  {:else}
    <button
      type="submit"
      class="action send"
      aria-label="Send message"
      title="Send message"
      disabled={!canSend}
    >
      <HugeiconsIcon icon={Navigation03Icon} size={18} strokeWidth={1.5} color="currentColor" />
    </button>
  {/if}
</form>

<style>
  .message-input {
    display: flex;
    align-items: flex-end;
    gap: 0.5rem;
    padding: 0.5rem 0.5rem 0.5rem 0.875rem;
    background-color: var(--bg-elevated);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    transition:
      border-color var(--transition-fast),
      box-shadow var(--transition-fast);
  }

  .message-input:focus-within {
    border-color: var(--border-strong);
    box-shadow: 0 0 0 3px var(--accent-soft);
  }

  .message-input.is-disabled {
    opacity: 0.6;
  }

  .field {
    flex: 1;
    min-height: 1.5rem;
    max-height: 220px;
    padding: 0.375rem 0;
    border: none;
    background: transparent;
    color: var(--text-primary);
    font-family: var(--font-sans);
    font-size: 0.9375rem;
    line-height: 1.5;
    resize: none;
    outline: none;
  }

  .field::placeholder {
    color: var(--text-muted);
  }

  .field:disabled {
    cursor: not-allowed;
  }

  .action {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: 2.25rem;
    height: 2.25rem;
    padding: 0;
    border: none;
    border-radius: var(--radius);
    cursor: pointer;
    transition:
      background-color var(--transition-fast),
      color var(--transition-fast),
      transform var(--transition-fast),
      opacity var(--transition-fast);
  }

  .action:active {
    transform: scale(0.92);
  }

  .send {
    background-color: var(--accent);
    color: var(--accent-foreground);
  }

  .send:hover:not(:disabled) {
    background-color: var(--accent-hover);
  }

  .send:disabled {
    background-color: var(--bg-surface);
    color: var(--text-muted);
    cursor: not-allowed;
  }

  .stop {
    background-color: var(--bg-surface);
    color: var(--text-primary);
  }

  .stop:hover {
    background-color: var(--border-strong);
  }

  .action:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: 2px;
  }

  @media (prefers-reduced-motion: reduce) {
    .action:active {
      transform: none;
    }
  }
</style>
