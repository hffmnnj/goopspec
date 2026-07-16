<script lang="ts">
  import { onMount } from 'svelte';
  import { HugeiconsIcon } from '@hugeicons/svelte';
  import { Loading03Icon, Alert02Icon, CheckmarkCircle02Icon } from '@hugeicons/core-free-icons';
  import { createClient } from '$lib/api/client.js';
  import { fetchProviders } from '$lib/api/providers.js';
  import type { Provider } from '$lib/api/types.js';
  import {
    loadProjectGoopspecConfig,
    replaceProjectAgentModels,
    type ConfigSource,
    type MergedProjectConfig
  } from '$lib/api/goopspec-config.js';

  let { data } = $props();

  const client = createClient();

  // Same project key as the agents page (T3.2): the encoded route segment.
  const projectId = $derived(data.projectParam);

  // Mirrors plugin AGENT_ROLES, grouped by tier for display.
  type TierGroup = { id: string; title: string; roles: string[] };

  const TIER_GROUPS: TierGroup[] = [
    {
      id: 'high',
      title: 'High tier',
      roles: ['orchestrator', 'planner', 'executor-high', 'executor-frontend-high']
    },
    {
      id: 'medium',
      title: 'Medium tier',
      roles: ['executor-medium', 'executor-frontend-low', 'executor-low', 'verifier']
    },
    {
      id: 'specialized',
      title: 'Specialized',
      roles: ['researcher', 'explorer', 'debugger', 'tester', 'writer']
    }
  ];

  // Inlined from packages/opencode-plugin/src/features/setup/index.ts —
  // the plugin module is not importable from the browser bundle.
  const DEFAULT_MODEL_MAP: Record<string, string> = {
    orchestrator: 'anthropic/claude-opus-4-6',
    'executor-low': 'anthropic/claude-sonnet-4-6',
    'executor-medium': 'anthropic/claude-sonnet-4-6',
    'executor-high': 'anthropic/claude-opus-4-6',
    'executor-frontend-low': 'anthropic/claude-sonnet-4-6',
    'executor-frontend-high': 'anthropic/claude-opus-4-6',
    planner: 'anthropic/claude-opus-4-6',
    verifier: 'anthropic/claude-sonnet-4-6',
    researcher: 'anthropic/claude-sonnet-4-6',
    explorer: 'anthropic/claude-sonnet-4-6',
    debugger: 'anthropic/claude-sonnet-4-6',
    tester: 'anthropic/claude-sonnet-4-6',
    writer: 'anthropic/claude-sonnet-4-6'
  };

  let providers = $state<Provider[]>([]);
  let projectConfig = $state<MergedProjectConfig | null>(null);
  /** Persisted per-project overrides; `draft` is the unsaved working copy. */
  let savedOverrides = $state<Record<string, string>>({});
  let draft = $state<Record<string, string>>({});

  let loading = $state(true);
  let loadError = $state<string | null>(null);
  let providersError = $state<string | null>(null);
  let saving = $state(false);
  let saveError = $state<string | null>(null);
  let savedFlash = $state(false);
  let savedTimer: ReturnType<typeof setTimeout> | null = null;

  onMount(() => {
    void load();
    return () => {
      if (savedTimer) clearTimeout(savedTimer);
    };
  });

  /** Extract only the roles whose model is sourced from the project block. */
  function projectOverridesFrom(config: MergedProjectConfig): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [role, source] of Object.entries(config.agentModelSources)) {
      if (source === 'project') {
        const value = config.raw.agentModels?.[role];
        if (value) out[role] = value;
      }
    }
    return out;
  }

  async function load(): Promise<void> {
    loading = true;
    loadError = null;
    providersError = null;

    // Providers are optional (the page still works as a free-text fallback), so
    // a provider failure must not block the core config from rendering.
    const providerTask = (async () => {
      try {
        providers = await fetchProviders(client);
      } catch (err) {
        providersError = err instanceof Error ? err.message : 'Failed to load providers';
      }
    })();

    try {
      const merged = await loadProjectGoopspecConfig(client, projectId);
      projectConfig = merged;
      const overrides = projectOverridesFrom(merged);
      savedOverrides = overrides;
      draft = { ...overrides };
    } catch (err) {
      loadError = err instanceof Error ? err.message : 'Failed to load configuration';
    }

    await providerTask;
    loading = false;
  }

  /** Flat, provider-grouped option list for the select controls. */
  const modelOptions = $derived(
    providers.map((p) => ({
      providerName: p.name,
      models: p.models.map((m) => ({ value: `${p.id}/${m.id}`, label: m.name ?? m.id }))
    }))
  );

  /** Every known model value, to detect custom (unlisted) overrides. */
  const knownModelValues = $derived(
    new Set(modelOptions.flatMap((g) => g.models.map((m) => m.value)))
  );

  /**
   * The model a role inherits when it has no project override — i.e. the value
   * coming from global/internal config, or the built-in default. Project-sourced
   * values are intentionally skipped so this always reflects what the role would
   * fall back to once its override is removed.
   */
  function inheritedModel(role: string): string {
    const cfg = projectConfig;
    const inherited =
      cfg && cfg.agentModelSources[role] !== 'project'
        ? cfg.raw.agentModels?.[role]
        : undefined;
    return inherited ?? cfg?.raw.defaultModel ?? DEFAULT_MODEL_MAP[role] ?? 'unknown';
  }

  /**
   * The source the role inherits from when it has no project override. This is
   * "global" or "internal" when some readable config supplies the value, and
   * "built-in" when nothing is configured anywhere. Project sources are never
   * returned here — the override state is tracked separately by the draft.
   */
  function inheritedSource(role: string): ConfigSource {
    const source = projectConfig?.agentModelSources[role];
    if (source && source !== 'project') return source;
    return 'built-in';
  }

  /**
   * Human label for the inherited source, used in the badge and the dropdown's
   * reset option so the user can see exactly where the fallback comes from.
   */
  function inheritedSourceLabel(role: string): string {
    switch (inheritedSource(role)) {
      case 'global':
        return 'global';
      case 'internal':
        return 'internal';
      default:
        return 'built-in';
    }
  }

  /** The current draft override for a role (empty string = use Default). */
  function draftValue(role: string): string {
    return draft[role] ?? '';
  }

  function setDraft(role: string, value: string): void {
    const next = { ...draft };
    if (value === '') delete next[role];
    else next[role] = value;
    draft = next;
  }

  function handleChange(role: string, event: Event): void {
    setDraft(role, (event.currentTarget as HTMLSelectElement).value);
  }

  /** Normalised comparison so {} and {role:''} read as equal. */
  function sameOverrides(a: Record<string, string>, b: Record<string, string>): boolean {
    const ak = Object.keys(a).filter((k) => a[k]);
    const bk = Object.keys(b).filter((k) => b[k]);
    if (ak.length !== bk.length) return false;
    return ak.every((k) => a[k] === b[k]);
  }

  const isDirty = $derived(!sameOverrides(draft, savedOverrides));
  const overrideCount = $derived(Object.keys(draft).filter((k) => draft[k]).length);
  const hasSavedOverrides = $derived(Object.keys(savedOverrides).some((k) => savedOverrides[k]));

  function flashSaved(): void {
    savedFlash = true;
    if (savedTimer) clearTimeout(savedTimer);
    savedTimer = setTimeout(() => (savedFlash = false), 2400);
  }

  async function save(): Promise<void> {
    if (saving) return;
    saving = true;
    saveError = null;
    try {
      await replaceProjectAgentModels(client, projectId, draft);
      const persisted = Object.fromEntries(
        Object.entries(draft).filter(([, v]) => v)
      ) as Record<string, string>;
      savedOverrides = persisted;
      draft = { ...persisted };
      flashSaved();
    } catch (err) {
      saveError = err instanceof Error ? err.message : 'Save failed';
    } finally {
      saving = false;
    }
  }

  async function reset(): Promise<void> {
    if (saving) return;
    saving = true;
    saveError = null;
    try {
      await replaceProjectAgentModels(client, projectId, {});
      savedOverrides = {};
      draft = {};
      flashSaved();
    } catch (err) {
      saveError = err instanceof Error ? err.message : 'Reset failed';
    } finally {
      saving = false;
    }
  }
