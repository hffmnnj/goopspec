<script lang="ts">
  import { onMount } from 'svelte';
  import { HugeiconsIcon } from '@hugeicons/svelte';
  import {
    Loading03Icon,
    Alert02Icon,
    Copy01Icon,
    Download04Icon,
    CheckmarkCircle02Icon,
    Database02Icon,
    CheckmarkCircle01Icon,
    AlertCircleIcon
  } from '@hugeicons/core-free-icons';
  import { createClient } from '$lib/api/client.js';
  import {
    loadMergedGoopspecConfig,
    saveGoopspecConfig,
    copyGoopspecJson,
    toGoopspecJson,
    type GoopSpecConfig,
    type MergedGoopSpecConfig,
    type ConfigSource
  } from '$lib/api/goopspec-config.js';

  const client = createClient();

  let config = $state<MergedGoopSpecConfig | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let saving = $state(false);
  let saveError = $state<string | null>(null);
  let copied = $state(false);
  let copyTimer: ReturnType<typeof setTimeout> | null = null;

  /** Local editable draft for the defaultModel text input. */
  let defaultModelDraft = $state('');

  /** Whether the memory setup card should surface (memory off or unconfigured). */
  const memoryNeedsSetup = $derived(config !== null && config.raw.memoryEnabled !== true);

  /** Async-resolved presence of the local memory database files. */
  type DbStatus = 'checking' | 'found' | 'not-found';
  let dbStatus = $state<DbStatus>('checking');

  const MEMORY_DB_PATHS = ['.goopspec/goopspec.db', '.goopspec/memory.db'] as const;

  // Probe for the memory database files once config is available and memory is
  // not yet enabled. Any successful read (even of binary content) means the file
  // exists; an error/404 means it has not been created yet. The check is async
  // and never blocks rendering of the card.
  $effect(() => {
    if (!memoryNeedsSetup) return;
    let cancelled = false;
    dbStatus = 'checking';
    void (async () => {
      for (const path of MEMORY_DB_PATHS) {
        try {
          await client.readFile(path);
          if (!cancelled) dbStatus = 'found';
          return;
        } catch {
          // Try the next candidate path.
        }
      }
      if (!cancelled) dbStatus = 'not-found';
    })();
    return () => {
      cancelled = true;
    };
  });

  const ENFORCEMENT_OPTIONS: { value: NonNullable<GoopSpecConfig['enforcement']>; label: string }[] = [
    { value: 'assist', label: 'Assist' },
    { value: 'warn', label: 'Warn' },
    { value: 'strict', label: 'Strict' }
  ];

  onMount(async () => {
    try {
      config = await loadMergedGoopspecConfig(client);
      defaultModelDraft = config.raw.defaultModel ?? '';
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load config';
    } finally {
      loading = false;
    }
  });

  async function updateField(updates: Partial<GoopSpecConfig>): Promise<void> {
    saving = true;
    saveError = null;
    try {
      await saveGoopspecConfig(client, updates);
      if (config) {
        config = {
          raw: { ...config.raw, ...updates },
          // Edits via write-back land in the project goopspec namespace.
          sources: { ...config.sources, ...sourcesForUpdate(updates) }
        };
      }
    } catch (err) {
      saveError = err instanceof Error ? err.message : 'Save failed';
    } finally {
      saving = false;
    }
  }

  /** Once a field is written back it is sourced from the project goopspec namespace. */
  function sourcesForUpdate(
    updates: Partial<GoopSpecConfig>
  ): Partial<Record<keyof GoopSpecConfig, ConfigSource>> {
    const next: Partial<Record<keyof GoopSpecConfig, ConfigSource>> = {};
    for (const key of Object.keys(updates) as Array<keyof GoopSpecConfig>) {
      next[key] = 'project';
    }
    return next;
  }

  function commitDefaultModel(): void {
    const next = defaultModelDraft.trim();
    if (next === (config?.raw.defaultModel ?? '')) return;
    void updateField({ defaultModel: next === '' ? undefined : next });
  }

  function handleModelKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      (event.currentTarget as HTMLInputElement).blur();
    }
  }

  async function copyJson(): Promise<void> {
    if (!config) return;
    const ok = await copyGoopspecJson(config.raw);
    if (!ok) return;
    copied = true;
    if (copyTimer) clearTimeout(copyTimer);
    copyTimer = setTimeout(() => {
      copied = false;
      copyTimer = null;
    }, 1600);
  }

  /** Data URL for downloading the merged goopspec.json. */
  const downloadHref = $derived(
    config ? `data:application/json;charset=utf-8,${encodeURIComponent(toGoopspecJson(config.raw))}` : ''
  );

  /** Helper to read a field's source, falling back to built-in. */
  function sourceOf(field: keyof GoopSpecConfig): ConfigSource | undefined {
    return config?.sources[field];
  }
