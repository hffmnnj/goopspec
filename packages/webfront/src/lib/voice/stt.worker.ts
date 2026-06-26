/**
 * STT Web Worker — on-device speech recognition via Moonshine Tiny.
 *
 * Runs `@huggingface/transformers.js` v3+ entirely off the main thread. The ASR
 * pipeline is loaded lazily on the first `transcribe` message: WebGPU is tried
 * first (fastest path) with an automatic fall back to the WASM (CPU) backend
 * when WebGPU is unavailable or pipeline construction fails on the GPU device.
 *
 * Message protocol (main → worker):
 *   { type: 'transcribe', id: number, audio: Float32Array }  // 16kHz mono
 *
 * Message protocol (worker → main):
 *   { type: 'progress', status: string, progress?: number }
 *   { type: 'ready', device: 'webgpu' | 'wasm' }
 *   { type: 'transcript', id: number, text: string }
 *   { type: 'error', id?: number, message: string }
 *
 * This module is self-contained — it has no imports from the rest of the app so
 * it bundles cleanly as a module worker (`new Worker(url, { type: 'module' })`).
 */

import {
  type AutomaticSpeechRecognitionPipeline,
  env,
  pipeline,
  type ProgressInfo,
} from '@huggingface/transformers';

/** Hugging Face model id for the primary (fast) on-device ASR model. */
const MODEL_ID = 'onnx-community/moonshine-tiny-ONNX';

/** Backends the pipeline may run on, in preference order. */
type SttDevice = 'webgpu' | 'wasm';

/** Inbound message shapes the worker understands. */
type InboundMessage = { type: 'transcribe'; id: number; audio: Float32Array };

env.useBrowserCache = true;
env.allowLocalModels = false;

let asrPromise: Promise<AutomaticSpeechRecognitionPipeline> | null = null;
let activeDevice: SttDevice | null = null;

function post(message: unknown, transfer?: Transferable[]): void {
  if (transfer && transfer.length > 0) {
    (self as unknown as Worker).postMessage(message, transfer);
  } else {
    (self as unknown as Worker).postMessage(message);
  }
}

/** True when this worker context exposes a WebGPU adapter. */
function hasWebGpu(): boolean {
  try {
    return typeof navigator !== 'undefined' && 'gpu' in navigator && navigator.gpu != null;
  } catch {
    return false;
  }
}

/** Forward transformers.js load progress to the main thread as a 0..1 ratio. */
function reportProgress(info: ProgressInfo): void {
  if (info.status === 'progress') {
    const ratio = typeof info.progress === 'number' ? info.progress / 100 : undefined;
    post({ type: 'progress', status: `Downloading ${info.file ?? 'model'}`, progress: ratio });
  } else if (info.status === 'ready') {
    post({ type: 'progress', status: 'Model ready', progress: 1 });
  } else if (info.status === 'initiate') {
    post({ type: 'progress', status: `Loading ${info.file ?? 'model'}` });
  }
}

/** Build the ASR pipeline on a specific backend device. */
async function build(device: SttDevice): Promise<AutomaticSpeechRecognitionPipeline> {
  post({ type: 'progress', status: `Initializing (${device})`, progress: 0 });
  const asr = await pipeline('automatic-speech-recognition', MODEL_ID, {
    device,
    dtype: 'fp32',
    progress_callback: reportProgress,
  });
  activeDevice = device;
  post({ type: 'ready', device });
  return asr;
}

/**
 * Load the pipeline once, preferring WebGPU and falling back to WASM. The
 * returned promise is cached so concurrent `transcribe` calls share one load.
 */
function loadPipeline(): Promise<AutomaticSpeechRecognitionPipeline> {
  if (asrPromise) return asrPromise;

  asrPromise = (async () => {
    if (hasWebGpu()) {
      try {
        return await build('webgpu');
      } catch (gpuError) {
        post({ type: 'progress', status: 'WebGPU unavailable — falling back to CPU' });
        console.warn('[stt.worker] WebGPU pipeline failed, falling back to WASM', gpuError);
      }
    }
    return build('wasm');
  })();

  // If the WASM fallback also fails, clear the cache so a later call can retry.
  asrPromise.catch(() => {
    asrPromise = null;
    activeDevice = null;
  });

  return asrPromise;
}

/** Run transcription for one audio buffer and report the result. */
async function handleTranscribe(message: InboundMessage): Promise<void> {
  try {
    const asr = await loadPipeline();
    post({ type: 'progress', status: 'Transcribing', progress: 1 });
    const output = await asr(message.audio);
    const text = Array.isArray(output)
      ? output.map((chunk) => chunk.text).join(' ').trim()
      : (output.text ?? '').trim();
    post({ type: 'transcript', id: message.id, text });
  } catch (error) {
    post({
      type: 'error',
      id: message.id,
      message: error instanceof Error ? error.message : 'Transcription failed',
    });
  }
}

self.addEventListener('message', (event: MessageEvent<InboundMessage>) => {
  const message = event.data;
  if (message && message.type === 'transcribe') {
    void handleTranscribe(message);
  }
});

/** Exposed for diagnostics/testing; the active backend once loaded. */
export function currentDevice(): SttDevice | null {
  return activeDevice;
}
