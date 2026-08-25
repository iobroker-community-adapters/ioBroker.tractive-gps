(function () {
    'use strict';

    var SET_NAME = 'tractive-gps';
    var instances = {};
    var oidFields = [
        'trackerNameOid', 'petNameOid', 'petTypeOid', 'genderOid', 'birthdayOid', 'weightOid',
        'batteryOid', 'chargingStateOid', 'onlineOid', 'staleOid', 'lastSeenOid', 'sensorUsedOid',
        'homeOid', 'distanceOid', 'powerSavingOid', 'positionAccuracyOid', 'speedOid', 'altitudeOid',
        'latitudeOid', 'longitudeOid', 'addressOid', 'imageOid', 'buzzerCommandOid', 'ledCommandOid',
        'liveTrackingCommandOid'
    ];

    function value(data, name) {
        var oid = data[name];
        return oid ? vis.states[oid + '.val'] : undefined;
    }

    function numberValue(data, name) {
        var result = Number(value(data, name));
        return Number.isFinite(result) ? result : undefined;
    }

    function boolValue(data, name) {
        var result = value(data, name);
        return result === true || result === 1 || result === 'true' || result === '1';
    }

    function escapeHtml(input) {
        return String(input == null ? '' : input)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function display(input, suffix) {
        return input === undefined || input === null || input === '' ? '—' : escapeHtml(input) + (suffix || '');
    }

    function formatDate(input) {
        var timestamp = Number(input);
        if (!Number.isFinite(timestamp) || timestamp <= 0) return '—';
        if (timestamp < 100000000000) timestamp *= 1000;
        return new Date(timestamp).toLocaleString();
    }

    function formatAge(input, language) {
        var timestamp = Number(input);
        if (!Number.isFinite(timestamp) || timestamp <= 0) return '—';
        if (timestamp < 100000000000) timestamp *= 1000;
        var years = Math.max(0, Math.floor((Date.now() - timestamp) / 31556952000));
        return years + (language === 'de' ? (years === 1 ? ' Jahr' : ' Jahre') : (years === 1 ? ' year' : ' years'));
    }

    function formatDistance(input) {
        var distance = Number(input);
        if (!Number.isFinite(distance)) return '—';
        return distance >= 1000 ? (distance / 1000).toFixed(1) + ' km' : Math.round(distance) + ' m';
    }

    function resolveImagePath(input) {
        if (!input) return '';
        var path = String(input);
        if (path.indexOf('_PRJ_NAME') === 0) {
            var project = vis.project || 'main';
            return '../vis.0/' + project + path.substring(9);
        }
        return path;
    }

    function labels() {
        var language = String((vis.language || navigator.language || 'en')).toLowerCase();
        var de = language.indexOf('de') === 0;
        return {
            language: de ? 'de' : 'en',
            online: de ? 'Online' : 'Online', offline: de ? 'Offline' : 'Offline', stale: de ? 'Veraltet' : 'Stale',
            commands: de ? 'Befehle' : 'Commands', buzzer: de ? 'Signalton' : 'Buzzer', led: 'LED',
            liveTracking: de ? 'Live-Tracking' : 'Live tracking', location: de ? 'Position' : 'Location',
            tracker: de ? 'Tracker' : 'Tracker', pet: de ? 'Tier' : 'Pet', positionSource: de ? 'Positionsquelle' : 'Position source',
            lastUpdate: de ? 'Letzte Aktualisierung' : 'Last update', homeAway: de ? 'Zuhause / unterwegs' : 'Home / away',
            atHome: de ? 'Zuhause' : 'At home', away: de ? 'Unterwegs' : 'Away', distance: de ? 'Entfernung' : 'Distance',
            address: de ? 'Adresse' : 'Address', battery: de ? 'Batterie' : 'Battery', charging: de ? 'Ladezustand' : 'Charging state',
            accuracy: de ? 'Positionsgenauigkeit' : 'Position accuracy', speed: de ? 'Geschwindigkeit' : 'Speed',
            altitude: de ? 'Höhe' : 'Altitude', powerSaving: de ? 'Energiesparen' : 'Power saving', yes: de ? 'Ja' : 'Yes', no: de ? 'Nein' : 'No',
            gender: de ? 'Geschlecht' : 'Gender', age: de ? 'Alter' : 'Age', weight: de ? 'Gewicht' : 'Weight',
            noImage: de ? 'Kein Tierbild' : 'No pet image', noPosition: de ? 'Keine Position verfügbar' : 'No position available'
        };
    }

    function info(icon, label, valueText, extraClass) {
        return '<div class="tg-info ' + (extraClass || '') + '"><span class="tg-info-icon">' + icon + '</span><span><span class="tg-label">' +
            escapeHtml(label) + '</span><strong>' + valueText + '</strong></span></div>';
    }

    function command(data, field, label, icon) {
        var oid = data[field];
        if (!oid) return '';
        return '<label class="tg-command"><input type="checkbox" data-command="' + escapeHtml(field) + '" ' +
            (boolValue(data, field) ? 'checked ' : '') + (vis.editMode ? 'disabled ' : '') + '/><span class="tg-switch"></span><span>' + icon + ' ' +
            escapeHtml(label) + '</span></label>';
    }

    function destroyMap(instance) {
        if (instance && instance.map) {
            instance.map.remove();
            instance.map = null;
        }
    }

    function createMap(instance, data, label) {
        var element = document.getElementById(instance.wid + '-map');
        var latitude = numberValue(data, 'latitudeOid');
        var longitude = numberValue(data, 'longitudeOid');
        if (!element || latitude === undefined || longitude === undefined || !window.L) return;

        var minZoom = Math.max(1, Math.min(19, Math.round(Number(data.mapMinZoom) || 3)));
        var maxZoom = Math.max(minZoom, Math.min(19, Math.round(Number(data.mapMaxZoom) || 19)));
        var zoom = Math.max(minZoom, Math.min(maxZoom, Math.round(Number(data.mapZoom) || 16)));
        var interactive = data.mapInteractive !== false && data.mapInteractive !== 'false';
        var map = L.map(element, {
            minZoom: minZoom,
            maxZoom: maxZoom,
            zoomControl: interactive,
            dragging: interactive,
            scrollWheelZoom: interactive,
            doubleClickZoom: interactive,
            boxZoom: interactive,
            keyboard: interactive,
            touchZoom: interactive
        }).setView([latitude, longitude], zoom);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            minZoom: minZoom,
            maxZoom: maxZoom,
            attribution: '&copy; OpenStreetMap contributors'
        }).addTo(map);

        L.circleMarker([latitude, longitude], {
            radius: 8,
            color: '#fff',
            weight: 3,
            fillColor: data.accuracyColor || '#0098d8',
            fillOpacity: 1
        }).addTo(map).bindTooltip(label);

        var configuredRange = Number(data.mapRange);
        var accuracy = numberValue(data, 'positionAccuracyOid');
        var range = configuredRange > 0 ? configuredRange : accuracy;
        if (data.showAccuracyCircle !== false && data.showAccuracyCircle !== 'false' && Number.isFinite(range) && range > 0) {
            var circle = L.circle([latitude, longitude], {
                radius: Math.min(1000000, range),
                color: data.accuracyColor || '#0098d8',
                weight: 2,
                fillOpacity: 0.13
            }).addTo(map);
            if (data.fitAccuracyRange !== false && data.fitAccuracyRange !== 'false') {
                map.fitBounds(circle.getBounds(), { padding: [24, 24], maxZoom: maxZoom });
            }
        }
        instance.map = map;
        setTimeout(function () { if (instance.map) instance.map.invalidateSize(); }, 50);
    }

    function render(instance) {
        var root = document.getElementById(instance.wid);
        if (!root) return;
        destroyMap(instance);
        var data = instance.data;
        var t = labels();
        var trackerName = value(data, 'trackerNameOid');
        var petName = value(data, 'petNameOid');
        var title = petName || trackerName || 'Tractive GPS';
        var petType = value(data, 'petTypeOid');
        var online = boolValue(data, 'onlineOid');
        var stale = boolValue(data, 'staleOid');
        var sensor = value(data, 'sensorUsedOid');
        var homeState = value(data, 'homeOid');
        var home = typeof homeState === 'boolean' ? homeState : String(sensor || '').toUpperCase() === 'KNOWN_WIFI';
        var hasHome = typeof homeState === 'boolean' || sensor;
        var battery = numberValue(data, 'batteryOid');
        var accuracy = numberValue(data, 'positionAccuracyOid');
        var speed = numberValue(data, 'speedOid');
        var altitude = numberValue(data, 'altitudeOid');
        var weight = numberValue(data, 'weightOid');
        var image = resolveImagePath(value(data, 'imageOid'));
        var customImage = resolveImagePath(data.customImage);
        var dark = document.body.classList.contains('dark') || document.body.classList.contains('dark-theme') ||
            (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
        root.classList.toggle('tg-dark', !!dark);

        var commands = command(data, 'buzzerCommandOid', t.buzzer, '🔔') + command(data, 'ledCommandOid', t.led, '💡') +
            command(data, 'liveTrackingCommandOid', t.liveTracking, '📡');
        var imageHtml = image || customImage
            ? '<img class="tg-pet-image" src="' + escapeHtml(image || customImage) + '" data-fallback="' + escapeHtml(image && customImage ? customImage : '') + '" alt="' + escapeHtml(title) + '" />'
            : '<div class="tg-image-placeholder"><span>🐾</span>' + escapeHtml(t.noImage) + '</div>';
        var hasPosition = numberValue(data, 'latitudeOid') !== undefined && numberValue(data, 'longitudeOid') !== undefined;

        root.innerHTML = '<article class="tg-card">' +
            '<header class="tg-header"><span class="tg-avatar">🐾</span><span class="tg-title"><strong>' + escapeHtml(title) + '</strong><small>' + display(trackerName) + '</small></span>' +
            (petType ? '<span class="tg-type">' + escapeHtml(petType) + '</span>' : '') + '<span class="tg-online ' + (online ? 'is-online' : 'is-offline') + '">' +
            escapeHtml(stale ? t.stale : (online ? t.online : t.offline)) + '</span></header>' +
            '<div class="tg-image-wrap">' + imageHtml + '</div>' +
            (hasPosition ? '<div id="' + escapeHtml(instance.wid) + '-map" class="tg-map"></div>' : '<div class="tg-map tg-no-position">📍 ' + escapeHtml(t.noPosition) + '</div>') +
            (commands ? '<section class="tg-command-section"><h3>' + escapeHtml(t.commands) + '</h3><div class="tg-commands">' + commands + '</div></section>' : '') +
            '<div class="tg-sections"><section><h3>' + escapeHtml(t.location) + '</h3>' +
            info('📶', t.positionSource, display(sensor)) + info('🕒', t.lastUpdate, formatDate(value(data, 'lastSeenOid'))) +
            info('🏠', t.homeAway, hasHome ? escapeHtml((home ? t.atHome : t.away) + (sensor ? ' · ' + sensor : '')) : '—') +
            info('📏', t.distance, formatDistance(value(data, 'distanceOid'))) + info('📍', t.address, display(value(data, 'addressOid')), 'tg-wide') + '</section>' +
            '<section><h3>' + escapeHtml(t.tracker) + '</h3>' +
            info('🔋', t.battery, battery === undefined ? '—' : Math.max(0, Math.min(100, battery)) + '%') +
            '<div class="tg-battery"><span style="width:' + (battery === undefined ? 0 : Math.max(0, Math.min(100, battery))) + '%"></span></div>' +
            info('🔌', t.charging, display(value(data, 'chargingStateOid'))) + info('🎯', t.accuracy, accuracy === undefined ? '—' : '±' + escapeHtml(accuracy) + ' m') +
            info('💨', t.speed, speed === undefined ? '—' : escapeHtml(speed) + ' km/h') + info('⛰️', t.altitude, altitude === undefined ? '—' : escapeHtml(altitude) + ' m') +
            info('🔋', t.powerSaving, boolValue(data, 'powerSavingOid') ? escapeHtml(t.yes) : escapeHtml(t.no)) + '</section>' +
            '<section><h3>' + escapeHtml(t.pet) + '</h3>' + info('⚥', t.gender, display(value(data, 'genderOid'))) +
            info('ℹ️', t.age, formatAge(value(data, 'birthdayOid'), t.language)) + info('⚖️', t.weight, weight === undefined ? '—' : escapeHtml(weight) + ' kg') + '</section></div>' +
            '</article>';

        var imageElement = root.querySelector('.tg-pet-image');
        if (imageElement) {
            imageElement.addEventListener('error', function () {
                var fallback = imageElement.getAttribute('data-fallback');
                if (fallback && imageElement.src.indexOf(fallback) === -1) {
                    imageElement.src = fallback;
                } else {
                    imageElement.parentNode.innerHTML = '<div class="tg-image-placeholder"><span>🐾</span>' + escapeHtml(t.noImage) + '</div>';
                }
            });
        }
        Array.prototype.forEach.call(root.querySelectorAll('[data-command]'), function (input) {
            input.addEventListener('change', function () {
                var oid = data[input.getAttribute('data-command')];
                if (oid && !vis.editMode) vis.setValue(oid, input.checked);
            });
        });
        if (hasPosition) createMap(instance, data, String(title));
    }

    function subscribe(instance) {
        oidFields.forEach(function (field) {
            var oid = instance.data[field];
            if (!oid) return;
            var handler = function () { render(instance); };
            instance.subscriptions.push({ id: oid + '.val', handler: handler });
            vis.states.bind(oid + '.val', handler);
        });
    }

    vis.binds[SET_NAME] = {
        version: '1.0.0',
        init: function (wid, view, data, style) {
            if (instances[wid]) this.destroy(wid);
            var instance = { wid: wid, view: view, data: data || {}, style: style || {}, subscriptions: [], map: null };
            instances[wid] = instance;
            setTimeout(function () {
                if (!document.getElementById(wid)) return;
                render(instance);
                subscribe(instance);
            }, 0);
        },
        destroy: function (wid) {
            var instance = instances[wid];
            if (!instance) return;
            destroyMap(instance);
            instance.subscriptions.forEach(function (subscription) {
                if (vis.states.unbind) vis.states.unbind(subscription.id, subscription.handler);
            });
            delete instances[wid];
        }
    };
})();
