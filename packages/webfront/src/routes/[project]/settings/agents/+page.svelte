<script lang="ts">
  import { onMount } from 'svelte';
  import { HugeiconsIcon } from '@hugeicons/svelte';
  import { Loading03Icon, Alert02Icon } from '@hugeicons/core-free-icons';
  import { createClient } from '$lib/api/client.js';
  import { fetchProviders } from '$lib/api/providers.js';
  import type { Provider } from '$lib/api/types.js';
  import {
    loadProjectGoopspecConfig,
    saveProjectGoopspecConfig,
    type MergedProjectConfig,
    type ConfigSource
  } from '$lib/api/goopspec-config.js';

  let { data } = $props();

  const client = createClient();

  /** Project identity for scoping config reads/writes (from the layout load). */
  const projectId = $derived(data.projectParam);

  // ---- Role taxonomy (mirrors the global /settings/agents page) ------------
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

  // Inlined copy of DEFAULT_MODEL_MAP from
  // packages/opencode-plugin/src/features/setup/index.ts (not importable in the browser).
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

  // ---- Reactive state ------------------------------------------------------
  let config = $state<MergedProjectConfig | null>(null);
  let providers = $state<Provider[]>([]);
  let configLoading = $state(true);
  let providersLoading = $state(true);
  let configError = $state<string | null>(null);
  let providersError = $state<string | null>(null);
  let saveError = $state<string | null>(null);
  /** Role currently mid-save, so its control shows busy. */
  let savingKey = $state<string | null>(null);

  onMount(() => {
    void (async () => {
      try {
        config = await loadProjectGoopspecConfig(client, projectId);
      } catch (err) {
        configError = err instanceof Error ? err.message : 'Failed to load config';
      } finally {
        configLoading = false;
      }
    })();

    void (async () => {
      try {
        providers = await fetchProviders(client);
      } catch (err) {
        providersError = err instanceof Error ? err.message : 'Failed to load providers';
      } finally {
        providersLoading = false;
      }
    })();
  });

  /** Flat list of every provider/model pair for the picker options. */
  const modelOptions = $derived(
    providers.map((p) => ({
      providerName: p.name,
      models: p.models.map((m) => ({
        value: `${p.id}/${m.id}`,
        label: m.name ?? m.id
      }))
    }))
  );

  /** All known model values, used to detect whether an effective model is custom. */
  const knownModelValues = $derived(
    new Set(modelOptions.flatMap((g) => g.models.map((m) => m.value)))
  );

  /** Effective model: project/global override > defaultModel > built-in map. */
  function effectiveModel(role: string): string {
    return (
      config?.raw.agentModels?.[role] ??
      config?.raw.defaultModel ??
      DEFAULT_MODEL_MAP[role] ??
      'unknown'
    );
  }

  /** The explicit per-role override, if any (empty = inherit). */
  function overrideValue(role: string): string {
    return config?.raw.agentModels?.[role] ?? '';
  }

  /** Winning source for a role's model (project > internal > built-in). */
  function modelSource(role: string): ConfigSource | undefined {
    return config?.agentModelSources[role];
  }

  async function setModel(role: string, value: string): Promise<void> {
    savingKey = role;
    saveError = null;
    const previous = config;
    try {
      if (config) {
        config = {
          ...config,
          raw: {
            ...config.raw,
            agentModels: { ...(config.raw.agentModels ?? {}), [role]: value }
          },
          agentModelSources: { ...config.agentModelSources, [role]: 'project' }
        };
      }
      await saveProjectGoopspecConfig(client, projectId, {
        agentModels: { [role]: value }
      });
    } catch (err) {
      saveError = err instanceof Error ? err.message : 'Save failed';
      config = previous;
    } finally {
      savingKey = null;
    }
  }

  function handleModelChange(role: string, event: Event): void {
    const value = (event.currentTarget as HTMLSelectElement).value;
    if (value === '' || value === overrideValue(role)) return;
    void setModel(role, value);
  }
</script>

<section class="settings-section" aria-labelledby="project-agents-heading">
  <header class="section-header">
    <h2 id="project-agents-heading" class="section-title">Project Agents</h2>
    <p class="section-subtitle">
      Per-role model routing for this project. Overrides apply only here.
    </p>
  </header>

  {#if configLoading}
    <div class="state-row" aria-live="polite">
      <span class="spin">
        <HugeiconsIcon icon={Loading03Icon} size={18} color="currentColor" strokeWidth={1.5} />
      </span>
      <span>Loading configuration…</span>
    </div>
  {:else if configError}
    <div class="state-row state-row--error" role="alert">
      <HugeiconsIcon icon={Alert02Icon} size={18} color="currentColor" strokeWidth={1.5} />
      <span>{configError}</span>
    </div>
  {:else}
    {#if saveError}
      <div class="save-banner" role="alert">
        <HugeiconsIcon icon={Alert02Icon} size={16} color="currentColor" strokeWidth={1.5} />
        <span>{saveError}</span>
      </div>
    {/if}

    <!-- Per-role model assignments -->
    {#if providersError}
      <div class="provider-note" role="status">
        <HugeiconsIcon icon={Alert02Icon} size={14} color="currentColor" strokeWidth={1.5} />
        <span>Could not load the model list ({providersError}). Effective models still shown.</span>
      </div>
    {/if}

    {#each TIER_GROUPS as group (group.id)}
      <section class="tier" aria-labelledby={`tier-${group.id}`}>
        <h3 id={`tier-${group.id}`} class="tier-title">{group.title}</h3>

        <div class="rows" role="list">
          {#each group.roles as role (role)}
            <div class="row" role="listitem" class:row--busy={savingKey === role}>
              <div class="row__id">
                <span class="role-name">{role}</span>
                <span class="effective" title={effectiveModel(role)}>
                  {effectiveModel(role)}
                </span>
                {@render badge(modelSource(role))}
              </div>

              <div class="row__control">
                <label class="sr-only" for={`model-${role}`}>Model for {role}</label>
                <select
                  id={`model-${role}`}
                  class="model-select"
                  value={overrideValue(role)}
                  disabled={savingKey === role || providersLoading}
                  onchange={(e) => handleModelChange(role, e)}
                >
                  <option value="">
                    {providersLoading ? 'Loading models…' : 'Inherit default'}
                  </option>
                  {#if overrideValue(role) && !knownModelValues.has(overrideValue(role))}
                    <option value={overrideValue(role)}>{overrideValue(role)} (custom)</option>
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

    <p class="global-note">
      Project overrides save to the <code>projects</code> namespace in
      <code>goopspec.json</code>. Roles without an override inherit the global default.
    </p>
  {/if}
</section>

{#snippet badge(source: ConfigSource | undefined)}
  {#if source === 'project'}
    <span class="source-badge source-badge--project">project</span>
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

  .provider-note {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    align-self: flex-start;
    padding: 0.5rem 0.875rem;
    font-size: 0.75rem;
    color: var(--text-muted);
    border: 1px solid var(--border);
    border-radius: var(--radius);
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

  .row--busy {
    opacity: 0.7;
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
    color: var(--text-secondary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 100%;
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

  /* ---- Responsive: stack the row on narrow viewports ---- */
  @media (max-width: 40rem) {
    .row {
      grid-template-columns: 1fr;
      gap: 0.625rem;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .row,
    .model-select {
      transition: none;
    }

    .spin {
      animation: none;
    }
  }
</style>
