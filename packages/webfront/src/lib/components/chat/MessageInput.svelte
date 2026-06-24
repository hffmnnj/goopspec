<script lang="ts">
  import { HugeiconsIcon } from '@hugeicons/svelte';
  import { Navigation03Icon, StopIcon, CommandIcon } from '@hugeicons/core-free-icons';
  import { commands as defaultCommands, type CommandStore } from '$lib/stores/commands.svelte.js';
  import {
    detectCommandTrigger,
    filterCommands,
    completeCommand,
  } from '$lib/commands/command-complete.js';
  import type { SlashCommand } from '$lib/api/types.js';

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
    /** Text to insert into the composer when the nonce changes. */
    insertText?: string;
    /** Monotonic signal for insertText so selecting the same file twice works. */
    insertNonce?: number;
    /** Slash-command catalog store; defaults to the shared singleton. */
    commandStore?: CommandStore;
  }

  let {
    onsend,
    onstop,
    streaming = false,
    disabled = false,
    placeholder = 'Send a message…',
    insertText,
    insertNonce = 0,
    commandStore = defaultCommands,
  }: MessageInputProps = $props();

  let value = $state('');
  let textarea = $state<HTMLTextAreaElement | null>(null);

  const trimmed = $derived(value.trim());
  const canSend = $derived(trimmed.length > 0 && !streaming && !disabled);

  // --- Slash-command completion ----------------------------------------------
  let menuOpen = $state(false);
  let cursor = $state(0);
  let activeIndex = $state(0);

  const trigger = $derived(disabled ? null : detectCommandTrigger(value, cursor));
  const matches = $derived(trigger ? filterCommands(commandStore.commands, trigger.query) : []);
  const showMenu = $derived(menuOpen && trigger !== null);

  function syncCursor(): void {
    cursor = textarea?.selectionStart ?? value.length;
  }

  function openMenuIfTriggered(): void {
    syncCursor();
    if (detectCommandTrigger(value, cursor)) {
      if (!menuOpen) activeIndex = 0;
      menuOpen = true;
      void commandStore.ensureLoaded();
    } else {
      menuOpen = false;
    }
  }

  function closeMenu(): void {
    menuOpen = false;
  }

  function clampActive(): void {
    if (matches.length === 0) {
      activeIndex = 0;
      return;
    }
    activeIndex = Math.max(0, Math.min(activeIndex, matches.length - 1));
  }

  function selectCommand(command: SlashCommand): void {
    const result = completeCommand(value, command);
    value = result.value;
    closeMenu();
    queueMicrotask(() => {
      resize();
      textarea?.focus();
      textarea?.setSelectionRange(result.cursor, result.cursor);
      cursor = result.cursor;
    });
  }
  // ---------------------------------------------------------------------------

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
    closeMenu();
    queueMicrotask(() => {
      resize();
      cursor = 0;
    });
  }

  function handleInput(): void {
    resize();
    openMenuIfTriggered();
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (showMenu && matches.length > 0) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        activeIndex = (activeIndex + 1) % matches.length;
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        activeIndex = (activeIndex - 1 + matches.length) % matches.length;
        return;
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault();
        const command = matches[activeIndex];
        if (command) selectCommand(command);
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        closeMenu();
        return;
      }
    } else if (showMenu && event.key === 'Escape') {
      event.preventDefault();
      closeMenu();
      return;
    }

    const isEnter = event.key === 'Enter';
    if (!isEnter) return;

    // Enter sends; Shift+Enter inserts a newline. Cmd/Ctrl+Enter also sends,
    // matching the OpenCode convention.
    if (event.shiftKey) return;
    event.preventDefault();
    submit();
  }

  function handleKeyup(): void {
    syncCursor();
    openMenuIfTriggered();
  }

  function handleClickSelection(): void {
    syncCursor();
    openMenuIfTriggered();
  }

  function handleStop(): void {
    onstop?.();
  }

  function insertIntoComposer(text: string): void {
    if (!text.trim()) return;
    const mention = text.trim();
    const needsSpaceBefore = value.length > 0 && !/\s$/.test(value);
    const prefix = needsSpaceBefore ? ' ' : '';
    value = `${value}${prefix}${mention} `;
    queueMicrotask(() => {
      resize();
      textarea?.focus();
      textarea?.setSelectionRange(value.length, value.length);
      cursor = value.length;
    });
  }

  $effect(() => {
    if (insertNonce <= 0 || !insertText) return;
    insertIntoComposer(insertText);
  });

  $effect(() => {
    // Keep the highlighted row valid as the filtered list changes.
    void matches.length;
    clampActive();
  });