</script>

<section class="settings-section" aria-labelledby="goopspec-heading">
  <header class="section-header">
    <h2 id="goopspec-heading" class="section-title">GoopSpec</h2>
    <p class="section-subtitle">Memory, enforcement, ADL, and general configuration.</p>
  </header>

  {#if loading}
    <div class="state-row" aria-live="polite">
      <span class="spin">
        <HugeiconsIcon icon={Loading03Icon} size={18} color="currentColor" strokeWidth={1.5} />
      </span>
      <span>Loading configuration…</span>
    </div>
  {:else if error}
    <div class="state-row state-row--error" role="alert">
      <HugeiconsIcon icon={Alert02Icon} size={18} color="currentColor" strokeWidth={1.5} />
      <span>{error}</span>
    </div>
  {:else if config}
    {#if saveError}
      <div class="save-banner" role="alert">
        <HugeiconsIcon icon={Alert02Icon} size={16} color="currentColor" strokeWidth={1.5} />
        <span>{saveError}</span>
      </div>
    {/if}

    <!-- Memory setup card (only when memory is off / unconfigured) ---------- -->
    {#if memoryNeedsSetup}
      <div
        class="memory-card"
        class:memory-card--warn={dbStatus === 'not-found'}
        role="region"
        aria-labelledby="memory-setup-title"
      >
        <div class="memory-card__head">
          <span class="memory-card__icon" aria-hidden="true">
            <HugeiconsIcon icon={Database02Icon} size={20} color="currentColor" strokeWidth={1.5} />
          </span>
          <div class="memory-card__heading">
            <h3 id="memory-setup-title" class="memory-card__title">Memory setup</h3>
            {@render badge(sourceOf('memoryEnabled'))}
          </div>
        </div>

        <p class="memory-card__desc">
          Memory is disabled or not yet configured. Enable it to allow GoopSpec agents to
          persist observations and decisions across sessions.
        </p>

        <div class="memory-card__status" aria-live="polite">
          {#if dbStatus === 'checking'}
            <span class="status-dot status-dot--checking" aria-hidden="true">
              <span class="spin">
                <HugeiconsIcon icon={Loading03Icon} size={14} color="currentColor" strokeWidth={1.5} />
              </span>
            </span>
            <span class="status-text">Database: checking…</span>
          {:else if dbStatus === 'found'}
            <span class="status-dot status-dot--found" aria-hidden="true">
              <HugeiconsIcon icon={CheckmarkCircle01Icon} size={14} color="currentColor" strokeWidth={1.5} />
            </span>
            <span class="status-text">Database: found</span>
          {:else}
            <span class="status-dot status-dot--missing" aria-hidden="true">
              <HugeiconsIcon icon={AlertCircleIcon} size={14} color="currentColor" strokeWidth={1.5} />
            </span>
            <span class="status-text">Database: not yet created</span>
          {/if}
        </div>

        <div class="memory-card__actions">
          <button
            type="button"
            class="enable-btn"
            disabled={saving}
            onclick={() => updateField({ memoryEnabled: true })}
          >
            {#if saving}
              <span class="spin">
                <HugeiconsIcon icon={Loading03Icon} size={16} color="currentColor" strokeWidth={1.5} />
              </span>
              Enabling…
            {:else}
              <HugeiconsIcon icon={Database02Icon} size={16} color="currentColor" strokeWidth={1.5} />
              Enable memory
            {/if}
          </button>
        </div>
      </div>
    {/if}

    <div class="fields">
      <!-- Project name (read-only) ----------------------------------------- -->
      <div class="field field--row">
        <div class="field-meta">
          <span class="field-label">Project name</span>
          {@render badge(sourceOf('projectName'))}
        </div>
        <span class="readonly-value">{config.raw.projectName ?? '—'}</span>
      </div>

      <!-- Default model ---------------------------------------------------- -->
      <div class="field">
        <div class="field-meta">
          <label class="field-label" for="default-model">Default model</label>
          {@render badge(sourceOf('defaultModel'))}
        </div>
        <input
          id="default-model"
          class="text-input"
          type="text"
          autocomplete="off"
          spellcheck="false"
          placeholder="provider/model-id"
          bind:value={defaultModelDraft}
          onblur={commitDefaultModel}
          onkeydown={handleModelKeydown}
          disabled={saving}
        />
        <p class="field-hint">Used when an agent has no explicit model override.</p>
      </div>

      <!-- Memory enabled --------------------------------------------------- -->
      <div class="field field--row">
        <div class="field-meta">
          <label class="field-label" for="memory-toggle">Memory enabled</label>
          {@render badge(sourceOf('memoryEnabled'))}
        </div>
        <button
          id="memory-toggle"
          type="button"
          role="switch"
          aria-label="Memory enabled"
          aria-checked={config.raw.memoryEnabled === true}
          class="switch"
          class:on={config.raw.memoryEnabled === true}
          disabled={saving}
          onclick={() => updateField({ memoryEnabled: !(config?.raw.memoryEnabled === true) })}
        >
          <span class="switch-thumb"></span>
        </button>
      </div>

      <!-- Enforcement ------------------------------------------------------ -->
      <div class="field">
        <div class="field-meta">
          <span class="field-label" id="label-enforcement">Enforcement</span>
          {@render badge(sourceOf('enforcement'))}
        </div>
        <div class="segmented" role="radiogroup" aria-labelledby="label-enforcement">
          {#each ENFORCEMENT_OPTIONS as opt (opt.value)}
            <button
              type="button"
              role="radio"
              aria-checked={config.raw.enforcement === opt.value}
              class="segment"
              class:active={config.raw.enforcement === opt.value}
              disabled={saving}
              onclick={() => updateField({ enforcement: opt.value })}
            >
              {opt.label}
            </button>
          {/each}
        </div>
        <p class="field-hint">How strictly GoopSpec enforces phase rules and gates.</p>
      </div>

      <!-- ADL enabled ------------------------------------------------------ -->
      <div class="field field--row">
        <div class="field-meta">
          <label class="field-label" for="adl-toggle">ADL enabled</label>
          {@render badge(sourceOf('adlEnabled'))}
        </div>
        <button
          id="adl-toggle"
          type="button"
          role="switch"
          aria-label="ADL enabled"
          aria-checked={config.raw.adlEnabled === true}
          class="switch"
          class:on={config.raw.adlEnabled === true}
          disabled={saving}
          onclick={() => updateField({ adlEnabled: !(config?.raw.adlEnabled === true) })}
        >
          <span class="switch-thumb"></span>
        </button>
      </div>

      <!-- Gitignore .goopspec ---------------------------------------------- -->
      <div class="field field--row">
        <div class="field-meta">
          <label class="field-label" for="gitignore-toggle">Gitignore .goopspec</label>
          {@render badge(sourceOf('gitignoreGoopspec'))}
        </div>
        <button
          id="gitignore-toggle"
          type="button"
          role="switch"
          aria-label="Gitignore .goopspec"
          aria-checked={config.raw.gitignoreGoopspec === true}
          class="switch"
          class:on={config.raw.gitignoreGoopspec === true}
          disabled={saving}
          onclick={() => updateField({ gitignoreGoopspec: !(config?.raw.gitignoreGoopspec === true) })}
        >
          <span class="switch-thumb"></span>
        </button>
      </div>
    </div>

    <!-- Copy / download fallback ------------------------------------------- -->
    <div class="export-card" aria-labelledby="export-title">
      <h3 id="export-title" class="subgroup-title">Export configuration</h3>
      <p class="field-hint">
        Copy or download the merged <code>goopspec.json</code> to apply changes manually.
      </p>
      <div class="export-actions">
        <button type="button" class="action-btn" onclick={copyJson}>
          {#if copied}
            <HugeiconsIcon icon={CheckmarkCircle02Icon} size={14} color="currentColor" strokeWidth={1.5} />
            Copied!
          {:else}
            <HugeiconsIcon icon={Copy01Icon} size={14} color="currentColor" strokeWidth={1.5} />
            Copy goopspec.json
          {/if}
        </button>
        <a class="action-btn" href={downloadHref} download="goopspec.json">
          <HugeiconsIcon icon={Download04Icon} size={14} color="currentColor" strokeWidth={1.5} />
          Download
        </a>
      </div>
    </div>

    <p class="global-note">
      Global config at <code>~/.config/opencode/goopspec.json</code> is not readable from the browser.
    </p>
  {/if}
</section>

{#snippet badge(source: ConfigSource | undefined)}
  {#if source === 'project'}
    <span class="source-badge source-badge--project">goopspec.json</span>
  {:else if source === 'internal'}
    <span class="source-badge source-badge--internal">.goopspec/config.json</span>
  {:else if source === 'global'}
    <span class="source-badge source-badge--global">~/.config (global)</span>
  {:else}
    <span class="source-badge source-badge--builtin">built-in</span>
  {/if}
{/snippet}

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

  /* ---- Async states ---- */
  .state-row {
    display: inline-flex;
    align-items: center;
    gap: 0.625rem;
    align-self: flex-start;
    padding: 0.75rem 1rem;
    font-size: 0.875rem;
    color: var(--text-secondary);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background-color: var(--bg-elevated);
  }

  .state-row--error {
    color: var(--danger-text);
    border-color: color-mix(in srgb, var(--danger-text) 30%, var(--border));
  }

  .save-banner {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    align-self: flex-start;
    padding: 0.5rem 0.875rem;
    font-size: 0.8125rem;
    color: var(--danger-text);
    border: 1px solid color-mix(in srgb, var(--danger-text) 30%, var(--border));
    border-radius: var(--radius);
    background-color: var(--bg-elevated);
  }

  /* ---- Memory setup card ---- */
  .memory-card {
    display: flex;
    flex-direction: column;
    gap: 0.875rem;
    padding: 1.5rem;
    border: 1px solid var(--border);
    border-left: 3px solid var(--accent);
    border-radius: var(--radius-lg, var(--radius));
    background-color: var(--bg-elevated);
  }

  .memory-card--warn {
    border-left-color: var(--warning-text, var(--danger-text));
  }

  .memory-card__head {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .memory-card__icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 2.25rem;
    height: 2.25rem;
    flex-shrink: 0;
    color: var(--accent-text, var(--accent));
    background-color: var(--accent-soft);
    border-radius: var(--radius);
  }

  .memory-card--warn .memory-card__icon {
    color: var(--warning-text, var(--danger-text));
    background-color: color-mix(
      in srgb,
      var(--warning-text, var(--danger-text)) 14%,
      transparent
    );
  }

  .memory-card__heading {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .memory-card__title {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
    letter-spacing: -0.01em;
    color: var(--text-primary);
  }

  .memory-card__desc {
    margin: 0;
    font-size: 0.875rem;
    line-height: 1.5;
    color: var(--text-secondary);
    max-width: 44ch;
  }

  .memory-card__status {
    display: inline-flex;
    align-items: center;
    gap: 0.4375rem;
    align-self: flex-start;
    padding: 0.3125rem 0.625rem;
    font-size: 0.75rem;
    border: 1px solid var(--border);
    border-radius: var(--radius-full);
    background-color: var(--bg-base);
  }

  .status-dot {
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .status-dot--found {
    color: var(--success-text, var(--accent-text, var(--accent)));
  }

  .status-dot--missing {
    color: var(--warning-text, var(--danger-text));
  }

  .status-dot--checking {
    color: var(--text-muted);
  }

  .status-text {
    color: var(--text-secondary);
    font-weight: 500;
  }

  .memory-card__actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .enable-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.4375rem;
    padding: 0.625rem 1.125rem;
    font: inherit;
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--accent-foreground);
    background-color: var(--accent);
    border: 1px solid var(--accent);
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition:
      background-color var(--transition-fast),
      box-shadow var(--transition-fast),
      transform var(--transition-fast);
  }

  .enable-btn:hover:not(:disabled) {
    background-color: color-mix(in srgb, var(--accent) 88%, black);
  }

  .enable-btn:active:not(:disabled) {
    transform: translateY(1px);
  }

  .enable-btn:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: 2px;
  }

  .enable-btn:disabled {
    cursor: not-allowed;
    opacity: 0.65;
  }

  /* ---- Fields ---- */
  .fields {
    display: flex;
    flex-direction: column;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 0.625rem;
    padding: 1rem 0;
    border-bottom: 1px solid var(--border);
  }

  .field:first-child {
    padding-top: 0;
  }

  .field:last-child {
    border-bottom: none;
  }

  .field--row {
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
  }

  .field-meta {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .field-label {
    font-size: 0.8125rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .field-hint {
    margin: 0;
    font-size: 0.75rem;
    color: var(--text-muted);
  }

  .readonly-value {
    font-size: 0.8125rem;
    color: var(--text-secondary);
    font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace);
  }

  /* ---- Source badges ---- */
  .source-badge {
    display: inline-flex;
    align-items: center;
    padding: 0.125rem 0.4375rem;
    font-size: 0.6875rem;
    font-weight: 500;
    line-height: 1.4;
    border-radius: var(--radius-full);
    border: 1px solid transparent;
    white-space: nowrap;
  }

  .source-badge--project {
    color: var(--accent-text);
    background-color: var(--accent-soft);
    border-color: color-mix(in srgb, var(--accent-text) 28%, transparent);
  }

  .source-badge--internal {
    color: var(--text-secondary);
    background-color: var(--bg-surface);
    border-color: var(--border);
  }

  .source-badge--global {
    color: var(--text-muted);
    background-color: var(--bg-surface);
    border-color: var(--border);
  }

  .source-badge--builtin {
    color: var(--text-muted);
    background-color: transparent;
    border-color: var(--border);
  }

  /* ---- Text input ---- */
  .text-input {
    width: 100%;
    max-width: 24rem;
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

  .text-input:disabled {
    opacity: 0.6;
    cursor: not-allowed;
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
    padding: 0.4rem 0.875rem;
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

  .segment:hover:not(:disabled) {
    color: var(--text-primary);
  }

  .segment.active {
    color: var(--accent-foreground);
    background-color: var(--accent);
  }

  .segment:disabled {
    cursor: not-allowed;
    opacity: 0.6;
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

  .switch:disabled {
    cursor: not-allowed;
    opacity: 0.6;
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

  /* ---- Export card ---- */
  .export-card {
    display: flex;
    flex-direction: column;
    gap: 0.625rem;
    padding: 1rem;
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

  .export-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .action-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.375rem;
    padding: 0.5rem 0.875rem;
    font-size: 0.8125rem;
    font-weight: 500;
    text-decoration: none;
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

  .global-note {
    margin: 0;
    font-size: 0.75rem;
    color: var(--text-muted);
  }

  code {
    font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace);
    font-size: 0.95em;
  }

  /* ---- Spinner ---- */
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
    .segment,
    .switch,
    .switch-thumb,
    .action-btn,
    .enable-btn,
    .text-input {
      transition: none;
    }

    .spin {
      animation: none;
    }
  }
</style>
