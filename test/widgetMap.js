const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

// Exercise the actual component's effect lifecycle without network tiles or a browser.
function mapHarness() {
    const refs = [];
    const effects = [];
    const maps = [];
    let refIndex = 0;
    let effectIndex = 0;
    let pending = [];
    const react = {
        memo: component => component,
        useRef: value => (refs[refIndex++] ??= { current: value }),
        useEffect: (callback, deps) => {
            const index = effectIndex++;
            const previous = effects[index];
            if (!previous || deps.some((value, i) => !Object.is(value, previous.deps[i]))) {
                pending.push(() => {
                    previous?.cleanup?.();
                    effects[index] = { deps, cleanup: callback() };
                });
            }
        },
    };
    const layer = (kind, center) => ({
        kind,
        center,
        addTo(map) {
            map.layers.push(this);
            return this;
        },
        setLatLng(value) {
            this.center = value;
            return this;
        },
        setStyle() {
            return this;
        },
        setRadius() {
            return this;
        },
        bindPopup() {
            return this;
        },
        removeFrom(map) {
            map.layers = map.layers.filter(item => item !== this);
        },
    });
    const leaflet = {
        map: () => {
            const map = {
                layers: [],
                removed: false,
                fitBounds() {},
                setView() {},
                invalidateSize() {},
                remove() {
                    this.removed = true;
                },
            };
            maps.push(map);
            return map;
        },
        tileLayer: () => layer('tiles'),
        circleMarker: center => layer('marker', center),
        circle: center => layer('circle', center),
        latLng: () => ({ toBounds: () => [] }),
    };
    const exports = {};
    const source = fs.readFileSync(path.join(__dirname, '../src-widgets/src/PetMap.tsx'), 'utf8');
    const compiled = ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    }).outputText;
    vm.runInNewContext(compiled, {
        exports,
        require: name => {
            if (name === 'react') return react;
            if (name === 'react/jsx-runtime') return { jsx: (type, props) => ({ type, props }) };
            if (name === 'leaflet') return leaflet;
            if (name.startsWith('@mui/') || name.endsWith('.css')) return {};
            throw new Error(`Unexpected import: ${name}`);
        },
        document: { createElement: () => ({ appendChild() {} }), createTextNode: text => text },
        window: { requestAnimationFrame: () => 1, cancelAnimationFrame() {} },
        ResizeObserver: class {
            observe() {}
            disconnect() {}
        },
    });
    return {
        maps,
        render(props) {
            refIndex = effectIndex = 0;
            pending = [];
            const view = exports.default(props).props.children;
            const container = view.type(view.props);
            container.props.ref.current = {};
            pending.forEach(effect => effect());
        },
        unmount() {
            effects.forEach(effect => effect.cleanup?.());
        },
    };
}

describe('Leaflet widget lifecycle', () => {
    const initial = {
        latitude: 48,
        longitude: 13,
        accuracy: 30,
        range: 30,
        zoom: 17,
        minZoom: 3,
        maxZoom: 19,
        interactive: true,
        showAccuracyCircle: true,
        fitAccuracyRange: true,
        accuracyColor: '#00ff00',
        accuracyText: 'Accuracy',
        title: 'Pet',
    };

    for (const change of [{ interactive: false }, { minZoom: 4 }, { maxZoom: 18 }]) {
        it(`restores marker and range after changing ${Object.keys(change)[0]}`, () => {
            const harness = mapHarness();
            harness.render(initial);
            harness.render({ ...initial, ...change });
            assert.equal(harness.maps.length, 2);
            assert.equal(harness.maps[0].removed, true);
            const current = harness.maps[1];
            assert.deepEqual(Array.from(current.layers.find(item => item.kind === 'marker').center), [48, 13]);
            assert.equal(current.layers.filter(item => item.kind === 'circle').length, 1);
            harness.unmount();
            assert.equal(current.removed, true);
        });
    }

    it('updates coordinates and removes a hidden range without recreating the map', () => {
        const harness = mapHarness();
        harness.render(initial);
        harness.render({ ...initial, latitude: 49, showAccuracyCircle: false });
        assert.equal(harness.maps.length, 1);
        assert.deepEqual(Array.from(harness.maps[0].layers.find(item => item.kind === 'marker').center), [49, 13]);
        assert.equal(harness.maps[0].layers.filter(item => item.kind === 'circle').length, 0);
        harness.unmount();
    });
});