</script>

<div class="composer">
  {#if showMenu}
    <div
      class="command-menu"
      role="listbox"
      id="command-completion-listbox"
      aria-label="Slash commands"
    >
      {#if matches.length > 0}
        <ul class="command-list" role="presentation">
          {#each matches as command, index (command.name)}
            <li role="presentation">
              <button
                type="button"
                id={`command-option-${command.name}`}
                class="command-option"
                class:active={index === activeIndex}
                role="option"
                aria-selected={index === activeIndex}
                onmousedown={(event) => {
                  // Keep textarea focus; mousedown fires before blur.
                  event.preventDefault();
                  selectCommand(command);
                }}
                onmouseenter={() => (activeIndex = index)}
              >
                <span class="command-glyph" aria-hidden="true">
                  <HugeiconsIcon icon={CommandIcon} size={15} strokeWidth={1.5} color="currentColor" />
                </span>
                <span class="command-copy">
                  <span class="command-name">/{command.name}</span>
                  {#if command.description}
                    <span class="command-desc">{command.description}</span>
                  {/if}
                </span>
              </button>
            </li>
          {/each}
        </ul>
      {:else}
        <div class="command-empty" role="status">
          {commandStore.loading ? 'Loading commands…' : 'No matching commands'}
        </div>
      {/if}
    </div>
  {/if}

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
      role="combobox"
      aria-expanded={showMenu}
      aria-controls={showMenu ? 'command-completion-listbox' : undefined}
      aria-activedescendant={showMenu && matches[activeIndex] ? `command-option-${matches[activeIndex].name}` : undefined}
      aria-autocomplete="list"
      oninput={handleInput}
      onkeydown={handleKeydown}
      onkeyup={handleKeyup}
      onclick={handleClickSelection}
      onblur={closeMenu}
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
</div>

<style>
  .composer {
    position: relative;
  }

  .command-menu {
    position: absolute;
    bottom: calc(100% + 0.5rem);
    left: 0;
    right: 0;
    z-index: 50;
    max-height: min(18rem, 50vh);
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 0.375rem;
    background-color: var(--bg-elevated);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-lg, 0 12px 32px rgba(0, 0, 0, 0.35));
    backdrop-filter: blur(12px);
    animation: command-menu-in var(--transition-fast) ease-out;
  }

  @keyframes command-menu-in {
    from {
      opacity: 0;
      transform: translateY(4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .command-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
  }

  .command-option {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 0.625rem;
    padding: 0.5rem 0.625rem;
    border: 1px solid transparent;
    border-radius: var(--radius);
    background: transparent;
    color: var(--text-secondary);
    text-align: left;
    cursor: pointer;
    transition:
      background-color var(--transition-fast),
      color var(--transition-fast);
  }

  .command-option:hover,
  .command-option.active {
    color: var(--text-primary);
    background-color: var(--bg-surface);
    border-color: var(--border);
  }

  .command-glyph {
    display: inline-flex;
    flex-shrink: 0;
    color: var(--accent-text);
  }

  .command-copy {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
  }

  .command-name {
    font-size: 0.8125rem;
    font-weight: 600;
    font-family: var(--font-mono, monospace);
  }

  .command-desc {
    font-size: 0.75rem;
    color: var(--text-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .command-empty {
    padding: 0.625rem;
    font-size: 0.8125rem;
    color: var(--text-muted);
  }

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
    .command-menu {
      animation: none;
    }
    .command-option {
      transition: none;
    }
  }
</style>
