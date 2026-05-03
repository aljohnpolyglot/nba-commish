import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig(({mode: _mode}) => {
  return {
    plugins: [react(), tailwindcss(), cloudflare()],
    define: {
      'import.meta.env.VITE_APP_VERSION': JSON.stringify(
        new Date().toISOString().slice(0, 16).replace('T', ' ')
      ),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});