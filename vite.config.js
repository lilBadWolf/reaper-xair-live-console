import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { readFileSync } from 'node:fs';

// Builds ONE self-contained file, dist/live-console.html (no CDN, works offline).
// `npm run setup` / `npm run deploy` copy it into REAPER's reaper_www_root.
// `npm run dev` proxies REAPER's web API so you can develop with hot reload.
const REAPER = process.env.REAPER_URL || 'http://localhost:8080';
const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url)));

export default defineConfig({
  plugins: [vue(), viteSingleFile()],
  define: { __APP_VERSION__: JSON.stringify(version) },
  build: { outDir: 'dist', emptyOutDir: true, rollupOptions: { input: 'live-console.html' } },
  server: { host: true, open: '/live-console.html', proxy: { '/_': REAPER } },
});
