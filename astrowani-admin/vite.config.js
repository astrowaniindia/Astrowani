import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' so the build can be served from any path (e.g. Express /admin).
export default defineConfig({
  plugins: [react()],
  base: './',
  server: { port: 5173 },
});
