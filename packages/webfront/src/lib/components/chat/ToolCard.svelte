<script lang="ts">
  import { slide } from 'svelte/transition';
  import { prefersReducedMotion } from 'svelte/motion';
  import { HugeiconsIcon } from '@hugeicons/svelte';
  import {
    ArrowRight01Icon,
    CheckmarkCircle02Icon,
    Alert02Icon,
    Loading03Icon,
    ToolsIcon,
    File01Icon,
    PencilEdit01Icon,
    ComputerTerminal01Icon,
    Search01Icon,
    FolderIcon,
    Globe02Icon,
    ListViewIcon,
    Database01Icon,
  } from '@hugeicons/core-free-icons';
  import type { ToolInvokePart, ToolResultPart } from '$lib/api/messages.js';
  import CodeBlock from './CodeBlock.svelte';
  import ToolOutput from './ToolOutput.svelte';
  import {
    toolStatus,
    toolName,
    defaultExpanded,
    iconKeyForTool,
    formatInput,
    type ToolIconKey,
  } from './tool-card.js';

  interface ToolCardProps {
    /** The tool-invoke part (present once the call starts). */
    invoke?: ToolInvokePart;
    /** The matching tool-result part (present once the call finishes). */
    result?: ToolResultPart;
  }

  let { invoke, result }: ToolCardProps = $props();

  const status = $derived(toolStatus(invoke, result));
  const name = $derived(toolName(invoke, result));
  const iconKey = $derived(iconKeyForTool(name));
  const input = $derived(formatInput(invoke?.input));

  /** Map canonical icon keys → concrete HugeIcons. */
  const TOOL_ICONS: Record<ToolIconKey, typeof ToolsIcon> = {
    read: File01Icon,
    write: PencilEdit01Icon,
    edit: PencilEdit01Icon,
    bash: ComputerTerminal01Icon,
    grep: Search01Icon,
    glob: FolderIcon,
    webfetch: Globe02Icon,
    list: ListViewIcon,
    database: Database01Icon,
    tool: ToolsIcon,
  };
  const headerIcon = $derived(TOOL_ICONS[iconKey]);

  // Track the user's intent; until they interact, follow the status default
  // (running/error → open, success → collapsed). Once a call completes we let
  // the auto-collapse fire exactly once, then respect manual toggles.
  let userToggled = $state(false);
  let manualOpen = $state(false);
  const open = $derived(userToggled ? manualOpen : defaultExpanded(status));

  function toggle(): void {
    userToggled = true;
    manualOpen = !open;
  }

  const STATUS_LABEL: Record<typeof status, string> = {
    running: 'Running',
    success: 'Done',
    error: 'Error',
  };
  const STATUS_ICON = $derived(
    status === 'running'
      ? Loading03Icon
      : status === 'error'
        ? Alert02Icon
        : CheckmarkCircle02Icon
  );

  const fallbackId = Math.random().toString(36).slice(2);
  const bodyId = $derived(`tool-body-${invoke?.id ?? result?.id ?? fallbackId}`);
</script>

