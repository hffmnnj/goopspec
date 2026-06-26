<script lang="ts">
  import { HugeiconsIcon } from '@hugeicons/svelte';
  import { Mic01Icon, VolumeHighIcon } from '@hugeicons/core-free-icons';
  import { settings, type SttModel } from '$lib/stores/settings.svelte.js';
  import { voice } from '$lib/stores/voice.svelte.js';
  import { formatCombo } from '$lib/keyboard/registry.js';

  // --- Migrated controls ---------------------------------------------------
  const STT_MODEL_OPTIONS: { value: SttModel; label: string; hint: string }[] = [
    { value: 'tiny', label: 'Fast', hint: '27MB' },
    { value: 'base', label: 'Accurate', hint: '102MB' }
  ];

  /** Pretty-printed mic shortcut (⌘M on macOS, Ctrl+M elsewhere). */
  const micShortcutLabel = $derived(formatCombo(settings.current.voiceShortcut));

  /** Voice input is unusable in this browser (mic + model unsupported). */
  const voiceUnsupported = $derived(voice.error === 'unsupported');

  // --- Status panel: STT model state ---------------------------------------
  /**
   * The voice store tracks lifecycle (idle/loading/recording/transcribing/error)
   * but not the resolved backend device. We surface the selected model size and
   * infer a coarse load state from the live voice status without rebuilding the
   * STT pipeline (which already exists in src/lib/voice).
   */
  const sttModelLabel = $derived(
    STT_MODEL_OPTIONS.find((o) => o.value === settings.current.voiceSttModel)?.label ?? 'Fast'
  );

  type StatusTone = 'ok' | 'warn' | 'err' | 'muted';

  const sttState = $derived.by((): { label: string; tone: StatusTone } => {
    switch (voice.status) {
      case 'loading':
        return { label: 'Loading model…', tone: 'warn' };
      case 'recording':
      case 'transcribing':
        return { label: 'Active', tone: 'ok' };
      case 'error':
        return voice.error === 'model-load-failed'
          ? { label: 'Failed to load', tone: 'err' }
          : { label: 'Error', tone: 'err' };
      default:
        return { label: 'Not loaded (loads on first use)', tone: 'muted' };
    }
  });

  // --- Status panel: TTS / VAD support (SSR-safe, browser-only) -------------
  const ttsSupported = $derived(typeof window !== 'undefined' && 'speechSynthesis' in window);

  /** VAD ships with the app; only a hard unsupported error disables it. */
  const vadAvailable = $derived(!voiceUnsupported);

  // --- Status panel: microphone permission ---------------------------------
  type MicPermission = 'granted' | 'denied' | 'prompt' | 'unknown';

  let micPermission = $state<MicPermission>('unknown');
  let micRequesting = $state(false);
  let micRequestError = $state<string | null>(null);

  // Query the Permissions API in the browser only; gracefully degrade when it
  // is unavailable (Firefox/Safari historically lack `microphone`).
  $effect(() => {
    if (typeof navigator === 'undefined' || !navigator.permissions?.query) return;

    let status: PermissionStatus | null = null;
    const onChange = () => {
      if (status) micPermission = status.state as MicPermission;
    };

    navigator.permissions
      .query({ name: 'microphone' as PermissionName })
      .then((result) => {
        status = result;
        micPermission = result.state as MicPermission;
        result.addEventListener('change', onChange);
      })
      .catch(() => {
        micPermission = 'unknown';
      });

    return () => {
      status?.removeEventListener('change', onChange);
    };
  });

  async function requestMic(): Promise<void> {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      micRequestError = 'Microphone API unavailable in this browser.';
      return;
    }
    micRequesting = true;
    micRequestError = null;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Release the device immediately; we only needed the permission grant.
      for (const track of stream.getTracks()) track.stop();
      micPermission = 'granted';
    } catch {
      micPermission = 'denied';
      micRequestError = 'Microphone access was blocked.';
    } finally {
      micRequesting = false;
    }
  }

  const micStatus = $derived.by((): { label: string; tone: StatusTone } => {
    switch (micPermission) {
      case 'granted':
        return { label: 'Granted', tone: 'ok' };
      case 'denied':
        return { label: 'Denied', tone: 'err' };
      case 'prompt':
        return { label: 'Not yet requested', tone: 'warn' };
      default:
        return { label: 'Unknown', tone: 'muted' };
    }
  });
</script>

