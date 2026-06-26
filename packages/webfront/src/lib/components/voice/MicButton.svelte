<script lang="ts">
  import { HugeiconsIcon } from '@hugeicons/svelte';
  import { Mic01Icon, Loading03Icon, AlertCircleIcon } from '@hugeicons/core-free-icons';
  import { createSttService, type SttService } from '$lib/voice/stt.js';

  interface MicButtonProps {
    /** Called with the finished transcript text (already trimmed, non-empty). */
    onTranscript: (text: string) => void;
    /** Disable the control — e.g. while a reply is streaming. */
    disabled?: boolean;
  }

  let { onTranscript, disabled = false }: MicButtonProps = $props();

  type MicState = 'idle' | 'loading' | 'recording' | 'transcribing' | 'error';

  let state = $state<MicState>('idle');

  // Lazily-constructed singletons. Both the VAD and STT worker carry heavy
  // model downloads, so we only build them when the user first records.
  let stt: SttService | null = null;
  // `MicVAD` is typed via the dynamic import to keep this module SSR-safe.
  let vad: Awaited<ReturnType<typeof import('@ricky0123/vad-web').MicVAD.new>> | null = null;

  const isActive = $derived(state === 'recording' || state === 'transcribing');
  const label = $derived(
    state === 'recording'
      ? 'Stop recording'
      : state === 'transcribing'
        ? 'Transcribing…'
        : state === 'loading'
          ? 'Loading voice model…'
          : state === 'error'
            ? 'Voice input failed — click to retry'
            : 'Start voice input',
  );
  const busy = $derived(state === 'loading' || state === 'transcribing');

  function ensureStt(): SttService {
    if (!stt) stt = createSttService();
    return stt;
  }

  async function handleSpeechEnd(audio: Float32Array): Promise<void> {
    state = 'transcribing';
    try {
      const text = await ensureStt().transcribe(audio);
      const clean = text.trim();
      if (clean) onTranscript(clean);
      state = vad?.listening ? 'recording' : 'idle';
    } catch {
      // Transcription failure shouldn't kill the recording session; drop back
      // to listening if the VAD is still active, otherwise idle.
      state = vad?.listening ? 'recording' : 'idle';
    }
  }

  async function startRecording(): Promise<void> {
    if (typeof window === 'undefined') return;
    state = 'loading';
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
          if (state === 'transcribing') return;
          state = vad?.listening ? 'recording' : 'idle';
        },
      });
      await vad.start();
      state = 'recording';
    } catch {
      await teardown();
      state = 'error';
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
    state = 'idle';
  }

  async function toggle(): Promise<void> {
    if (disabled || busy) return;
    if (state === 'recording') {
      await stopRecording();
    } else {
      await startRecording();
    }
  }

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
  class:recording={state === 'recording'}
  class:error={state === 'error'}
  aria-label={label}
  aria-pressed={state === 'recording'}
  aria-busy={busy}
  title={label}
  disabled={disabled || busy}
  onclick={toggle}
>
  {#if state === 'transcribing' || state === 'loading'}
    <span class="spin" aria-hidden="true">
      <HugeiconsIcon icon={Loading03Icon} size={18} strokeWidth={1.5} color="currentColor" />
    </span>
  {:else if state === 'error'}
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
