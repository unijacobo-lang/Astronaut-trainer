import { defineConfig } from 'vite';

// https://vitejs.dev/config/
export default defineConfig({
  // Repository name on GitHub Pages: https://unijacobo-lang.github.io/Astronaut-trainer/
  base: '/Astronaut-trainer/',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
    minify: 'esbuild',
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (id.includes('config.js')) return 'config';
          if (id.includes('state.js') || id.includes('simulation.js') || id.includes('actions.js')) return 'simulation';
        },
      },
    },
  },
  server: {
    port: 3000,
    open: true,
  },
});