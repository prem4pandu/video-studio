import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  root: import.meta.dirname,
  base: '/app/',
  plugins: [react()],
  build: {
    outDir: resolve(import.meta.dirname, '../public/app'),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        entryFileNames: 'assets/studio.js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: asset => asset.names.some(name => name.endsWith('.css')) ? 'assets/studio.css' : 'assets/[name][extname]',
      },
    },
  },
});
