import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react-swc'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath } from 'node:url'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // LB-80: Web Push. SW propio (`src/sw.ts`) con estrategia injectManifest
    // para poder manejar `push` / `notificationclick`. El registro efectivo
    // del SW es explícito en `src/main.tsx` (injectRegister: false).
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      injectRegister: false,
      manifest: false,
      injectManifest: {
        // LB-80 no precachea assets de la app: `injectionPoint: undefined`
        // hace que vite-plugin-pwa saltee el paso de workbox `injectManifest`
        // (sólo bundlea `src/sw.ts` -> `sw.js`). El SW sólo maneja push.
        injectionPoint: undefined,
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    css: true,
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
  }
})
