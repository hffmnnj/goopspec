/**
 * STT service — main-thread wrapper around the speech-recognition worker.
 *
 * Owns the worker lifecycle and turns its message protocol into a simple
 * promise-based `transcribe()` call plus progress/error callbacks. The worker
 * (and therefore the ~27MB Moonshine model) is created lazily on the first
 * `transcribe()` so importing this module costs nothing until voice is used.
 */

export type SttStatus = 'idle' | 'loading' | 'ready' | 'transcribing' | 'error';
export type SttErrorStage = 'model-load' | 'transcription';
export type SttError = Error & { stage?: SttErrorStage };

export type SttProgressCallback = (status: string, progress?: number, message?: string) => void;
export type SttErrorCallback = (message: string, stage?: SttErrorStage) => void;

/** Public surface returned by {@link createSttService}. */
export interface SttService {
  /** Transcribe a 16kHz mono Float32Array; resolves with the transcript text. */
  transcribe(audio: Float32Array): Promise<string>;
  /** Register a model-load / transcription progress listener. */
  onProgress(cb: SttProgressCallback): void;
  /** Register an error listener for worker-level failures. */
  onError(cb: SttErrorCallback): void;
  /** Current high-level status. */
  status(): SttStatus;
  /** Tear down the worker and release the model. */
  terminate(): void;
}

type WorkerOutbound =
  | { type: 'progress'; id?: number; status: string; message?: string; progress?: number }
  | { type: 'ready'; device: 'webgpu' | 'wasm' }
  | { type: 'transcript'; id: number; text: string }
  | { type: 'error'; id?: number; message: string; stage?: SttErrorStage };

interface Pending {
  resolve: (text: string) => void;
  reject: (error: SttError) => void;
}

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof Worker !== 'undefined';
}

export function createSttService(): SttService {
  let worker: Worker | null = null;
  let nextId = 0;
  let currentStatus: SttStatus = 'idle';
  const pending = new Map<number, Pending>();
  const progressCallbacks: SttProgressCallback[] = [];
  const errorCallbacks: SttErrorCallback[] = [];

  function setStatus(next: SttStatus): void {
    currentStatus = next;
  }

  function emitProgress(status: string, progress?: number, message?: string): void {
    for (const cb of progressCallbacks) cb(status, progress, message);
  }

  function emitError(message: string, stage?: SttErrorStage): void {
    for (const cb of errorCallbacks) cb(message, stage);
  }

  function createSttError(message: string, stage?: SttErrorStage): SttError {
    const error: SttError = new Error(message);
    error.stage = stage;
    return error;
  }

  function rejectAll(message: string, stage?: SttErrorStage): void {
    const error = createSttError(message, stage);
    for (const entry of pending.values()) entry.reject(error);
    pending.clear();
  }

  function handleMessage(event: MessageEvent<WorkerOutbound>): void {
    const data = event.data;
    switch (data.type) {
      case 'progress':
        if (currentStatus !== 'transcribing') setStatus('loading');
        emitProgress(data.status, data.progress, data.message);
        break;
      case 'ready':
        setStatus('ready');
        emitProgress('Model ready', 1);
        break;
      case 'transcript': {
        const entry = pending.get(data.id);
        pending.delete(data.id);
        setStatus(pending.size > 0 ? 'transcribing' : 'ready');
        entry?.resolve(data.text);
        break;
      }
      case 'error': {
        setStatus('error');
        console.error('[STT Worker] Error:', data.message, 'stage:', data.stage);
        const error = createSttError(data.message, data.stage);
        if (typeof data.id === 'number') {
          const entry = pending.get(data.id);
          pending.delete(data.id);
          entry?.reject(error);
        } else {
          rejectAll(data.message, data.stage);
        }
        emitError(data.message, data.stage);
        break;
      }
    }
  }

  function ensureWorker(): Worker {
    if (worker) return worker;
    if (!isBrowser()) {
      throw new Error('STT is only available in the browser');
    }
    const instance = new Worker(new URL('./stt.worker.ts', import.meta.url), {
      type: 'module',
    });
    instance.addEventListener('message', handleMessage);
    instance.addEventListener('error', (event) => {
      setStatus('error');
      const message = event.message || 'STT worker crashed';
      rejectAll(message);
      emitError(message);
    });
    worker = instance;
    return instance;
  }

  return {
    transcribe(audio: Float32Array): Promise<string> {
      let active: Worker;
      try {
        active = ensureWorker();
      } catch (error) {
        return Promise.reject(error instanceof Error ? error : new Error(String(error)));
      }

      const id = nextId++;
      setStatus(currentStatus === 'idle' || currentStatus === 'error' ? 'loading' : 'transcribing');

      return new Promise<string>((resolve, reject) => {
        pending.set(id, { resolve, reject });
        // The worker accepts a copy; Float32Array is structured-cloneable.
        active.postMessage({ type: 'transcribe', id, audio });
      });
    },

    onProgress(cb: SttProgressCallback): void {
      progressCallbacks.push(cb);
    },

    onError(cb: SttErrorCallback): void {
      errorCallbacks.push(cb);
    },

    status(): SttStatus {
      return currentStatus;
    },

    terminate(): void {
      rejectAll('STT service terminated');
      worker?.terminate();
      worker = null;
      setStatus('idle');
    },
  };
}
