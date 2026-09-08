import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/matchmake': 'http://127.0.0.1:2567',
      '/health': 'http://127.0.0.1:2567',
      '^/[a-zA-Z0-9_-]+/[a-zA-Z0-9_-]+\\?': { target: 'ws://127.0.0.1:2567', ws: true },
    },
  },
  build: {
    chunkSizeWarningLimit: 900,
    rollupOptions: { output: { manualChunks: { three: ['three'], ui: ['react', 'react-dom'] } } },
  },
});
