import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '..', '');
  const host = env.FRONTEND_HOST ?? '127.0.0.1';
  if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(host)) {
    throw new Error('FRONTEND_HOST must be localhost, 127.0.0.1, or ::1 for local development.');
  }

  return {
    plugins: [react()],
    envDir: '..',
    server: {
      host,
      port: Number(env.FRONTEND_PORT ?? 5173),
      strictPort: true,
    },
  };
});
