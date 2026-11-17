import tailwindcss from '@tailwindcss/postcss';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig({
  root: 'github-pages',
  base: '/main-study/',
  publicDir: fileURLToPath(new URL('./public', import.meta.url)),
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('.', import.meta.url)),
      'next/image': fileURLToPath(
        new URL('./github-pages/shims/next-image.tsx', import.meta.url),
      ),
      'next/link': fileURLToPath(
        new URL('./github-pages/shims/next-link.tsx', import.meta.url),
      ),
    },
  },
  css: { postcss: { plugins: [tailwindcss()] } },
  plugins: [react()],
  build: {
    outDir: fileURLToPath(new URL('./dist-github', import.meta.url)),
    emptyOutDir: true,
  },
});
