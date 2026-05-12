import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@model': path.resolve(__dirname, 'src/model'),
      '@view': path.resolve(__dirname, 'src/view'),
      '@controller': path.resolve(__dirname, 'src/controller'),
      '@helpers': path.resolve(__dirname, 'src/helpers'),
      '@core': path.resolve(__dirname, 'src/core'),
    },
  },
  build: {
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
        editor: path.resolve(__dirname, 'editor/index.html'),
      },
    },
  },
});
