<script lang="ts">
  import { HugeiconsIcon } from '@hugeicons/svelte';
  import {
    Search01Icon,
    CommandIcon,
    ArrowRight01Icon,
    Cancel01Icon,
  } from '@hugeicons/core-free-icons';
  import { ui } from '$lib/stores/ui.svelte.js';
  import { formatCombo } from '$lib/keyboard/registry.js';
  import { isMac } from '$lib/keyboard/platform.js';
  import {
    commandRegistry,
    type Command,
    type CommandRegistry,
  } from '$lib/commands/registry.js';
  import { registerBuiltinCommands } from '$lib/commands/commands.js';

  interface CommandPaletteProps {
    /** Override the registry (tests). Defaults to the shared singleton. */
    registry?: CommandRegistry;
    /** Skip auto-registering built-in commands (tests). */
    autoRegister?: boolean;
  }

  let { registry = commandRegistry, autoRegister = true }: CommandPaletteProps = $props();

  const mac = $derived(isMac());

  let query = $state('');
  let activeIndex = $state(0);
  let inputEl = $state<HTMLInputElement | null>(null);
  let dialogEl = $state<HTMLDivElement | null>(null);
  let listEl = $state<HTMLUListElement | null>(null);
  let previouslyFocused = $state<HTMLElement | null>(null);

  // Register built-ins once when the palette mounts. Wrapped in an effect so
  // it runs after props settle and reads them inside a tracked scope.
  $effect(() => {
    if (autoRegister) registerBuiltinCommands(registry);
  });

  /** Flat, score-sorted results for the current query. */
  const results = $derived(commandResults(ui.paletteOpen, query));

  /** Results grouped by category, preserving the score-sorted order. */
  const groups = $derived(groupByCategory(results));

  /** Flat index → command lookup so arrow-key nav maps onto rendered rows. */
  const flat = $derived(results);

  function commandResults(open: boolean, q: string): Command[] {
    if (!open) return [];
    return registry.search(q);
  }

  function groupByCategory(commands: Command[]): Array<[string, Command[]]> {
    const map = new Map<string, Command[]>();
    for (const command of commands) {
      const list = map.get(command.category) ?? [];
      list.push(command);
      map.set(command.category, list);
    }
    return Array.from(map.entries());
  }

  /** Stable DOM id for a result row (used by aria-activedescendant). */
  function optionId(index: number): string {
    return `command-option-${index}`;
  }

  function indexOf(command: Command): number {
    return flat.findIndex((c) => c.id === command.id);
  }

  function close(): void {
    ui.paletteOpen = false;
  }

  function runCommand(command: Command): void {
    // Close first so overlays opened by the command (settings, help) win the
    // focus battle and are not immediately dismissed by our own teardown.
    close();
    command.run();
  }

  function move(delta: number): void {
    const count = flat.length;
    if (count === 0) return;
    activeIndex = (activeIndex + delta + count) % count;
    scrollActiveIntoView();
  }

  function scrollActiveIntoView(): void {
    queueMicrotask(() => {
      const el = listEl?.querySelector<HTMLElement>(`#${optionId(activeIndex)}`);
      el?.scrollIntoView({ block: 'nearest' });
    });
  }

  function handleKeydown(event: KeyboardEvent): void {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        move(1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        move(-1);
        break;
      case 'Enter': {
        event.preventDefault();
        const command = flat[activeIndex];
        if (command) runCommand(command);
        break;
      }
      case 'Escape':
        event.preventDefault();
        close();
        break;
      case 'Tab':
        // Keep focus inside the dialog.
        trapFocus(event);
        break;
      default:
        break;
    }
  }

  function trapFocus(event: KeyboardEvent): void {
    if (!dialogEl) return;
    const selector =
      'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const focusable = Array.from(dialogEl.querySelectorAll<HTMLElement>(selector));
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement as HTMLElement | null;
    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  // Reset selection to the top whenever the query changes or new results arrive.
  $effect(() => {
    void query;
    void results.length;
    activeIndex = 0;
  });

  // Open/close lifecycle: focus the input on open, restore focus on close,
  // and clear the query so each invocation starts fresh.
  $effect(() => {
    if (!ui.paletteOpen) return;
    query = '';
    activeIndex = 0;
    if (typeof document !== 'undefined') {
      previouslyFocused = document.activeElement as HTMLElement | null;
    }
    queueMicrotask(() => inputEl?.focus());
    return () => previouslyFocused?.focus?.();
  });
</script>

{#if ui.paletteOpen}
  <div
    class="command-palette-overlay"
    role="presentation"
    onclick={close}
  >
    <div
      class="command-palette glass-surface glass-surface--floating"
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      tabindex={-1}
      bind:this={dialogEl}
      onkeydown={handleKeydown}
      onclick={(event: MouseEvent) => event.stopPropagation()}
    >
      <div class="search-row">
        <span class="search-icon" aria-hidden="true">
          <HugeiconsIcon icon={Search01Icon} size={18} strokeWidth={1.5} color="currentColor" />
        </span>
        <input
          bind:this={inputEl}
          bind:value={query}
          class="search-input"
          type="text"
          role="combobox"
          aria-expanded="true"
          aria-controls="command-listbox"
          aria-autocomplete="list"
          aria-activedescendant={flat.length ? optionId(activeIndex) : undefined}
          aria-label="Search commands"
          placeholder="Type a command or search…"
          autocomplete="off"
          spellcheck="false"
        />
        <button
          type="button"
          class="close-btn"
          aria-label="Close command palette"
          title="Close"
          onclick={close}
        >
          <HugeiconsIcon icon={Cancel01Icon} size={16} strokeWidth={1.5} color="currentColor" />
        </button>
      </div>

      <ul
        bind:this={listEl}
        id="command-listbox"
        class="command-list"
        role="listbox"
        aria-label="Commands"
        tabindex={-1}
      >
        {#if flat.length === 0}
          <li class="empty-state" role="presentation">
            <HugeiconsIcon icon={CommandIcon} size={22} strokeWidth={1.5} color="currentColor" />
            <span>No commands found</span>
          </li>
        {:else}
          {#each groups as [category, items] (category)}
            <li class="group" role="presentation">
              <div class="group-label" aria-hidden="true">{category}</div>
              <ul class="group-list" role="presentation">
                {#each items as command (command.id)}
                  {@const index = indexOf(command)}
                  {@const selected = index === activeIndex}
                  <!-- Listbox options are keyboard-driven via the combobox input
                       (arrow keys + Enter), per the ARIA combobox pattern, so a
                       per-option keydown handler is intentionally omitted. -->
                  <!-- svelte-ignore a11y_click_events_have_key_events -->
                  <li
                    id={optionId(index)}
                    class="command-row"
                    class:selected
                    role="option"
                    aria-selected={selected}
                    onclick={() => runCommand(command)}
                    onmousemove={() => (activeIndex = index)}
                  >
                    {#if command.icon}
                      <span class="row-icon" aria-hidden="true">
                        <HugeiconsIcon
                          icon={command.icon}
                          size={16}
                          strokeWidth={1.5}
                          color="currentColor"
                        />
                      </span>
                    {:else}
                      <span class="row-icon row-icon--placeholder" aria-hidden="true"></span>
                    {/if}
                    <span class="row-text">
                      <span class="row-title">{command.title}</span>
                      {#if command.subtitle}
                        <span class="row-subtitle">{command.subtitle}</span>
                      {/if}
                    </span>
                    {#if command.keys?.length}
                      <span class="row-keys" aria-hidden="true">
                        {#each command.keys as combo (combo)}
                          <kbd class="row-kbd">{formatCombo(combo, mac)}</kbd>
                        {/each}
                      </span>
                    {:else if selected}
                      <span class="row-enter" aria-hidden="true">
                        <HugeiconsIcon
                          icon={ArrowRight01Icon}
                          size={14}
                          strokeWidth={1.5}
                          color="currentColor"
                        />
                      </span>
                    {/if}
                  </li>
                {/each}
              </ul>
            </li>
          {/each}
        {/if}
      </ul>

      <footer class="command-footer" aria-hidden="true">
        <span class="hint"><kbd>↑</kbd><kbd>↓</kbd> navigate</span>
        <span class="hint"><kbd>↵</kbd> run</span>
        <span class="hint"><kbd>esc</kbd> close</span>
      </footer>
    </div>
  </div>
{/if}

<style>
  .command-palette-overlay {
    position: fixed;
    inset: 0;
    z-index: 70;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding: 1rem;
    padding-top: clamp(3rem, 14vh, 9rem);
    background: rgba(0, 0, 0, 0.45);
    animation: overlay-in var(--transition-base) var(--ease-out);
  }

  .command-palette {
    width: min(40rem, 100%);
    max-height: min(70vh, 34rem);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    outline: none;
    animation: palette-in var(--transition-base) var(--ease-out);
  }

  .search-row {
    display: flex;
    align-items: center;
    gap: 0.625rem;
    padding: 0.875rem 1rem;
    border-bottom: 1px solid var(--border);
  }

  .search-icon {
    display: inline-flex;
    color: var(--text-muted);
    flex: 0 0 auto;
  }

  .search-input {
    flex: 1 1 auto;
    min-width: 0;
    border: none;
    background: transparent;
    font: inherit;
    font-size: 0.9375rem;
    color: var(--text-primary);
    outline: none;
  }

  .search-input::placeholder {
    color: var(--text-muted);
  }

  .close-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.75rem;
    height: 1.75rem;
    padding: 0;
    border: none;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
    flex: 0 0 auto;
    transition:
      color var(--transition-fast),
      background-color var(--transition-fast);
  }

  .close-btn:hover {
    color: var(--text-primary);
    background-color: var(--bg-surface);
  }

  .close-btn:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: 2px;
  }

  .command-list {
    list-style: none;
    margin: 0;
    padding: 0.5rem;
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
  }

  .group {
    display: block;
  }

  .group + .group {
    margin-top: 0.375rem;
  }

  .group-label {
    padding: 0.375rem 0.625rem 0.25rem;
    font-size: 0.6875rem;
    font-weight: 600;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: var(--text-muted);
  }

  .group-list {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .command-row {
    display: flex;
    align-items: center;
    gap: 0.625rem;
    padding: 0.5rem 0.625rem;
    border-radius: var(--radius);
    color: var(--text-secondary);
    cursor: pointer;
    transition: background-color var(--transition-fast), color var(--transition-fast);
  }

  .command-row.selected {
    background-color: color-mix(in oklab, var(--accent) 16%, transparent);
    color: var(--text-primary);
  }

  .row-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.25rem;
    height: 1.25rem;
    flex: 0 0 auto;
    color: var(--text-muted);
  }

  .command-row.selected .row-icon {
    color: var(--accent-text);
  }

  .row-icon--placeholder {
    visibility: hidden;
  }

  .row-text {
    display: flex;
    flex-direction: column;
    gap: 0.0625rem;
    min-width: 0;
    flex: 1 1 auto;
  }

  .row-title {
    font-size: 0.875rem;
    line-height: 1.3;
    color: inherit;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .row-subtitle {
    font-size: 0.75rem;
    color: var(--text-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .row-keys {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    flex: 0 0 auto;
  }

  .row-kbd {
    display: inline-flex;
    align-items: center;
    min-width: 1.375rem;
    height: 1.375rem;
    padding: 0 0.3125rem;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background-color: var(--bg-base);
    font-family: var(--font-mono);
    font-size: 0.75rem;
    font-weight: 500;
    color: var(--text-secondary);
  }

  .row-enter {
    display: inline-flex;
    align-items: center;
    color: var(--accent-text);
    flex: 0 0 auto;
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.625rem;
    padding: 2.5rem 1rem;
    color: var(--text-muted);
    font-size: 0.875rem;
  }

  .command-footer {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 0.5rem 1rem;
    border-top: 1px solid var(--border);
    font-size: 0.75rem;
    color: var(--text-muted);
  }

  .command-footer .hint {
    display: inline-flex;
    align-items: center;
    gap: 0.3125rem;
  }

  .command-footer kbd {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 1.125rem;
    height: 1.125rem;
    padding: 0 0.25rem;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background-color: var(--bg-base);
    font-family: var(--font-mono);
    font-size: 0.6875rem;
    color: var(--text-secondary);
  }

  @keyframes overlay-in {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  @keyframes palette-in {
    from {
      opacity: 0;
      transform: translateY(-8px) scale(0.98);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .command-palette-overlay,
    .command-palette {
      animation: none;
    }

    .command-row,
    .close-btn {
      transition: none;
    }
  }

  @media (max-width: 640px) {
    .command-palette-overlay {
      padding-top: clamp(1.5rem, 8vh, 4rem);
    }

    .command-footer {
      display: none;
    }
  }
</style>