</script>

<section class="settings-section" aria-labelledby="project-models-heading">
  <header class="section-header">
    <h2 id="project-models-heading" class="section-title">Project Models</h2>
    <p class="section-subtitle">
      Override the AI model used for each GoopSpec role in this project. Leave a role at
      <strong>Default</strong> to use the global setting.
    </p>
  </header>

  {#if loading}
    <div class="state-row" aria-live="polite">
      <span class="spin">
        <HugeiconsIcon icon={Loading03Icon} size={18} color="currentColor" strokeWidth={1.5} />
      </span>
      <span>Loading configuration…</span>
    </div>
  {:else if loadError}
    <div class="state-row state-row--error" role="alert">
      <HugeiconsIcon icon={Alert02Icon} size={18} color="currentColor" strokeWidth={1.5} />
      <span>{loadError}</span>
    </div>
  {:else}
    {#if saveError}
      <div class="banner banner--error" role="alert">
        <HugeiconsIcon icon={Alert02Icon} size={16} color="currentColor" strokeWidth={1.5} />
        <span>{saveError}</span>
      </div>
    {/if}

    {#if providersError}
      <div class="banner banner--note" role="status">
        <HugeiconsIcon icon={Alert02Icon} size={14} color="currentColor" strokeWidth={1.5} />
        <span>Could not load the model list ({providersError}). Type a model id manually below.</span>
      </div>
    {/if}

    {#each TIER_GROUPS as group (group.id)}
      <section class="tier" aria-labelledby={`tier-${group.id}`}>
        <h3 id={`tier-${group.id}`} class="tier-title">{group.title}</h3>

        <div class="rows" role="list">
          {#each group.roles as role (role)}
            {@const override = draftValue(role)}
            <div class="row" role="listitem" class:row--overridden={!!override}>
              <div class="row__id">
                <span class="role-name">{role}</span>
                {#if override}
                  <span class="badge badge--override">project override</span>
                  <span class="effective" title={`Inherits ${inheritedModel(role)} from ${inheritedSourceLabel(role)}`}>
                    was {inheritedSourceLabel(role)} · {inheritedModel(role)}
                  </span>
                {:else if inheritedSource(role) === 'built-in'}
                  <span class="badge badge--builtin">built-in</span>
                  <span class="effective" title={inheritedModel(role)}>{inheritedModel(role)}</span>
                {:else}
                  <span class="badge badge--inherited">{inheritedSourceLabel(role)}</span>
                  <span class="effective" title={inheritedModel(role)}>{inheritedModel(role)}</span>
                {/if}
              </div>

              <div class="row__control">
                <label class="sr-only" for={`model-${role}`}>Model for {role}</label>
                <select
                  id={`model-${role}`}
                  class="model-select"
                  value={override}
                  disabled={saving}
                  onchange={(e) => handleChange(role, e)}
                >
                  <option value="">Use {inheritedSourceLabel(role)} default ({inheritedModel(role)})</option>
                  {#if override && !knownModelValues.has(override)}
                    <option value={override}>{override} (custom)</option>
                  {/if}
                  {#each modelOptions as providerGroup (providerGroup.providerName)}
                    <optgroup label={providerGroup.providerName}>
                      {#each providerGroup.models as opt (opt.value)}
                        <option value={opt.value}>{opt.label}</option>
                      {/each}
                    </optgroup>
                  {/each}
                </select>
              </div>
            </div>
          {/each}
        </div>
      </section>
    {/each}

    <footer class="actions">
      <div class="actions__status" aria-live="polite">
        {#if savedFlash}
          <span class="saved-flash">
            <HugeiconsIcon icon={CheckmarkCircle02Icon} size={16} color="currentColor" strokeWidth={1.5} />
            Saved
          </span>
        {:else if overrideCount > 0}
          <span class="override-count">
            {overrideCount} project override{overrideCount === 1 ? '' : 's'}
          </span>
        {:else}
          <span class="override-count override-count--muted">All roles inherit global defaults</span>
        {/if}
      </div>

      <div class="actions__buttons">
        <button
          type="button"
          class="btn btn--ghost"
          disabled={saving || !hasSavedOverrides}
          onclick={reset}
        >
          Reset to global defaults
        </button>
        <button
          type="button"
          class="btn btn--primary"
          disabled={saving || !isDirty}
          onclick={save}
        >
          {#if saving}
            <span class="spin">
              <HugeiconsIcon icon={Loading03Icon} size={16} color="currentColor" strokeWidth={1.5} />
            </span>
            Saving…
          {:else}
            Save changes
          {/if}
        </button>
      </div>
    </footer>

    <p class="global-note">
      Overrides save to this project under the <code>goopspec.projects</code> namespace and take
      precedence over the global role model routing.
    </p>
  {/if}
</section>

<style>
  .settings-section {
    max-width: 64rem;
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

  .section-subtitle strong {
    color: var(--text-primary);
    font-weight: 600;
  }

  /* ---- Async / error states ---- */
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

  .banner {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    align-self: flex-start;
    padding: 0.5rem 0.875rem;
    border-radius: var(--radius);
  }

  .banner--error {
    font-size: 0.8125rem;
    color: var(--danger-text);
    border: 1px solid color-mix(in srgb, var(--danger-text) 30%, var(--border));
    background-color: var(--bg-elevated);
  }

  .banner--note {
    font-size: 0.75rem;
    color: var(--text-muted);
    border: 1px solid var(--border);
    background-color: var(--bg-base);
  }

  /* ---- Tier groups ---- */
  .tier {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .tier-title {
    margin: 0;
    font-size: 0.75rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-muted);
  }

  .rows {
    display: flex;
    flex-direction: column;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background-color: var(--bg-base);
    overflow: hidden;
  }

  .row {
    display: grid;
    grid-template-columns: minmax(14rem, 1.4fr) minmax(12rem, 1fr);
    align-items: center;
    gap: 1rem;
    padding: 0.75rem 1rem;
    border-bottom: 1px solid var(--border);
    transition: background-color var(--transition-fast);
  }

  .row:last-child {
    border-bottom: none;
  }

  .row:hover {
    background-color: var(--bg-elevated);
  }

  .row--overridden {
    box-shadow: inset 2px 0 0 0 var(--accent);
  }

  .row__id {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.5rem;
    min-width: 0;
  }

  .role-name {
    font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace);
    font-size: 0.8125rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .effective {
    font-size: 0.75rem;
    color: var(--text-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 100%;
  }

  .badge {
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

  .badge--override {
    color: var(--accent-text);
    background-color: var(--accent-soft);
    border-color: color-mix(in srgb, var(--accent-text) 28%, transparent);
  }

  .badge--inherited {
    color: var(--text-muted);
    background-color: var(--bg-surface);
    border-color: var(--border);
  }

  .badge--builtin {
    color: var(--text-muted);
    background-color: transparent;
    border-color: var(--border);
  }

  /* ---- Model picker ---- */
  .model-select {
    width: 100%;
    padding: 0.4375rem 0.625rem;
    font: inherit;
    font-size: 0.8125rem;
    color: var(--text-primary);
    background-color: var(--bg-elevated);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition:
      border-color var(--transition-fast),
      box-shadow var(--transition-fast);
  }

  .model-select:hover:not(:disabled) {
    border-color: var(--border-strong);
  }

  .model-select:focus-visible {
    outline: none;
    border-color: var(--focus-ring);
    box-shadow: 0 0 0 2px var(--accent-soft);
  }

  .model-select:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  /* ---- Action bar ---- */
  .actions {
    position: sticky;
    bottom: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    flex-wrap: wrap;
    padding: 0.875rem 1rem;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background-color: var(--bg-elevated);
  }

  .actions__status {
    font-size: 0.8125rem;
    min-height: 1.25rem;
    display: inline-flex;
    align-items: center;
  }

  .saved-flash {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    color: var(--success-text, var(--accent-text));
    font-weight: 500;
  }

  .override-count {
    color: var(--text-secondary);
  }

  .override-count--muted {
    color: var(--text-muted);
  }

  .actions__buttons {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .btn {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.5rem 0.875rem;
    font: inherit;
    font-size: 0.8125rem;
    font-weight: 500;
    border-radius: var(--radius-sm);
    border: 1px solid transparent;
    cursor: pointer;
    transition:
      background-color var(--transition-fast),
      border-color var(--transition-fast),
      color var(--transition-fast),
      opacity var(--transition-fast);
  }

  .btn:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: 2px;
  }

  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn--ghost {
    color: var(--text-secondary);
    background-color: transparent;
    border-color: var(--border);
  }

  .btn--ghost:hover:not(:disabled) {
    color: var(--text-primary);
    background-color: var(--bg-base);
    border-color: var(--border-strong);
  }

  .btn--primary {
    color: var(--accent-foreground);
    background-color: var(--accent);
    border-color: var(--accent);
  }

  .btn--primary:hover:not(:disabled) {
    background-color: var(--accent-hover, var(--accent));
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

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
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

  /* ---- Responsive ---- */
  @media (max-width: 40rem) {
    .row {
      grid-template-columns: 1fr;
      gap: 0.625rem;
    }

    .actions {
      flex-direction: column;
      align-items: stretch;
    }

    .actions__buttons {
      justify-content: flex-end;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .row,
    .model-select,
    .btn {
      transition: none;
    }

    .spin {
      animation: none;
    }
  }
</style>
