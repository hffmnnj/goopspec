<script lang="ts">
  import { HugeiconsIcon } from '@hugeicons/svelte';
  import {
    CheckmarkCircle02Icon,
    Alert02Icon,
    Loading03Icon,
    Copy01Icon,
    RefreshIcon
  } from '@hugeicons/core-free-icons';
  import { connection } from '$lib/stores/connection.svelte.js';
  import { getServerUrl, setServerUrl, validateServerUrl } from '$lib/api/config.js';
  import {
    copyStartServerCommand,
    getStartServerCommand,
    getServerPort
  } from '$lib/components/settings/server-command.js';

  let serverUrlDraft = $state(getServerUrl());
  let serverUrlError = $state<string | null>(null);
  let serverCommandCopied = $state(false);
  let serverCommandCopyTimer: ReturnType<typeof setTimeout> | null = null;

  const connectionStatus = $derived(connection.current.status);
  const connectionError = $derived(connection.current.error);
  const serverPort = $derived(getServerPort(serverUrlDraft));
  const startServerCommand = $derived(getStartServerCommand(serverUrlDraft));

  function saveServerUrl(): void {
    const error = validateServerUrl(serverUrlDraft);
    serverUrlError = error;
    if (error) return;
    const previousUrl = getServerUrl();
    setServerUrl(serverUrlDraft);
    if (getServerUrl() !== previousUrl) {
      void connection.connect();
    }
  }

  function testConnection(): void {
    saveServerUrl();
    if (serverUrlError) return;
    void connection.connect();
  }

  async function copyStartCommand(): Promise<void> {
    await copyStartServerCommand(serverUrlDraft);
    serverCommandCopied = true;
    if (serverCommandCopyTimer) clearTimeout(serverCommandCopyTimer);
    serverCommandCopyTimer = setTimeout(() => {
      serverCommandCopied = false;
      serverCommandCopyTimer = null;
    }, 1600);
  }
</script>