<section class="settings-section" aria-labelledby="voice-heading">
  <header class="section-header">
    <h2 id="voice-heading" class="section-title">Voice</h2>
    <p class="section-subtitle">Text-to-speech, speech recognition, and microphone.</p>
  </header>

  <!-- Controls ------------------------------------------------------------- -->
  <div class="fields">
    <!-- TTS toggle -->
    <div class="field field--row">
      <span class="field-text">
        <label class="field-label" for="tts-toggle">
          <HugeiconsIcon icon={VolumeHighIcon} size={14} color="currentColor" strokeWidth={1.5} />
          Read responses aloud
        </label>
        <span class="field-sub">Speaks the assistant's final reply after each response</span>
      </span>
      <button
        id="tts-toggle"
        type="button"
        role="switch"
        aria-label="Read responses aloud"
        aria-checked={settings.current.voiceTtsEnabled}
        class="switch"
        class:on={settings.current.voiceTtsEnabled}
        onclick={() => settings.setVoiceTtsEnabled(!settings.current.voiceTtsEnabled)}
      >
        <span class="switch-thumb"></span>
      </button>
    </div>

    <!-- STT model picker -->
    {#if voiceUnsupported}
      <div class="field">
        <p class="field-note" role="note">Voice input is not supported in this browser.</p>
      </div>
    {:else}
      <div class="field">
        <span class="field-text">
          <span class="field-label" id="label-stt-model">Transcription model</span>
          <span class="field-sub">Affects accuracy and first-load download size</span>
        </span>
        <div class="segmented" role="radiogroup" aria-labelledby="label-stt-model">
          {#each STT_MODEL_OPTIONS as opt (opt.value)}
            <button
              type="button"
              role="radio"
              aria-checked={settings.current.voiceSttModel === opt.value}
              class="segment"
              class:active={settings.current.voiceSttModel === opt.value}
              onclick={() => settings.setVoiceSttModel(opt.value)}
            >
              {opt.label}
              <span class="segment-hint">{opt.hint}</span>
            </button>
          {/each}
        </div>
      </div>
    {/if}

    <!-- Mic shortcut -->
    <div class="field field--row">
      <span class="field-text">
        <label class="field-label" for="mic-shortcut">
          <HugeiconsIcon icon={Mic01Icon} size={14} color="currentColor" strokeWidth={1.5} />
          Mic shortcut
        </label>
        <span class="field-sub">Hold or toggle to dictate into the prompt</span>
      </span>
      <kbd id="mic-shortcut" class="shortcut-kbd">{micShortcutLabel}</kbd>
    </div>
  </div>

  <!-- Status panel --------------------------------------------------------- -->
  <div class="status-panel" aria-labelledby="voice-status-heading">
    <h3 id="voice-status-heading" class="status-title">Voice Status</h3>
    <p class="status-subtitle">Live state of the on-device speech pipeline.</p>

    <dl class="status-grid">
      <div class="status-row">
        <dt class="status-key">STT model</dt>
        <dd class="status-val">
          <span class="status-name">{sttModelLabel}</span>
          <span class="badge badge--{sttState.tone}">{sttState.label}</span>
        </dd>
      </div>

      <div class="status-row">
        <dt class="status-key">Microphone</dt>
        <dd class="status-val">
          <span class="badge badge--{micStatus.tone}">{micStatus.label}</span>
          {#if micPermission === 'prompt' || micPermission === 'unknown'}
            <button
              type="button"
              class="request-btn"
              onclick={requestMic}
              disabled={micRequesting}
            >
              {micRequesting ? 'Requesting…' : 'Request mic'}
            </button>
          {/if}
        </dd>
      </div>

      {#if micRequestError}
        <p class="status-error" role="alert">{micRequestError}</p>
      {/if}

      <div class="status-row">
        <dt class="status-key">Text-to-speech</dt>
        <dd class="status-val">
          <span class="badge badge--{ttsSupported ? 'ok' : 'err'}">
            {ttsSupported ? 'Supported' : 'Not supported'}
          </span>
        </dd>
      </div>

      <div class="status-row">
        <dt class="status-key">Voice activity (VAD)</dt>
        <dd class="status-val">
          <span class="badge badge--{vadAvailable ? 'ok' : 'muted'}">
            {vadAvailable ? 'Available' : 'Unavailable'}
          </span>
        </dd>
      </div>
    </dl>

    <p class="status-note" role="note">
      Voice commands route through the <code>goop_infer_intent</code> plugin tool for GoopSpec
      workflow actions.
    </p>
  </div>
</section>

<style>
  .settings-section {
    max-width: 56rem;
  }

  .section-header {
    margin-bottom: 1.5rem;
  }

  .section-title {
    margin: 0;
    font-size: 1.375rem;
    font-weight: 600;
    letter-spacing: -0.02em;
    color: var(--text-primary);
  }

  .section-subtitle {
    margin: 0.375rem 0 0;
    font-size: 0.9375rem;
    color: var(--text-secondary);
  }

  /* --- Fields ------------------------------------------------------------ */
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

  .field:last-child {
    border-bottom: none;
  }

  .field--row {
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }

  .field-text {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    min-width: 0;
  }

  .field-label {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    font-size: 0.8125rem;
    font-weight: 500;
    color: var(--text-primary);
  }

  .field-sub {
    font-size: 0.75rem;
    color: var(--text-secondary);
  }

  .field-note {
    margin: 0;
    font-size: 0.8125rem;
    color: var(--text-muted);
  }

  /* --- Segmented control ------------------------------------------------- */
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
    flex-direction: column;
    align-items: center;
    gap: 0.125rem;
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

  .segment-hint {
    font-size: 0.625rem;
    font-weight: 500;
    opacity: 0.7;
  }

  /* --- Switch ------------------------------------------------------------ */
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

  /* --- Shortcut kbd ------------------------------------------------------ */
  .shortcut-kbd {
    display: inline-flex;
    align-items: center;
    padding: 0.25rem 0.5rem;
    font-family: var(--font-mono, ui-monospace, monospace);
    font-size: 0.8125rem;
    color: var(--text-primary);
    background-color: var(--bg-base);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    flex-shrink: 0;
  }

  /* --- Status panel ------------------------------------------------------ */
  .status-panel {
    margin-top: 2rem;
    padding: 1.25rem;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background-color: var(--bg-surface);
  }

  .status-title {
    margin: 0;
    font-size: 0.9375rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .status-subtitle {
    margin: 0.25rem 0 1rem;
    font-size: 0.8125rem;
    color: var(--text-secondary);
  }

  .status-grid {
    display: flex;
    flex-direction: column;
    gap: 0;
    margin: 0;
  }

  .status-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.625rem 0;
    border-bottom: 1px solid var(--border);
  }

  .status-row:last-of-type {
    border-bottom: none;
  }

  .status-key {
    font-size: 0.8125rem;
    font-weight: 500;
    color: var(--text-secondary);
  }

  .status-val {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    margin: 0;
  }

  .status-name {
    font-size: 0.8125rem;
    color: var(--text-primary);
  }

  .badge {
    display: inline-flex;
    align-items: center;
    padding: 0.125rem 0.5rem;
    font-size: 0.6875rem;
    font-weight: 600;
    letter-spacing: 0.01em;
    border-radius: var(--radius-full);
    border: 1px solid transparent;
    white-space: nowrap;
  }

  .badge--ok {
    color: var(--success, #15803d);
    background-color: color-mix(in srgb, var(--success, #15803d) 12%, transparent);
    border-color: color-mix(in srgb, var(--success, #15803d) 30%, transparent);
  }

  .badge--warn {
    color: var(--warning, #b45309);
    background-color: color-mix(in srgb, var(--warning, #b45309) 12%, transparent);
    border-color: color-mix(in srgb, var(--warning, #b45309) 30%, transparent);
  }

  .badge--err {
    color: var(--danger, #b91c1c);
    background-color: color-mix(in srgb, var(--danger, #b91c1c) 12%, transparent);
    border-color: color-mix(in srgb, var(--danger, #b91c1c) 30%, transparent);
  }

  .badge--muted {
    color: var(--text-muted);
    background-color: var(--bg-base);
    border-color: var(--border);
  }

  .request-btn {
    padding: 0.25rem 0.625rem;
    font-size: 0.75rem;
    font-weight: 500;
    color: var(--text-primary);
    background-color: var(--bg-base);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition:
      color var(--transition-fast),
      background-color var(--transition-fast);
  }

  .request-btn:hover:not(:disabled) {
    color: var(--accent-foreground);
    background-color: var(--accent);
    border-color: var(--focus-ring);
  }

  .request-btn:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: 2px;
  }

  .request-btn:disabled {
    opacity: 0.6;
    cursor: default;
  }

  .status-error {
    margin: 0.25rem 0 0;
    font-size: 0.75rem;
    color: var(--danger, #b91c1c);
  }

  .status-note {
    margin: 1rem 0 0;
    font-size: 0.75rem;
    color: var(--text-muted);
  }

  .status-note code {
    font-family: var(--font-mono, ui-monospace, monospace);
    font-size: 0.6875rem;
    padding: 0.0625rem 0.25rem;
    border-radius: var(--radius-sm);
    background-color: var(--bg-base);
    color: var(--text-secondary);
  }

  @media (prefers-reduced-motion: reduce) {
    .segment,
    .switch,
    .switch-thumb,
    .request-btn {
      transition: none;
    }
  }
</style>
