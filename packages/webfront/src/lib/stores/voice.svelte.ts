/**
 * Voice store — Svelte 5 runes.
 *
 * Single source of truth for the voice-input UI: capture/transcription status,
 * the last transcript, and any fatal error. The `MicButton` component reads and
 * writes this store, the `mod+m` keyboard shortcut drives it, and the AppShell
 * ARIA live region renders `announcement` so screen-reader users hear state
 * changes (loading, listening, transcribing, errors).
 *
 * Keeping voice state here (rather than local component state) lets the keyboard
 * shortcut, the live region, and the mic button stay in sync without prop
 * drilling or custom-event plumbing for the *state* itself.
 */

/** High-level voice-capture lifecycle. */
export type VoiceStatus = 'idle' | 'loading' | 'recording' | 'transcribing' | 'error';

/**
 * Fatal error categories surfaced to the user; `null` when there is no error.
 *
 * The error is classified by the failing pipeline stage so the message is
 * actionable: VAD initialisation, STT model load/download, or transcription.
 * `model-load-failed` is retained as a generic fallback for the rare case a
 * failure can't be attributed to a specific stage.
 */
export type VoiceError =
  | 'permission-denied'
  | 'vad-load-failed'
  | 'stt-load-failed'
  | 'transcription-failed'
  | 'model-load-failed'
  | 'unsupported'
  | null;

const ERROR_MESSAGES: Record<NonNullable<VoiceError>, string> = {
  'permission-denied':
    'Microphone access denied. Please allow microphone access in browser settings.',
  'vad-load-failed':
    'Voice activity detection failed to initialize. Check browser console for details.',
  'stt-load-failed':
    'Speech recognition model failed to load. This may be a download issue — try again.',
  'transcription-failed': 'Transcription failed. Please try speaking again.',
  'model-load-failed': 'Voice model failed to load. Please try again.',
  unsupported: 'Voice input is not supported in this browser.',
};

class VoiceStore {
  status = $state<VoiceStatus>('idle');
  error = $state<VoiceError>(null);
  lastTranscript = $state<string>('');

  /** Recording or transcribing — the capture pipeline is live. */
  get isActive(): boolean {
    return this.status === 'recording' || this.status === 'transcribing';
  }

  /** A blocking model/permission/transcription error is present. */
  get isError(): boolean {
    return this.status === 'error';
  }

  /** Whether the control should reject interaction (model still loading). */
  get isBusy(): boolean {
    return this.status === 'loading' || this.status === 'transcribing';
  }

  /** Accessible label for the mic control, reflecting the current state. */
  get ariaLabel(): string {
    if (this.status === 'error') return this.errorMessage || 'Voice input failed — click to retry';
    switch (this.status) {
      case 'recording':
        return 'Stop recording';
      case 'transcribing':
        return 'Transcribing speech';
      case 'loading':
        return 'Loading speech model';
      default:
        return 'Start voice input';
    }
  }

  /** Human-readable explanation of the current error, or '' when no error. */
  get errorMessage(): string {
    return this.error ? ERROR_MESSAGES[this.error] : '';
  }

  /**
   * Text for the polite ARIA live region. Empty while idle so screen readers
   * stay quiet until something happens.
   */
  get announcement(): string {
    switch (this.status) {
      case 'loading':
        return 'Loading speech model…';
      case 'recording':
        return 'Listening…';
      case 'transcribing':
        return 'Transcribing speech…';
      case 'error':
        return this.errorMessage;
      default:
        return '';
    }
  }

  setStatus(status: VoiceStatus): void {
    this.status = status;
    if (status !== 'error') this.error = null;
  }

  setError(error: NonNullable<VoiceError>): void {
    this.error = error;
    this.status = 'error';
  }

  setTranscript(text: string): void {
    this.lastTranscript = text;
  }

  reset(): void {
    this.status = 'idle';
    this.error = null;
  }
}

/** Create an isolated voice store (useful for tests). */
export function createVoiceStore(): VoiceStore {
  return new VoiceStore();
}

/** Shared reactive voice singleton. */
export const voice = createVoiceStore();

export type { VoiceStore };
