import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
    test: {
        globals: true,
        environment: 'happy-dom', // Provides browser-like environment with window object
        setupFiles: ['./src/test/setup.ts'],
    },
    resolve: {
        alias: {
            '@model': path.resolve(__dirname, 'src/model'),
            '@view': path.resolve(__dirname, 'src/view'),
            '@controller': path.resolve(__dirname, 'src/controller'),
            '@helpers': path.resolve(__dirname, 'src/helpers'),
            '@core': path.resolve(__dirname, 'src/core'),
        },
    },
});