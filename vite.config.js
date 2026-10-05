import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    ...(process.env.VITE_BACKEND_URL?.includes('localhost:8080') ? { 'import.meta.env.VITE_BACKEND_URL': '""' } : {}),
  },
  // ffmpeg.wasm (multi-thread core) requires SharedArrayBuffer, which needs
  // cross-origin isolation headers. Exclude the packages from pre-bundling
  // so Vite does not try to optimize the ESM worker entry points.
  optimizeDeps: {
    exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util'],
  },
  server: {
    port: 3000,
    host: '0.0.0.0',
  },
  build: {
    outDir: 'dist/public',
    sourcemap: false,
  },
});
