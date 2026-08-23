import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default {
    plugins: [react()],
    base: './',
    resolve: {
        // The repository also contains a React 18 VIS-2 workspace. Always resolve
        // the Admin bundle against its own React 19 installation so Emotion and
        // MUI cannot pick up the hoisted React 18 peer dependency.
        alias: {
            react: resolve(import.meta.dirname, 'node_modules/react'),
            'react-dom': resolve(import.meta.dirname, 'node_modules/react-dom'),
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