<section class="settings-section" aria-labelledby="server-heading">
  <header class="section-header">
    <h2 id="server-heading" class="section-title">Server</h2>
    <p class="section-subtitle">Connection status, server URL, and start command.</p>
  </header>

  <!-- Live connection status badge -->
  <div class="status-badge" data-status={connectionStatus} aria-live="polite">
    {#if connectionStatus === 'connected'}
      <span class="status-dot"></span>
      <HugeiconsIcon icon={CheckmarkCircle02Icon} size={16} color="currentColor" strokeWidth={1.5} />
      <span class="status-label">Connected</span>
    {:else if connectionStatus === 'connecting'}
      <span class="status-dot"></span>
      <span class="spin">
        <HugeiconsIcon icon={Loading03Icon} size={16} color="currentColor" strokeWidth={1.5} />
      </span>
      <span class="status-label">Connecting…</span>
    {:else if connectionStatus === 'error'}
      <span class="status-dot"></span>
      <HugeiconsIcon icon={Alert02Icon} size={16} color="currentColor" strokeWidth={1.5} />
      <span class="status-label">{connectionError ?? 'Connection error'}</span>
    {:else}
      <span class="status-dot"></span>
      <span class="status-label">Not connected</span>
    {/if}
  </div>

  <!-- Server URL editor -->
  <div class="field">
    <label class="field-label" for="server-url">Server URL</label>
    <div class="url-row">
      <input
        id="server-url"
        class="text-input"
        class:invalid={!!serverUrlError}
        type="url"
        inputmode="url"
        autocomplete="off"
        spellcheck="false"
        aria-invalid={!!serverUrlError}
        aria-describedby={serverUrlError ? 'server-url-error' : undefined}
        bind:value={serverUrlDraft}
        onblur={saveServerUrl}
        placeholder="http://localhost:4096"
      />
      <button type="button" class="action-btn" onclick={saveServerUrl}>Save</button>
      <button
        type="button"
        class="action-btn"
        onclick={testConnection}
        aria-label="Test connection"
      >
        {#if connectionStatus === 'connecting'}
          <span class="spin">
            <HugeiconsIcon icon={Loading03Icon} size={14} color="currentColor" strokeWidth={1.5} />
          </span>
        {:else}
          <HugeiconsIcon icon={RefreshIcon} size={14} color="currentColor" strokeWidth={1.5} />
          Test
        {/if}
      </button>
    </div>
    {#if serverUrlError}
      <p id="server-url-error" class="field-error" role="alert">{serverUrlError}</p>
    {/if}
    <p class="field-hint">Port: {serverPort}</p>
  </div>

  <!-- Start Server command card -->
  <div class="start-server-card" aria-labelledby="start-server-title">
    <h3 id="start-server-title" class="subgroup-title">Start Server</h3>
    <p class="field-hint">Run this command to start the OpenCode server:</p>
    <div class="command-row">
      <code class="command-text">{startServerCommand}</code>
      <button
        type="button"
        class="action-btn copy-command-btn"
        aria-label="Copy start server command"
        onclick={copyStartCommand}
      >
        <HugeiconsIcon icon={Copy01Icon} size={14} color="currentColor" strokeWidth={1.5} />
        {serverCommandCopied ? 'Copied!' : 'Copy'}
      </button>
    </div>
    <p class="field-hint">The port matches your configured server URL.</p>
  </div>
</section>

<style>
  .settings-section {
    max-width: 56rem;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .section-header {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
  }

  .section-title {
    margin: 0;
    font-size: 1.375rem;
    font-weight: 600;
    letter-spacing: -0.02em;
    color: var(--text-primary);
  }

  .section-subtitle {
    margin: 0;
    font-size: 0.9375rem;
    color: var(--text-secondary);
  }

  /* ---- Connection status badge ---- */
  .status-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    align-self: flex-start;
    padding: 0.5rem 0.875rem;
    font-size: 0.8125rem;
    font-weight: 500;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background-color: var(--bg-elevated);
    color: var(--text-muted);
  }

  .status-label {
    line-height: 1;
  }

  .status-dot {
    width: 0.5rem;
    height: 0.5rem;
    border-radius: 50%;
    background-color: currentColor;
    flex: 0 0 auto;
  }

  .status-badge[data-status='connected'] {
    color: var(--accent-text);
    border-color: color-mix(in srgb, var(--accent-text) 30%, var(--border));
  }

  .status-badge[data-status='connecting'] {
    color: var(--text-secondary);
  }

  .status-badge[data-status='error'] {
    color: var(--danger-text);
    border-color: color-mix(in srgb, var(--danger-text) 30%, var(--border));
  }

  /* ---- Field ---- */
  .field {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .field-label {
    font-size: 0.8125rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .url-row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .text-input {
    flex: 1 1 16rem;
    min-width: 0;
    padding: 0.5rem 0.75rem;
    font: inherit;
    font-size: 0.8125rem;
    color: var(--text-primary);
    background-color: var(--bg-base);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    transition:
      border-color var(--transition-fast),
      box-shadow var(--transition-fast);
  }

  .text-input::placeholder {
    color: var(--text-muted);
  }

  .text-input:focus-visible {
    outline: none;
    border-color: var(--focus-ring);
    box-shadow: 0 0 0 2px var(--accent-soft);
  }

  .text-input.invalid {
    border-color: var(--danger-text);
  }

  .action-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.375rem;
    min-width: 3.25rem;
    padding: 0.5rem 0.75rem;
    font-size: 0.8125rem;
    font-weight: 500;
    color: var(--text-primary);
    background-color: var(--bg-elevated);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition:
      background-color var(--transition-fast),
      border-color var(--transition-fast);
  }

  .action-btn:hover {
    background-color: var(--bg-surface);
    border-color: var(--border-strong);
  }

  .action-btn:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: 2px;
  }

  .field-error {
    margin: 0;
    font-size: 0.75rem;
    color: var(--danger-text);
  }

  .field-hint {
    margin: 0;
    font-size: 0.75rem;
    color: var(--text-muted);
  }

  /* ---- Start server card ---- */
  .start-server-card {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 0.75rem;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background-color: var(--bg-base);
  }

  .subgroup-title {
    margin: 0;
    font-size: 0.8125rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .command-row {
    display: flex;
    align-items: stretch;
    min-width: 0;
    overflow: hidden;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background-color: var(--bg-elevated);
  }

  .command-text {
    flex: 1 1 auto;
    min-width: 0;
    padding: 0.55rem 0.75rem;
    overflow-x: auto;
    font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace);
    font-size: 0.78125rem;
    color: var(--text-primary);
    white-space: nowrap;
  }

  .copy-command-btn {
    min-width: 5rem;
    border-width: 0 0 0 1px;
    border-radius: 0;
    background-color: var(--bg-surface);
  }

  .spin {
    display: inline-flex;
    animation: spin 0.9s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .spin {
      animation: none;
    }
  }
</style>
