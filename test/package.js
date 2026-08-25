const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('path');
const { tests } = require('@iobroker/testing');

// Validate the package files
tests.packageFiles(path.join(__dirname, '..'));

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
