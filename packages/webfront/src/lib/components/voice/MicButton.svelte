<script lang="ts">
  import { HugeiconsIcon } from '@hugeicons/svelte';
  import { Mic01Icon, Loading03Icon, AlertCircleIcon } from '@hugeicons/core-free-icons';
  import { createSttService, type SttError, type SttService } from '$lib/voice/stt.js';
  import { voice, type VoiceError } from '$lib/stores/voice.svelte.js';

  interface MicButtonProps {
    /** Called with the finished transcript text (already trimmed, non-empty). */
    onTranscript: (text: string) => void;
    /** Disable the control — e.g. while a reply is streaming. */
    disabled?: boolean;
  }

  let { onTranscript, disabled = false }: MicButtonProps = $props();

  // Lazily-constructed singletons. Both the VAD and STT worker carry heavy
  // model downloads, so we only build them when the user first records.
  let stt: SttService | null = null;
  // `MicVAD` is typed via the dynamic import to keep this module SSR-safe.
  let vad: Awaited<ReturnType<typeof import('@ricky0123/vad-web').MicVAD.new>> | null = null;

  // Read derived UI state from the shared voice store so the keyboard shortcut
  // and the ARIA live region stay in sync with this control.
  const isActive = $derived(voice.isActive);
  const busy = $derived(voice.isBusy);
  const label = $derived(voice.ariaLabel);

  // Browser-capability gate. Without getUserMedia there is no path to audio, so
  // the control is permanently disabled and announces an unsupported error.
  const supported = $derived(
    typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia,
  );

  function ensureStt(): SttService {
    if (!stt) {
      stt = createSttService();
      stt.onProgress((status, _progress, message) => {
        const progressText = (message ?? status).toLowerCase();
        if (
          voice.status === 'transcribing' &&
          (progressText.includes('download') ||
            progressText.includes('initializ') ||
            progressText.includes('loading'))
        ) {
          voice.setStatus('loading');
        }
      });
    }
    return stt;
  }

  function getSttErrorStage(error: unknown): SttError['stage'] {
    return error instanceof Error ? (error as SttError).stage : undefined;
  }

  async function handleSpeechEnd(audio: Float32Array): Promise<void> {
    voice.setStatus('transcribing');
    try {
      const text = await ensureStt().transcribe(audio);
      const clean = text.trim();
      if (clean) {
        voice.setTranscript(clean);
        onTranscript(clean);
      }
      voice.setStatus(vad?.listening ? 'recording' : 'idle');
    } catch (err) {
      console.error('[Voice] transcription failed:', err);
      // A model-load/transcription failure shouldn't kill an active session;
      // surface the error only when the VAD is no longer listening. Distinguish
      // an STT model download/load failure from a runtime transcription error.
      const stage = getSttErrorStage(err);
      const message = err instanceof Error ? err.message.toLowerCase() : '';
      if (vad?.listening) {
        voice.setStatus('recording');
      } else if (stage === 'model-load') {
        voice.setError('stt-load-failed');
      } else if (stage === 'transcription') {
        voice.setError('transcription-failed');
      } else if (
        message.includes('load') ||
        message.includes('model') ||
        message.includes('download') ||
        message.includes('pipeline')
      ) {
        voice.setError('stt-load-failed');
      } else {
        voice.setError('transcription-failed');
      }
    }
  }

  function classifyStartError(error: unknown): NonNullable<VoiceError> {
    const name = error instanceof Error ? error.name : '';
    if (name === 'NotAllowedError' || name === 'SecurityError') return 'permission-denied';
    // Everything else on the start path is a VAD-level failure: dynamic import,
    // ONNX/WASM/ORT asset load, or `MicVAD.new`/`vad.start()`.
    return 'vad-load-failed';
  }

  async function startRecording(): Promise<void> {
    if (typeof window === 'undefined') return;
    if (!supported) {
      voice.setError('unsupported');
      return;
    }
    voice.setStatus('loading');
    try {
      const { MicVAD } = await import('@ricky0123/vad-web');
      vad = await MicVAD.new({
        model: 'v5',
        // Assets are copied into `static/vad/` by the copy-vad-assets Vite
        // plugin and served at the site root.
        baseAssetPath: '/vad/',
        onnxWASMBasePath: '/vad/',
        onSpeechEnd: handleSpeechEnd,
        onVADMisfire: () => {
          if (voice.status === 'transcribing') return;
          voice.setStatus(vad?.listening ? 'recording' : 'idle');
        },
      });
      await vad.start();
      voice.setStatus('recording');
    } catch (error) {
      console.error('[Voice] VAD start failed:', error);
      await teardown();
      voice.setError(classifyStartError(error));
    }
  }

  async function teardown(): Promise<void> {
    try {
      await vad?.pause();
      await vad?.destroy();
    } catch {
      // Ignore teardown races — the node may already be gone.
    }
    vad = null;
  }

  async function stopRecording(): Promise<void> {
    await teardown();
    voice.reset();
  }

  async function toggle(): Promise<void> {
    if (disabled || busy) return;
    if (!supported) {
      voice.setError('unsupported');
      return;
    }
    if (voice.status === 'recording') {
      await stopRecording();
    } else {
      // Retrying after an error starts a fresh session.
      await startRecording();
    }
  }

  // --- Mobile push-to-hold ---------------------------------------------------
  // On touch devices, holding the button records and releasing stops (a
  // push-to-talk gesture). This runs alongside the click-toggle so pointer
  // users are unaffected. `suppressNextClick` swallows the synthetic click that
  // some browsers emit after touchend so it doesn't immediately re-toggle.
  let suppressNextClick = false;

  function handleTouchStart(event: TouchEvent): void {
    if (disabled || busy || !supported) return;
    event.preventDefault();
    suppressNextClick = true;
    if (voice.status !== 'recording') void startRecording();
  }

  function handleTouchEnd(event: TouchEvent): void {
    if (!suppressNextClick) return;
    event.preventDefault();
    if (voice.status === 'recording') void stopRecording();
  }

  function handleClick(): void {
    if (suppressNextClick) {
      suppressNextClick = false;
      return;
    }
    void toggle();
  }

  // The `mod+m` shortcut dispatches a window-level event so it can drive this
  // component without the registry importing the component instance.
  $effect(() => {
    if (typeof document === 'undefined') return;
    const handler = () => void toggle();
    document.addEventListener('goopspec:voice-toggle', handler);
    return () => document.removeEventListener('goopspec:voice-toggle', handler);
  });

  // Mark the control unsupported on mount so the disabled state and live-region
  // announcement reflect capability before the user interacts.
  $effect(() => {
    if (!supported && voice.status === 'idle') voice.setError('unsupported');
  });

  // Release the mic + worker if the component unmounts mid-recording.
  $effect(() => {
    return () => {
      void teardown();
      stt?.terminate();
      stt = null;
    };
  });
