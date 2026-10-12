const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('path');
const { tests } = require('@iobroker/testing');

// Validate the package files
tests.packageFiles(path.join(__dirname, '..'));
require('./widgetMap');

describe('Logging dependency security regression', () => {
    const Module = require('node:module');
    // Check the copy actually used by the log rotator, not an unrelated hoisted copy.
    const rotatorRequire = Module.createRequire(require.resolve('file-stream-rotator'));
    const moment = rotatorRequire('moment');

    it('does not load paths from crafted locale objects or traversal strings', () => {
        const originalLoad = Module._load;
        const attempts = [];
        Module._load = function (request, ...args) {
            if (request.startsWith('./locale/')) {
                attempts.push(request);
                throw new Error('Blocked test locale module load');
            }
            return originalLoad.call(this, request, ...args);
        };
        try {
            for (const name of ['../security-probe', '..\\security-probe']) {
                for (const input of [name, { match: () => true, toString: () => name, toLowerCase: () => name }]) {
                    try {
                        moment.locale(input);
                    } catch {
                        // Rejecting malformed input is acceptable; loading a path is not.
                    }
                }
            }
        } finally {
            Module._load = originalLoad;
            moment.locale('en');
        }
        assert.deepEqual(attempts, []);
    });

    it('preserves ordinary log timestamp formatting and supported locales', () => {
        assert.equal(moment.utc('2026-10-12T12:34:56Z').format('YYYY-MM-DD HH:mm:ss'), '2026-10-12 12:34:56');
        assert.equal(moment.locale('de'), 'de');
        assert.equal(moment.utc('2026-10-12').format('MMMM'), 'Oktober');
        moment.locale('en');
    });
});

describe('Validate maintenance dependency policy', () => {
    const adapterPackage = require('../package.json');

    it('keeps the intentionally pinned development-server fork', () => {
        assert.equal(
            adapterPackage.devDependencies['@iobroker/dev-server'],
            'https://codeload.github.com/xXBJXx/dev-server/tar.gz/c0338ae',
        );
    });

    it('uses test utilities supplied by @iobroker/testing without duplicate direct dependencies', () => {
        for (const name of ['chai', 'chai-as-promised', 'mocha', 'sinon', 'sinon-chai']) {
            assert.equal(adapterPackage.devDependencies[name], undefined);
            assert.equal(adapterPackage.devDependencies[`@types/${name}`], undefined);
            assert.doesNotThrow(() => require.resolve(name));
        }
    });

    it('keeps Admin and VIS widget React and MUI versions aligned', () => {
        const admin = require('../src-admin/package.json').devDependencies;
        const widgets = require('../src-widgets/package.json').devDependencies;
        for (const name of ['react', 'react-dom', '@types/react', '@types/react-dom', '@mui/material']) {
            assert.equal(admin[name], widgets[name], name);
        }
    });
});

describe('Validate classic VIS 1 widget files', () => {
    const adapterRoot = path.join(__dirname, '..');
    const widgetHtml = path.join(adapterRoot, 'widgets', 'tractive-gps.html');
    const widgetDirectory = path.join(adapterRoot, 'widgets', 'tractive-gps', 'vis1');
    const widgetSourceDirectory = path.join(adapterRoot, 'src-widgets', 'public', 'vis1');

    it('ships the template, implementation, styles, and Leaflet runtime', () => {
        for (const file of [
            widgetHtml,
            path.join(widgetDirectory, 'tractive-gps-vis1.js'),
            path.join(widgetDirectory, 'tractive-gps-vis1.css'),
            path.join(widgetDirectory, 'vendor', 'leaflet', 'leaflet.js'),
            path.join(widgetDirectory, 'vendor', 'leaflet', 'leaflet.css'),
            path.join(widgetDirectory, 'vendor', 'leaflet', 'LICENSE'),
            path.join(widgetSourceDirectory, 'tractive-gps-vis1.js'),
            path.join(widgetSourceDirectory, 'tractive-gps-vis1.css'),
            path.join(widgetSourceDirectory, 'vendor', 'leaflet', 'leaflet.js'),
        ]) {
            assert.equal(fs.existsSync(file), true, `${file} must be included`);
        }
    });

    it('registers the classic widget and all tracker commands', () => {
        const template = fs.readFileSync(widgetHtml, 'utf8');
        assert.match(template, /class="vis-tpl"/);
        assert.match(template, /tplTractiveGpsPetTrackerCard/);
        assert.match(template, /widgets\/tractive-gps\/vis1\/tractive-gps-vis1\.js/);
        assert.match(template, /buzzerCommandOid\/id/);
        assert.match(template, /ledCommandOid\/id/);
        assert.match(template, /liveTrackingCommandOid\/id/);
    });
});

describe('Validate native VIS 2 widget compatibility', () => {
    const adapterRoot = path.join(__dirname, '..');
    const widgetDirectory = path.join(adapterRoot, 'widgets', 'tractive-gps');
    const widgetPackage = require('../src-widgets/package.json');
    const ioPackage = require('../io-package.json');

    it('declares React 19 and MUI 9 without requiring VIS 2 for backend or VIS 1 users', () => {
        assert.match(widgetPackage.devDependencies.react, /^\^19\./);
        assert.match(widgetPackage.devDependencies['react-dom'], /^\^19\./);
        assert.match(widgetPackage.devDependencies['@types/react'], /^\^19\./);
        assert.match(widgetPackage.devDependencies['@types/react-dom'], /^\^19\./);
        assert.match(widgetPackage.devDependencies['@mui/material'], /^\^?9\./);
        assert.equal(widgetPackage.devDependencies['react-leaflet'], undefined);
        assert.equal(
            ioPackage.common.globalDependencies.some(dependency => dependency['vis-2'] !== undefined),
            false,
        );
    });

    it('ships a module-federation manifest built with React 19 and MUI 9', () => {
        const manifest = JSON.parse(fs.readFileSync(path.join(widgetDirectory, 'mf-manifest.json'), 'utf8'));
        const sharedVersions = Object.fromEntries(manifest.shared.map(dependency => [dependency.name, dependency.version]));
        assert.match(sharedVersions.react, /^19\./);
        assert.match(sharedVersions['react-dom'], /^19\./);
        assert.match(sharedVersions['react/jsx-runtime'], /^19\./);
        assert.match(sharedVersions['@mui/material'], /^9\./);
    });

    it('does not ship the incompatible React 18 JSX runtime internals', () => {
        const javascript = fs
            .readdirSync(path.join(widgetDirectory, 'assets'))
            .filter(file => file.endsWith('.js'))
            .map(file => fs.readFileSync(path.join(widgetDirectory, 'assets', file), 'utf8'))
            .join('\n');
        assert.doesNotMatch(javascript, /ReactCurrentOwner/);
        assert.doesNotMatch(javascript, /Symbol\.for\(["']react\.element["']\)/);
    });
});
