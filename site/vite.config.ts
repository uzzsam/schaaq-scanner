import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/', // Change to '/schaaq-scanner/' for GitHub Pages
  server: {
    port: 5174,
  },
});
