<script lang="ts">
  import { HugeiconsIcon } from '@hugeicons/svelte';
  import {
    Cancel01Icon,
    PaintBoardIcon,
    CloudServerIcon,
    AiBrain01Icon,
    Sun03Icon,
    Moon02Icon,
    Loading03Icon,
    Alert02Icon,
    RefreshIcon,
    CheckmarkCircle02Icon,
    Copy01Icon
  } from '@hugeicons/core-free-icons';
  import { theme, setTheme, type Theme } from '$lib/stores/theme.svelte.js';
  import {
    settings as defaultSettings,
    type Density,
    type MotionPreference
  } from '$lib/stores/settings.svelte.js';
  import { connection as defaultConnection } from '$lib/stores/connection.svelte.js';
  import { getServerUrl, setServerUrl, validateServerUrl } from '$lib/api/config.js';
  import { createClient } from '$lib/api/client.js';
  import { fetchProviders, countModels, formatContext } from '$lib/api/providers.js';
  import { copyStartServerCommand, getServerPort, getStartServerCommand } from './server-command.js';
  import type { OpenCodeClient, Provider } from '$lib/api/types.js';

  interface SettingsPanelProps {
    /** Controls visibility. Two-way bindable. */
    open?: boolean;
    /** Called when the panel requests to close. */
    onclose?: () => void;
    /** Override the OpenCode client (tests). Defaults to a configured client. */
    client?: OpenCodeClient;
    /** Override the appearance settings store (tests). */
    settingsStore?: typeof defaultSettings;
    /** Override the connection store (tests). */
    connectionStore?: typeof defaultConnection;
  }

  let {
    open = $bindable(false),
    onclose,
    client,
    settingsStore = defaultSettings,
    connectionStore = defaultConnection
  }: SettingsPanelProps = $props();

  const resolvedClient = $derived(client ?? createClient());

  // --- Appearance ----------------------------------------------------------
  const THEME_OPTIONS: { value: Theme; label: string; icon: typeof Sun03Icon }[] = [
    { value: 'light', label: 'Light', icon: Sun03Icon },
    { value: 'dark', label: 'Dark', icon: Moon02Icon }
  ];

  const MOTION_OPTIONS: { value: MotionPreference; label: string }[] = [
    { value: 'system', label: 'System' },
    { value: 'full', label: 'Full' },
    { value: 'reduced', label: 'Reduced' }
  ];

  // --- Server --------------------------------------------------------------
  let serverUrlDraft = $state(getServerUrl());
  let serverUrlError = $state<string | null>(null);
  let serverCommandCopied = $state(false);
  let serverCommandCopyTimer: ReturnType<typeof setTimeout> | null = null;
  const connectionStatus = $derived(connectionStore.current.status);
  const connectionError = $derived(connectionStore.current.error);
  const serverPort = $derived(getServerPort(serverUrlDraft));
  const startServerCommand = $derived(getStartServerCommand(serverUrlDraft));

  function saveServerUrl(): void {
    const error = validateServerUrl(serverUrlDraft);
    serverUrlError = error;
    if (error) return;
    const previousUrl = getServerUrl();
    setServerUrl(serverUrlDraft);
    if (getServerUrl() !== previousUrl) {
      void connectionStore.connect();
    }
  }

  function testConnection(): void {
    saveServerUrl();
    if (serverUrlError) return;
    void connectionStore.connect();
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

  // --- Providers & models --------------------------------------------------
  let providers = $state<Provider[]>([]);
  let providersLoading = $state(false);
  let providersError = $state<string | null>(null);
  const modelCount = $derived(countModels(providers));

  async function loadProviders(): Promise<void> {
    providersLoading = true;
    providersError = null;
    try {
      providers = await fetchProviders(resolvedClient);
    } catch (err) {
      providersError = err instanceof Error ? err.message : 'Failed to load providers';
    } finally {
      providersLoading = false;
    }
  }

  // --- Open / close + focus management -------------------------------------
  let dialogEl = $state<HTMLDivElement | null>(null);
  let previouslyFocused: HTMLElement | null = null;

  function requestClose(): void {
    open = false;
    onclose?.();
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      requestClose();
      return;
    }
    if (event.key === 'Tab') trapFocus(event);
  }

  function focusableElements(): HTMLElement[] {
    if (!dialogEl) return [];
    const selector =
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    return Array.from(dialogEl.querySelectorAll<HTMLElement>(selector));
  }

  function trapFocus(event: KeyboardEvent): void {
    const focusable = focusableElements();
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

  // React to open transitions: snapshot focus, load data, focus the dialog.
  $effect(() => {
    if (!open) return;
    if (typeof document !== 'undefined') {
      previouslyFocused = document.activeElement as HTMLElement | null;
    }
    serverUrlDraft = getServerUrl();
    serverUrlError = null;
    void loadProviders();

    queueMicrotask(() => {
      const focusable = focusableElements();
      (focusable[0] ?? dialogEl)?.focus();
    });

    return () => previouslyFocused?.focus?.();
  });
</script>

{#if open}
  <div class="settings-overlay" role="presentation" onclick={requestClose}>
    <div
      class="glass-surface glass-surface--floating settings-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-title"
      tabindex={-1}
      bind:this={dialogEl}
      onkeydown={handleKeydown}
      onclick={(event: MouseEvent) => event.stopPropagation()}
    >
      <header class="dialog-header">
        <h2 id="settings-title" class="dialog-title">Settings</h2>
        <button
          type="button"
          class="icon-btn close-btn"
          aria-label="Close settings"
          title="Close"
          onclick={requestClose}
        >
          <HugeiconsIcon icon={Cancel01Icon} size={18} color="currentColor" strokeWidth={1.5} />
        </button>
      </header>

      <div class="dialog-body">
        <!-- Appearance ------------------------------------------------------ -->
        <section class="group" aria-labelledby="group-appearance">
          <h3 id="group-appearance" class="group-title">
            <HugeiconsIcon icon={PaintBoardIcon} size={16} color="currentColor" strokeWidth={1.5} />
            Appearance
          </h3>

          <div class="field">
            <span class="field-label" id="label-theme">Theme</span>
            <div class="segmented" role="radiogroup" aria-labelledby="label-theme">
              {#each THEME_OPTIONS as opt (opt.value)}
                <button
                  type="button"
                  role="radio"
                  aria-checked={theme.current === opt.value}
                  class="segment"
                  class:active={theme.current === opt.value}
                  onclick={() => setTheme(opt.value)}
                >
                  <HugeiconsIcon icon={opt.icon} size={15} color="currentColor" strokeWidth={1.5} />
                  {opt.label}
                </button>
              {/each}
            </div>
          </div>

          <div class="field">
            <span class="field-label" id="label-motion">Motion</span>
            <div class="segmented" role="radiogroup" aria-labelledby="label-motion">
              {#each MOTION_OPTIONS as opt (opt.value)}
                <button
                  type="button"
                  role="radio"
                  aria-checked={settingsStore.current.motion === opt.value}
                  class="segment"
                  class:active={settingsStore.current.motion === opt.value}
                  onclick={() => settingsStore.setMotion(opt.value)}
                >
                  {opt.label}
                </button>
              {/each}
            </div>
          </div>

          <div class="field field--row">
            <label class="field-label" for="density-toggle">Compact density</label>
            <button
              id="density-toggle"
              type="button"
              role="switch"
              aria-label="Compact density"
              aria-checked={settingsStore.current.density === 'compact'}
              class="switch"
              class:on={settingsStore.current.density === 'compact'}
              onclick={() =>
                settingsStore.setDensity(
                  (settingsStore.current.density === 'compact' ? 'comfortable' : 'compact') as Density
                )}
            >
              <span class="switch-thumb"></span>
            </button>
          </div>
        </section>

        <!-- Server ---------------------------------------------------------- -->
        <section class="group" aria-labelledby="group-server">
          <h3 id="group-server" class="group-title">
            <HugeiconsIcon icon={CloudServerIcon} size={16} color="currentColor" strokeWidth={1.5} />
            Server
          </h3>

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
              <button type="button" class="action-btn" onclick={testConnection}>
                {#if connectionStatus === 'connecting'}
                  <span class="spin">
                    <HugeiconsIcon icon={Loading03Icon} size={14} color="currentColor" strokeWidth={1.5} />
                  </span>
                {:else}
                  Test
                {/if}
              </button>
            </div>
            {#if serverUrlError}
              <p id="server-url-error" class="field-error" role="alert">{serverUrlError}</p>
            {/if}
            <p class="field-hint">Port: {serverPort}</p>
          </div>

          <div class="start-server-card" aria-labelledby="start-server-title">
            <h4 id="start-server-title" class="subgroup-title">Start Server</h4>
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

          <div class="conn-status" aria-live="polite">
            {#if connectionStatus === 'connected'}
              <span class="conn ok">
                <HugeiconsIcon icon={CheckmarkCircle02Icon} size={15} color="currentColor" strokeWidth={1.5} />
                Connected
              </span>
            {:else if connectionStatus === 'error'}
              <span class="conn err">
                <HugeiconsIcon icon={Alert02Icon} size={15} color="currentColor" strokeWidth={1.5} />
                {connectionError ?? 'Connection error'}
              </span>
            {:else if connectionStatus === 'connecting'}
              <span class="conn muted">Connecting…</span>
            {:else}
              <span class="conn muted">Not connected</span>
            {/if}
          </div>
        </section>

        <!-- Providers & models --------------------------------------------- -->
        <section class="group" aria-labelledby="group-providers">
          <h3 id="group-providers" class="group-title">
            <HugeiconsIcon icon={AiBrain01Icon} size={16} color="currentColor" strokeWidth={1.5} />
            Providers &amp; Models
            {#if !providersLoading && !providersError && providers.length > 0}
              <span class="count-badge">{providers.length} providers · {modelCount} models</span>
            {/if}
          </h3>

          {#if providersLoading}
            <div class="providers-loading" aria-busy="true" aria-label="Loading providers">
              {#each Array.from({ length: 3 }) as _, i (i)}
                <div class="sk-row" aria-hidden="true">
                  <div class="sk-line sk-name"></div>
                  <div class="sk-line sk-sub"></div>
                </div>
              {/each}
            </div>
          {:else if providersError}
            <div class="provider-state state--error" role="alert">
              <HugeiconsIcon icon={Alert02Icon} size={20} color="currentColor" strokeWidth={1.5} />
              <p class="state-detail">{providersError}</p>
              <button type="button" class="action-btn" onclick={loadProviders}>
                <HugeiconsIcon icon={RefreshIcon} size={14} color="currentColor" strokeWidth={1.5} />
                Retry
              </button>
            </div>
          {:else if providers.length === 0}
            <div class="provider-state">
              <p class="state-detail">No providers configured on the server.</p>
            </div>
          {:else}
            <ul class="provider-list">
              {#each providers as provider (provider.id)}
                <li class="provider">
                  <p class="provider-name">{provider.name}</p>
                  <ul class="model-list">
                    {#each provider.models as model (model.id)}
                      <li class="model">
                        <span class="model-name">{model.name}</span>
                        {#if formatContext(model.context)}
                          <span class="model-context">{formatContext(model.context)}</span>
                        {/if}
                      </li>
                    {/each}
                  </ul>
                </li>
              {/each}
            </ul>
          {/if}
        </section>
      </div>
    </div>
  </div>
{/if}

<style>
  .settings-overlay {
    position: fixed;
    inset: 0;
    z-index: 50;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
    background: rgba(0, 0, 0, 0.45);
    animation: overlay-in var(--transition-base) var(--ease-out);
  }

  .settings-dialog {
    width: min(32rem, 100%);
    max-height: min(85vh, 44rem);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    outline: none;
    animation: dialog-in var(--transition-base) var(--ease-out);
  }

  .dialog-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem 1.25rem;
    border-bottom: 1px solid var(--border);
  }

  .dialog-title {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .icon-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 2rem;
    height: 2rem;
    padding: 0;
    border: 1px solid transparent;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
    transition:
      color var(--transition-fast),
      background-color var(--transition-fast);
  }

  .icon-btn:hover {
    color: var(--text-primary);
    background-color: var(--bg-surface);
  }

  .icon-btn:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: 2px;
  }

  .dialog-body {
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 1rem 1.25rem 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .group {
    display: flex;
    flex-direction: column;
    gap: 0.875rem;
  }

  .group-title {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin: 0;
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--text-secondary);
  }

  .count-badge {
    margin-left: auto;
    font-size: 0.6875rem;
    font-weight: 500;
    letter-spacing: 0;
    text-transform: none;
    color: var(--text-muted);
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .field--row {
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
  }

  .field-label {
    font-size: 0.8125rem;
    font-weight: 500;
    color: var(--text-primary);
  }

  /* ---- Segmented control ---- */
  .segmented {
    display: inline-flex;
    gap: 0.25rem;
    padding: 0.25rem;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background-color: var(--bg-base);
    width: fit-content;
  }

  .segment {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.4rem 0.75rem;
    font-size: 0.8125rem;
    font-weight: 500;
    color: var(--text-secondary);
    background: transparent;
    border: none;
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition:
      color var(--transition-fast),
      background-color var(--transition-fast);
  }

  .segment:hover {
    color: var(--text-primary);
  }

  .segment.active {
    color: var(--accent-foreground);
    background-color: var(--accent);
  }

  .segment:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: 2px;
  }

  /* ---- Switch ---- */
  .switch {
    position: relative;
    width: 2.5rem;
    height: 1.5rem;
    padding: 0;
    border: 1px solid var(--border);
    border-radius: var(--radius-full);
    background-color: var(--bg-surface);
    cursor: pointer;
    transition: background-color var(--transition-base);
    flex-shrink: 0;
  }

  .switch.on {
    background-color: var(--accent);
    border-color: var(--focus-ring);
  }

  .switch-thumb {
    position: absolute;
    top: 50%;
    left: 0.1875rem;
    width: 1.0625rem;
    height: 1.0625rem;
    border-radius: var(--radius-full);
    background-color: var(--text-primary);
    transform: translate(0, -50%);
    transition: transform var(--transition-base) var(--ease-out);
  }

  .switch.on .switch-thumb {
    background-color: var(--accent-foreground);
    transform: translate(1rem, -50%);
  }

  .switch:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: 2px;
  }

  /* ---- Text input + actions ---- */
  .url-row {
    display: flex;
    gap: 0.5rem;
  }

  .text-input {
    flex: 1 1 auto;
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

  .conn-status {
    font-size: 0.8125rem;
  }

  .conn {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
  }

  .conn.ok {
    color: var(--accent-text);
  }

  .conn.err {
    color: var(--danger-text);
  }

  .conn.muted {
    color: var(--text-muted);
  }

  /* ---- Providers list ---- */
  .provider-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .provider {
    padding: 0.75rem;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background-color: var(--bg-base);
  }

  .provider-name {
    margin: 0 0 0.5rem;
    font-size: 0.8125rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .model-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .model {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.75rem;
    font-size: 0.78125rem;
  }

  .model-name {
    color: var(--text-secondary);
  }

  .model-context {
    color: var(--text-muted);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .provider-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: 0.5rem;
    padding: 1.5rem 1rem;
    color: var(--text-muted);
  }

  .provider-state.state--error {
    color: var(--danger-text);
  }

  .state-detail {
    margin: 0;
    font-size: 0.8125rem;
    color: var(--text-muted);
  }

  /* ---- Skeletons ---- */
  .providers-loading {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .sk-row {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    padding: 0.75rem;
    border: 1px solid var(--border);
    border-radius: var(--radius);
  }

  .sk-line {
    height: 0.625rem;
    border-radius: var(--radius-full);
    background: linear-gradient(
      90deg,
      var(--bg-surface) 25%,
      var(--bg-elevated) 50%,
      var(--bg-surface) 75%
    );
    background-size: 200% 100%;
    animation: shimmer 1.4s ease-in-out infinite;
  }

  .sk-name {
    width: 45%;
  }

  .sk-sub {
    width: 70%;
    height: 0.5rem;
  }

  .spin {
    display: inline-flex;
    animation: spin 0.9s linear infinite;
  }

  @keyframes overlay-in {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  @keyframes dialog-in {
    from {
      opacity: 0;
      transform: translateY(8px) scale(0.98);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  @keyframes shimmer {
    from {
      background-position: 200% 0;
    }
    to {
      background-position: -200% 0;
    }
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .settings-overlay,
    .settings-dialog {
      animation: none;
    }
    .switch-thumb {
      transition: none;
    }
    .sk-line,
    .spin {
      animation: none;
    }
  }
</style>
