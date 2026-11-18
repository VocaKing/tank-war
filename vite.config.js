import { defineConfig } from 'vite';

export default defineConfig({
  base: process.env.CI ? '/tank-war/' : './',
  build: { chunkSizeWarningLimit: 2000, target: 'es2020' },
  server: { host: true },
});
