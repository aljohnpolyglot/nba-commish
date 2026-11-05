import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(({mode: _mode}) => {
  const buildTime = new Date().toISOString();
  return {
    plugins: [react(), tailwindcss()],
    define: {
      'import.meta.env.VITE_APP_VERSION': JSON.stringify(
        buildTime.slice(0, 16).replace('T', ' ')
      ),
      'import.meta.env.VITE_BUILD_TIME': JSON.stringify(buildTime),
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
      proxy: {
        '/__data_proxy/play': {
          target: 'https://play.basketball-gm.com',
          changeOrigin: true,
          rewrite: path => path.replace(/^\/__data_proxy\/play/, ''),
        },
        '/__data_proxy/raw': {
          target: 'https://raw.githubusercontent.com',
          changeOrigin: true,
          rewrite: path => path.replace(/^\/__data_proxy\/raw/, ''),
        },
      },
      fs: {
        allow: process.env.VITE_ALLOW_STORE_DATA === 'true'
          ? [__dirname, path.resolve(__dirname, '../nba-store-data')]
          : [__dirname],
      },
    },
  };
});
