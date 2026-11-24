import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const API_TARGET = process.env.API_URL ?? 'http://localhost:3000';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // En desarrollo, Vite sirve el frontend y reenvía la API al servidor Node.
    proxy: {
      '/api': API_TARGET,
      '/health': API_TARGET,
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});
