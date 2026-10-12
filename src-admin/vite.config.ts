import react from '@vitejs/plugin-react';
import { dirname, resolve } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

export default {
    plugins: [react()],
    base: './',
    resolve: {
        // Resolve React from the Admin workspace even when npm hoists it to the
        // repository root. Emotion, MUI, and the entry point must use one copy.
        alias: {
            react: dirname(require.resolve('react/package.json')),
            'react-dom': dirname(require.resolve('react-dom/package.json')),
        },
    },
    build: {
        target: 'chrome109',
        outDir: '../admin',
        emptyOutDir: false,
        rollupOptions: {
            input: resolve(import.meta.dirname, 'index_m.html'),
            output: {
                entryFileNames: 'index.js',
                chunkFileNames: 'assets/[name].js',
                assetFileNames: 'assets/[name][extname]',
            },
        },
    },
};
