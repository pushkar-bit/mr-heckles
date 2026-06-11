import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    // Proxy all /api and /socket.io calls to the Express backend
    proxy: {
      '/api': {
        target:      'http://localhost:5001',
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'http://localhost:5000',
        ws:     true,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir:       'dist',
    sourcemap:     true,
    chunkSizeWarningLimit: 2000, // Three.js bundles are large
  },
});
