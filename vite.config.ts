import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  root: resolve(__dirname, 'src/renderer'),
  plugins: [react({
    babel: {
      plugins: [],
    }
  })],
  base: './',
  build: {
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src/renderer/src'),
      '@shared': resolve(__dirname, './src/shared'),
    },
  },
});
