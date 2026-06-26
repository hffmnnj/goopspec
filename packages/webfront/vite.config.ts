import { copyFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { SvelteKitPWA } from '@vite-pwa/sveltekit';
import { defineConfig, type Plugin } from 'vite';

const require = createRequire(import.meta.url);
const projectRoot = dirname(fileURLToPath(import.meta.url));

/**
 * Copy the Silero VAD worklet + model and the ONNX Runtime WASM binaries that
 * `@ricky0123/vad-web` fetches at runtime into `static/vad/`, so SvelteKit
 * serves them verbatim at `/vad/*`. We point the library's `baseAssetPath`
 * (worklet + model) and `onnxWASMBasePath` (ORT WASM glue) at that directory.
 *
 * Done as a build-time copy instead of committing the ~40MB of binaries to the
 * repo; assets always track the installed package version. Runs on dev server
 * boot and production build.
 */
function copyVadAssets(): Plugin {
  const targetDir = join(projectRoot, 'static', 'vad');
  const copyAll = (): void => {
    const vadDist = dirname(require.resolve('@ricky0123/vad-web/package.json')) + '/dist';
    // onnxruntime-web restricts `exports`, so resolve its dist via the WASM
    // backend entry that `@ricky0123/vad-web` itself imports.
    const ortDist = dirname(require.resolve('onnxruntime-web/wasm'));
    mkdirSync(targetDir, { recursive: true });
    const files: Array<[string, string]> = [
      [join(vadDist, 'vad.worklet.bundle.min.js'), 'vad.worklet.bundle.min.js'],
      [join(vadDist, 'silero_vad_v5.onnx'), 'silero_vad_v5.onnx'],
      // ORT WASM backends fetched relative to `onnxWASMBasePath`. The jsep
      // build powers the WebGPU path; the plain build is the WASM fallback.
      [join(ortDist, 'ort-wasm-simd-threaded.jsep.wasm'), 'ort-wasm-simd-threaded.jsep.wasm'],
      [join(ortDist, 'ort-wasm-simd-threaded.jsep.mjs'), 'ort-wasm-simd-threaded.jsep.mjs'],
      [join(ortDist, 'ort-wasm-simd-threaded.wasm'), 'ort-wasm-simd-threaded.wasm'],
      [join(ortDist, 'ort-wasm-simd-threaded.mjs'), 'ort-wasm-simd-threaded.mjs'],
    ];
    for (const [from, name] of files) {
      copyFileSync(from, join(targetDir, name));
    }
  };
  return {
    name: 'copy-vad-assets',
    buildStart() {
      copyAll();
    },
  };
}

export default defineConfig({
  plugins: [
    copyVadAssets(),
    tailwindcss(),
    sveltekit(),
    SvelteKitPWA({
      strategies: 'generateSW',
      registerType: 'autoUpdate',
      manifest: {
        name: 'GoopSpec',
        short_name: 'GoopSpec',
        description: 'GoopSpec — AI-powered coding workflow for OpenCode',
        theme_color: '#7fef80',
        background_color: '#09090b',
        display: 'standalone',
        orientation: 'any',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          {
            src: '/icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      },
      workbox: {
        // SPA shell handles in-app navigations when the app is cached.
        navigateFallback: '/index.html',
        // Never intercept the offline document itself with the SPA shell.
        navigateFallbackDenylist: [/^\/offline/],
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2,webmanifest}'],
        // Serve the precached offline page when a navigation can't be fulfilled
        // (no network and the SPA shell isn't cached yet).
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.mode === 'navigate',
            handler: 'NetworkOnly',
            options: {
              precacheFallback: { fallbackURL: '/offline.html' }
            }
          }
        ]
      }
    })
  ],
  // transformers.js ships its own pre-bundled ESM + ONNX runtime; let Vite load
  // it as-is rather than pre-bundling (which mangles the WASM/worker assets).
  optimizeDeps: {
    exclude: ['@huggingface/transformers', '@ricky0123/vad-web', 'onnxruntime-web']
  },
  worker: {
    format: 'es'
  }
});
