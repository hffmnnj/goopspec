<script lang="ts">
  import { onMount } from 'svelte';
  import { HugeiconsIcon } from '@hugeicons/svelte';
  import {
    Loading03Icon,
    Alert02Icon,
    Copy01Icon,
    Download04Icon,
    CheckmarkCircle02Icon,
    InformationCircleIcon,
    File01Icon
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

  const RAW_FILES = [
    { path: 'goopspec.json', label: 'goopspec.json' },
    { path: '.goopspec/config.json', label: '.goopspec/config.json' }
  ] as const;

  type RawFileState =
    | { status: 'loading' }
    | { status: 'found'; content: string }
    | { status: 'missing' };

  let config = $state<MergedGoopSpecConfig | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let saving = $state(false);
  let saveError = $state<string | null>(null);
  let copied = $state(false);
  let copyTimer: ReturnType<typeof setTimeout> | null = null;

  /** Raw file contents keyed by path. */
  let rawFiles = $state<Record<string, RawFileState>>({
    'goopspec.json': { status: 'loading' },
    '.goopspec/config.json': { status: 'loading' }
  });

  /** Local editable draft for the defaultModel text input. */
  let defaultModelDraft = $state('');

  const ENFORCEMENT_OPTIONS: { value: NonNullable<GoopSpecConfig['enforcement']>; label: string }[] = [
    { value: 'assist', label: 'Assist' },
    { value: 'warn', label: 'Warn' },
    { value: 'strict', label: 'Strict' }
  ];

  /** Pretty-print raw JSON when valid; otherwise return text verbatim. */
  function formatRaw(content: string): string {
    try {
      return JSON.stringify(JSON.parse(content), null, 2);
    } catch {
      return content;
    }
  }

  async function loadRawFile(path: string): Promise<void> {
    try {
      const content = await client.readFile(path);
      rawFiles = { ...rawFiles, [path]: { status: 'found', content: formatRaw(content) } };
    } catch {
      rawFiles = { ...rawFiles, [path]: { status: 'missing' } };
    }
  }

  onMount(async () => {
    try {
      config = await loadMergedGoopspecConfig(client);
      defaultModelDraft = config.raw.defaultModel ?? '';
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load config';
    } finally {
      loading = false;
    }
    // Raw file reads run independently — they never block the merged view.
    void Promise.all(RAW_FILES.map((f) => loadRawFile(f.path)));
  });

  async function updateField(updates: Partial<GoopSpecConfig>): Promise<void> {
    saving = true;
    saveError = null;
    try {
      await saveGoopspecConfig(client, updates);
      if (config) {
        config = {
          ...config,
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

<section class="settings-section" aria-labelledby="project-heading">
  <header class="section-header">
    <h2 id="project-heading" class="section-title">Project</h2>
    <p class="section-subtitle">Per-project config files, effective values, and raw inspection.</p>
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

    <!-- Global config note ------------------------------------------------- -->
    <div class="info-box" role="note">
      <HugeiconsIcon icon={InformationCircleIcon} size={18} color="currentColor" strokeWidth={1.5} />
      <p class="info-box__text">
        Global config (<code>~/.config/opencode/goopspec.json</code>) is not readable from the
        browser. Edit it manually. Values below merge <code>.goopspec/config.json</code> (internal)
        and <code>goopspec.json</code> (project), where project wins.
      </p>
    </div>

    <!-- Effective merged config -------------------------------------------- -->
    <div class="subgroup">
      <h3 class="subgroup-title">Effective configuration</h3>
      <div class="fields">
        <!-- Default model -------------------------------------------------- -->
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
        </div>

        <!-- Memory enabled ------------------------------------------------- -->
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

        <!-- Enforcement ---------------------------------------------------- -->
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
        </div>

        <!-- ADL enabled ---------------------------------------------------- -->
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

        <!-- Gitignore .goopspec -------------------------------------------- -->
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
    </div>

    <!-- Raw file breakdown ------------------------------------------------- -->
    <div class="subgroup">
      <h3 class="subgroup-title">Raw config files</h3>
      {#each RAW_FILES as file (file.path)}
        {@const state = rawFiles[file.path]}
        <details class="raw-file" open={state.status === 'found'}>
          <summary class="raw-file__summary">
            <span class="raw-file__name">
              <HugeiconsIcon icon={File01Icon} size={15} color="currentColor" strokeWidth={1.5} />
              <code>{file.label}</code>
            </span>
            {#if state.status === 'loading'}
              <span class="raw-file__status raw-file__status--loading">
                <span class="spin">
                  <HugeiconsIcon icon={Loading03Icon} size={13} color="currentColor" strokeWidth={1.5} />
                </span>
                Reading…
              </span>
            {:else if state.status === 'found'}
              <span class="raw-file__status raw-file__status--found">Found</span>
            {:else}
              <span class="raw-file__status raw-file__status--missing">File not found</span>
            {/if}
          </summary>
          <div class="raw-file__body">
            {#if state.status === 'found'}
              <pre class="code-block"><code>{state.content}</code></pre>
            {:else if state.status === 'missing'}
              <p class="raw-file__empty">
                <code>{file.label}</code> does not exist in this project.
              </p>
            {:else}
              <p class="raw-file__empty">Reading file…</p>
            {/if}
          </div>
        </details>
      {/each}
    </div>

    <!-- Copy / download ---------------------------------------------------- -->
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

  /* ---- Info box ---- */
  .info-box {
    display: flex;
    align-items: flex-start;
    gap: 0.625rem;
    padding: 0.875rem 1rem;
    color: var(--text-secondary);
    border: 1px solid var(--border);
    border-left: 3px solid var(--accent);
    border-radius: var(--radius);
    background-color: var(--bg-elevated);
  }

  .info-box :global(svg) {
    flex-shrink: 0;
    margin-top: 0.0625rem;
    color: var(--accent-text, var(--accent));
  }

  .info-box__text {
    margin: 0;
    font-size: 0.8125rem;
    line-height: 1.55;
  }

  /* ---- Subgroups ---- */
  .subgroup {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .subgroup-title {
    margin: 0;
    font-size: 0.8125rem;
    font-weight: 600;
    letter-spacing: 0.01em;
    color: var(--text-primary);
  }

  /* ---- Fields ---- */
  .fields {
    display: flex;
    flex-direction: column;
    padding: 0 1rem;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background-color: var(--bg-base);
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 0.625rem;
    padding: 1rem 0;
    border-bottom: 1px solid var(--border);
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
    background-color: var(--bg-elevated);
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
    background-color: var(--bg-elevated);
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

  /* ---- Raw files ---- */
  .raw-file {
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background-color: var(--bg-base);
    overflow: hidden;
  }

  .raw-file + .raw-file {
    margin-top: 0.5rem;
  }

  .raw-file__summary {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.75rem 1rem;
    cursor: pointer;
    list-style: none;
    user-select: none;
  }

  .raw-file__summary::-webkit-details-marker {
    display: none;
  }

  .raw-file__summary:hover {
    background-color: var(--bg-elevated);
  }

  .raw-file__summary:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: -2px;
  }

  .raw-file__name {
    display: inline-flex;
    align-items: center;
    gap: 0.4375rem;
    color: var(--text-primary);
    font-size: 0.8125rem;
    font-weight: 500;
  }

  .raw-file__status {
    display: inline-flex;
    align-items: center;
    gap: 0.3125rem;
    font-size: 0.6875rem;
    font-weight: 500;
    padding: 0.125rem 0.4375rem;
    border-radius: var(--radius-full);
    border: 1px solid transparent;
    white-space: nowrap;
  }

  .raw-file__status--found {
    color: var(--success-text, var(--accent-text, var(--accent)));
    background-color: var(--accent-soft);
    border-color: color-mix(in srgb, var(--accent-text, var(--accent)) 24%, transparent);
  }

  .raw-file__status--missing {
    color: var(--text-muted);
    background-color: var(--bg-surface);
    border-color: var(--border);
  }

  .raw-file__status--loading {
    color: var(--text-muted);
  }

  .raw-file__body {
    padding: 0 1rem 1rem;
    border-top: 1px solid var(--border);
  }

  .raw-file__empty {
    margin: 0.875rem 0 0;
    font-size: 0.8125rem;
    color: var(--text-muted);
  }

  .code-block {
    margin: 0.875rem 0 0;
    padding: 0.875rem 1rem;
    max-height: 24rem;
    overflow: auto;
    font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace);
    font-size: 0.75rem;
    line-height: 1.6;
    color: var(--text-secondary);
    background-color: var(--bg-elevated);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    white-space: pre;
    tab-size: 2;
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
    .text-input,
    .raw-file__summary {
      transition: none;
    }

    .spin {
      animation: none;
    }
  }
</style>
