import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `npm run build` -> normal Netlify build (dist/)
// `npm run build:demo` -> one self-contained HTML file in demo mode (dist-demo/)
export default defineConfig(({ mode }) => ({
  plugins: mode === 'demo' ? [react(), viteSingleFile()] : [react()],
  build: mode === 'demo' ? { outDir: 'dist-demo', assetsInlineLimit: 100000000 } : { outDir: 'dist' },
}));
