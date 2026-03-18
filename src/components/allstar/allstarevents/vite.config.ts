import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  // Load ALL env vars (empty prefix = no filter)
  const env = loadEnv(mode, '.', '');

  return {
    plugins: [react(), tailwindcss()],

    define: {
      // Expose every Gemini key to the bundle via process.env.*
      // (VITE_ vars are already on import.meta.env, but this keeps
      //  backwards compat with any code using process.env)
      'process.env.GEMINI_API_KEY':         JSON.stringify(env.VITE_GEMINI_API_KEY         ?? ''),
      'process.env.GEMINI_API_KEY_ALT':     JSON.stringify(env.VITE_GEMINI_API_KEY_ALT     ?? ''),
      'process.env.GEMINI_API_KEY_ALT_2':   JSON.stringify(env.VITE_GEMINI_API_KEY_ALT_2   ?? ''),
      'process.env.GEMINI_API_KEY_ALT_3':   JSON.stringify(env.VITE_GEMINI_API_KEY_ALT_3   ?? ''),
      'process.env.GEMINI_API_KEY_ALT_4':   JSON.stringify(env.VITE_GEMINI_API_KEY_ALT_4   ?? ''),
      'process.env.GEMINI_API_KEY_ALT_5':   JSON.stringify(env.VITE_GEMINI_API_KEY_ALT_5   ?? ''),
      'process.env.GEMINI_API_KEY_ALT_6':   JSON.stringify(env.VITE_GEMINI_API_KEY_ALT_6   ?? ''),
      'process.env.GEMINI_API_KEY_ALT_7':   JSON.stringify(env.VITE_GEMINI_API_KEY_ALT_7   ?? ''),
      'process.env.GEMINI_API_KEY_ALT_8':   JSON.stringify(env.VITE_GEMINI_API_KEY_ALT_8   ?? ''),
      'process.env.GEMINI_API_KEY_ALT_9':   JSON.stringify(env.VITE_GEMINI_API_KEY_ALT_9   ?? ''),
      'process.env.GEMINI_API_KEY_ALT_10':  JSON.stringify(env.VITE_GEMINI_API_KEY_ALT_10  ?? ''),
      'process.env.GEMINI_API_KEY_ALT_11':  JSON.stringify(env.VITE_GEMINI_API_KEY_ALT_11  ?? ''),
    },

    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },

    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});