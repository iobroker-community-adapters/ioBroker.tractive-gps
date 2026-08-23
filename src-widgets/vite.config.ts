import { moduleFederationShared } from '@iobroker/types-vis-2/modulefederation.vis.config';
import { federation } from '@module-federation/vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import commonjs from 'vite-plugin-commonjs';
import tsconfigPaths from 'vite-tsconfig-paths';

const packageJson = JSON.parse(readFileSync('./package.json', 'utf8'));

export default {
    plugins: [
        federation({
            manifest: true,
            name: 'tractiveGpsWidgets',
            filename: 'customWidgets.js',
            exposes: {
                './PetTrackerCard': './src/PetTrackerCard',
                './translations': './src/translations',
            },
            remotes: {},
            shared: moduleFederationShared(packageJson),
            dts: false,
        }),
        react(),
        tsconfigPaths({ projects: ['./tsconfig.json'], ignoreConfigErrors: true }),
        commonjs(),
    ],
    base: './',
    build: {
        target: 'chrome89',
        outDir: '../widgets/tractive-gps',
        emptyOutDir: true,
    },
};
