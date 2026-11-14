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
        manualChunks: {
          config: ['./src/config.js'],
          simulation: ['./src/state.js', './src/simulation.js', './src/actions.js'],
        },
      },
    },
  },
  server: {
    port: 3000,
    open: true,
  },
});