</script>

<button
  type="button"
  class="action mic"
  class:recording={voice.status === 'recording'}
  class:error={voice.isError}
  aria-label={label}
  aria-pressed={voice.status === 'recording'}
  aria-busy={busy}
  title={label}
  disabled={disabled || busy || !supported}
  onclick={handleClick}
  ontouchstart={handleTouchStart}
  ontouchend={handleTouchEnd}
  ontouchcancel={handleTouchEnd}
>
  {#if voice.status === 'transcribing' || voice.status === 'loading'}
    <span class="spin" aria-hidden="true">
      <HugeiconsIcon icon={Loading03Icon} size={18} strokeWidth={1.5} color="currentColor" />
    </span>
  {:else if voice.isError}
    <HugeiconsIcon icon={AlertCircleIcon} size={18} strokeWidth={1.5} color="currentColor" />
  {:else}
    <span class="glyph" class:pulse={isActive}>
      <HugeiconsIcon icon={Mic01Icon} size={18} strokeWidth={1.5} color="currentColor" />
    </span>
  {/if}
</button>

<style>
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
    background-color: var(--bg-surface);
    color: var(--text-secondary);
    cursor: pointer;
    /* Prevent scroll/zoom hijacking the push-to-hold touch gesture. */
    touch-action: none;
    transition:
      background-color var(--transition-fast),
      color var(--transition-fast),
      transform var(--transition-fast),
      opacity var(--transition-fast);
  }

  .action:hover:not(:disabled) {
    color: var(--text-primary);
    background-color: var(--border-strong);
  }

  .action:active:not(:disabled) {
    transform: scale(0.92);
  }

  .action:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  .action:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: 2px;
  }

  .mic.recording {
    background-color: var(--accent-soft);
    color: var(--accent-text);
  }

  .mic.error {
    color: var(--danger-text);
    background-color: var(--bg-surface);
  }

  .glyph {
    display: inline-flex;
  }

  .glyph.pulse {
    animation: mic-pulse 1s ease-in-out infinite;
  }

  @keyframes mic-pulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.45;
    }
  }

  .spin {
    display: inline-flex;
    animation: mic-spin 0.8s linear infinite;
  }

  @keyframes mic-spin {
    to {
      transform: rotate(360deg);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .action:active:not(:disabled) {
      transform: none;
    }
    .glyph.pulse {
      animation: none;
      opacity: 1;
    }
    .spin {
      animation: none;
    }
  }
</style>
