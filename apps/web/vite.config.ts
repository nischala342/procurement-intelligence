import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const envDir = path.resolve(__dirname, '../..');
  const env = loadEnv(mode, envDir, '');
  return {
    plugins: [react()],
    envDir, // shared root .env
    server: {
      port: 5173,
      proxy: { '/api': { target: env.VITE_PROXY_TARGET || 'http://localhost:4000', changeOrigin: true } },
    },
  };
});