<section class="tool-card tool-card--{status}" aria-label={`${name} tool call`}>
  <button
    type="button"
    class="header"
    aria-expanded={open}
    aria-controls={bodyId}
    onclick={toggle}
  >
    <span class="chevron" class:open aria-hidden="true">
      <HugeiconsIcon icon={ArrowRight01Icon} size={15} strokeWidth={2} color="currentColor" />
    </span>

    <span class="tool-icon" aria-hidden="true">
      <HugeiconsIcon icon={headerIcon} size={15} strokeWidth={1.8} color="currentColor" />
    </span>

    <span class="name">{name}</span>

    <span class="status status--{status}">
      <span class="status-icon" class:spin={status === 'running'} aria-hidden="true">
        <HugeiconsIcon icon={STATUS_ICON} size={13} strokeWidth={2} color="currentColor" />
      </span>
      <span class="status-text">{STATUS_LABEL[status]}</span>
    </span>
  </button>

  {#if open}
    <div
      id={bodyId}
      class="body"
      transition:slide={{ duration: prefersReducedMotion.current ? 0 : 180 }}
    >
      {#if input.text}
        <div class="field">
          <span class="field-label">Input</span>
          {#if input.isJson}
            <CodeBlock code={input.text} lang="json" />
          {:else}
            <pre class="param">{input.text}</pre>
          {/if}
        </div>
      {/if}

      <div class="field">
        <span class="field-label">Output</span>
        {#if status === 'running'}
          <div class="running" role="status" aria-live="polite">
            <span class="shimmer"></span>
            <span class="shimmer shimmer--short"></span>
            <span class="running-text">Working…</span>
          </div>
        {:else}
          <ToolOutput output={result?.output} error={result?.error} tool={name} />
        {/if}
      </div>
    </div>
  {/if}
</section>

<style>
  .tool-card {
    margin: 0.5rem 0;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background-color: var(--bg-elevated);
    overflow: hidden;
    transition: border-color var(--transition-fast);
  }

  .tool-card--running {
    border-color: color-mix(in srgb, var(--accent) 35%, var(--border));
  }
  .tool-card--error {
    border-color: rgba(248, 113, 113, 0.4);
  }

  .header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    padding: 0.5rem 0.75rem;
    font: inherit;
    text-align: left;
    color: var(--text-primary);
    background-color: transparent;
    border: none;
    cursor: pointer;
    transition: background-color var(--transition-fast);
  }

  .header:hover {
    background-color: var(--bg-surface);
  }

  .header:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: -2px;
  }

  .chevron {
    display: inline-flex;
    color: var(--text-muted);
    transition: transform var(--transition-base);
  }
  .chevron.open {
    transform: rotate(90deg);
  }

  .tool-icon {
    display: inline-flex;
    color: var(--text-secondary);
  }

  .name {
    flex: 1;
    min-width: 0;
    font-family: var(--font-mono);
    font-size: 0.8125rem;
    font-weight: 500;
    color: var(--text-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .status {
    display: inline-flex;
    align-items: center;
    gap: 0.3125rem;
    padding: 0.125rem 0.4375rem;
    font-size: 0.6875rem;
    font-weight: 600;
    letter-spacing: 0.01em;
    border-radius: var(--radius-full);
    white-space: nowrap;
  }

  .status--running {
    color: var(--accent-text);
    background-color: var(--accent-soft);
  }
  .status--success {
    color: var(--text-secondary);
    background-color: var(--bg-surface);
  }
  .status--error {
    color: var(--danger-text);
    background-color: rgba(248, 113, 113, 0.1);
  }

  .status-icon {
    display: inline-flex;
  }
  .status-icon.spin {
    animation: spin 0.9s linear infinite;
  }

  .body {
    padding: 0 0.75rem 0.625rem;
    border-top: 1px solid var(--border);
  }

  .field {
    margin-top: 0.625rem;
  }

  .field-label {
    display: block;
    margin-bottom: 0.3125rem;
    font-size: 0.6875rem;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--text-muted);
  }

  .param {
    margin: 0;
    padding: 0.625rem 0.75rem;
    font-family: var(--font-mono);
    font-size: 0.8125rem;
    line-height: 1.55;
    color: var(--text-primary);
    background-color: var(--bg-base);
    border-radius: var(--radius-sm);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  .running {
    display: flex;
    align-items: center;
    gap: 0.625rem;
    padding: 0.5rem 0.25rem;
  }

  .shimmer {
    height: 0.5rem;
    width: 7rem;
    border-radius: var(--radius-full);
    background: linear-gradient(
      90deg,
      var(--bg-surface) 0%,
      var(--border-strong) 50%,
      var(--bg-surface) 100%
    );
    background-size: 200% 100%;
    animation: shimmer 1.4s ease-in-out infinite;
  }
  .shimmer--short {
    width: 4rem;
  }

  .running-text {
    font-size: 0.75rem;
    color: var(--text-muted);
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  @keyframes shimmer {
    0% {
      background-position: 200% 0;
    }
    100% {
      background-position: -200% 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .chevron,
    .header,
    .tool-card {
      transition: none;
    }
    .status-icon.spin {
      animation: none;
    }
    .shimmer {
      animation: none;
      background-position: 0 0;
    }
  }
</style>
