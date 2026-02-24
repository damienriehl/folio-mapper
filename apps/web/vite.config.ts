import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 58173,
    proxy: {
      '/api': {
        target: 'http://localhost:58000',
        changeOrigin: true,
      },
    },
  },
  optimizeDeps: {
    exclude: ['@folio-mapper/core', '@folio-mapper/ui'],
  },
});
