import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { SvelteKitPWA } from '@vite-pwa/sveltekit';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
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
    exclude: ['@huggingface/transformers']
  },
  worker: {
    format: 'es'
  }
});
