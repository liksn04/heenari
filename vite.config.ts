import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('/node_modules/react-router')) return 'router';
          if (id.includes('/node_modules/lucide-react')) return 'icons';
          if (id.includes('/node_modules/react') || id.includes('/node_modules/scheduler')) {
            return 'react-core';
          }
          return undefined;
        },
      },
    },
  },
  server: {
    port: 5150,
  },
});
