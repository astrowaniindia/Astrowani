import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' so one build serves from any mount point: nginx at manu.astrowani.com root
// AND the backend's Express mount at /admin (astrowani-backend/index.js).
//
// CONSTRAINT this imposes: every route in App.jsx must be a SINGLE path segment.
// Relative asset URLs resolve against the current path, so a two-segment route like
// /store/products asks for /store/assets/index-*.js -- which the SPA fallback answers
// with index.html, and the browser refuses to run HTML as a type="module" script.
// Result is a silently blank page. Use /store-products, not /store/products.
// Lifting this means switching to base '/' and giving the /admin mount its own build.
export default defineConfig({
  plugins: [react()],
  base: './',
  server: { port: 5173 },
});
