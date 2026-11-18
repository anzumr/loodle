import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    // three.js alone is about 530 kB (135 kB compressed); it is split out on purpose.
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        // Libraries change far less often than the game, so keep them in their own files:
        // after a deploy, returning players only download the game code again.
        manualChunks(id) {
          if (id.includes('node_modules/three')) return 'three';
          if (id.includes('node_modules/react') || id.includes('node_modules/scheduler')) return 'react';
        },
      },
    },
  },
  server: { port: 5173, host: true, proxy: {
    '/ws': { target: 'ws://localhost:8787', ws: true },
    '/api': { target: 'http://localhost:8787' },
  } },
});
