import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  base: '/tank-war/',
  build: { chunkSizeWarningLimit: 2000, target: 'es2020', rollupOptions: { input: {
    game: fileURLToPath(new URL('./index.html', import.meta.url)),
    balance: fileURLToPath(new URL('./balance.html', import.meta.url)),
  } } },
  server: { host: true },
});
