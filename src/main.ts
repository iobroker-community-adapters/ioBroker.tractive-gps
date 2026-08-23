import * as utils from '@iobroker/adapter-core';

import { TractiveAPI } from './lib/tractive-api';

const MINIMUM_INTERVAL_SECONDS = 120;
const MAXIMUM_INTERVAL_SECONDS = 3600;
const FULL_SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000;

class TractiveGPS extends utils.Adapter {
    private tractiveApi: TractiveAPI | null = null;
    private pollTimer: NodeJS.Timeout | null = null;
    private syncPromise: Promise<void> | null = null;
    private fullSyncPending = false;
    private lastFullSync = 0;
    private stopped = false;
    private readonly commandQueues = new Map<string, Promise<void>>();

    public constructor(options: Partial<utils.AdapterOptions> = {}) {
        super({
            ...options,
            name: 'tractive-gps',
        });
        this.on('ready', this.onReady.bind(this));
        this.on('stateChange', this.onStateChange.bind(this));
        this.on('message', this.onMessage.bind(this));
        this.on('unload', this.onUnload.bind(this));
    }

    private async onReady(): Promise<void> {
        this.stopped = false;
        await this.ensureLifecycleObjects();
        await this.setState('info.connection', false, true);
        await this.setState('info.dataFresh', false, true);
        await this.setState('info.status', 'starting', true);

        if (!this.config.email || !this.config.password) {
            await this.setState('info.status', 'missing_credentials', true);
            this.log.error('Missing credentials. Please enter your Tractive credentials in the adapter settings.');
            return;
        }

        this.tractiveApi = new TractiveAPI(
            this.log,
            this.getObjectAsync.bind(this),
            this.setState.bind(this),
            this.extendObjectAsync.bind(this),
            {
                reverseGeocoding: Boolean(this.config.reverseGeocoding),
                getDevicesAsync: this.getDevicesAsync.bind(this),
            },
        );

        if (!(await this.tractiveApi.initialize(this.config.email, this.config.password))) {
            await this.setState('info.status', 'authentication_failed', true);
            this.log.error('Login to Tractive failed. Please check your credentials.');
            return;
        }

        this.subscribeStates('info.refresh');
        this.subscribeStates('trackers.*.commands.*');
        await this.queueSync(true);
        this.scheduleNextSync();
    }

    private async ensureLifecycleObjects(): Promise<void> {
        await this.extendObjectAsync('info', {
            type: 'channel',
            common: {
                name: 'Information',
            },
            native: {},
        });
        await this.extendObjectAsync('info.refresh', {
            type: 'state',
            common: {
                name: 'Refresh data',
                type: 'boolean',
                role: 'button',
                read: false,
                write: true,
                def: false,
            },
            native: {},
        });
        await this.extendObjectAsync('info.lastSync', {
            type: 'state',
            common: {
                name: 'Last synchronization attempt',
                type: 'number',
                role: 'date',
                read: true,
                write: false,
                def: 0,
            },
            native: {},
        });
        await this.extendObjectAsync('info.lastSuccessfulSync', {
            type: 'state',
            common: {
                name: 'Last successful synchronization',
                type: 'number',
                role: 'date',
                read: true,
                write: false,
                def: 0,
            },
            native: {},
        });
        await this.extendObjectAsync('info.dataFresh', {
            type: 'state',
            common: {
                name: 'Data is fresh',
                type: 'boolean',
                role: 'indicator',
                read: true,
                write: false,
                def: false,
            },
            native: {},
        });
        await this.extendObjectAsync('info.status', {
            type: 'state',
            common: {
                name: 'Adapter status',
                type: 'string',
                role: 'text',
                read: true,
                write: false,
                def: 'starting',
                states: {
                    starting: 'Starting',
                    ok: 'OK',
                    synchronization_failed: 'Synchronization failed',
                    authentication_failed: 'Authentication failed',
                    missing_credentials: 'Missing credentials',
                    stopped: 'Stopped',
                },
            },
            native: {},
        });
    }

    private getPollIntervalMs(): number {
        const configured = Number(this.config.interval) || 300;
        const seconds = Math.min(MAXIMUM_INTERVAL_SECONDS, Math.max(MINIMUM_INTERVAL_SECONDS, configured));
        if (seconds !== configured) {
            this.log.warn(
                `Configured polling interval is outside the supported range; using ${seconds} seconds instead`,
            );
        }
        return seconds * 1000;
    }

    private scheduleNextSync(): void {
        if (this.stopped) {
            return;
        }
        if (this.pollTimer) {
            clearTimeout(this.pollTimer);
        }
        this.pollTimer = setTimeout(() => {
            this.pollTimer = null;
            const fullSyncDue = Date.now() - this.lastFullSync >= FULL_SYNC_INTERVAL_MS;
            void this.queueSync(fullSyncDue).finally(() => this.scheduleNextSync());
        }, this.getPollIntervalMs());
    }

    private queueSync(fullSync: boolean): Promise<void> {
        this.fullSyncPending ||= fullSync;
        if (!this.syncPromise) {
            this.syncPromise = this.runPendingSyncs().finally(() => {
                this.syncPromise = null;
            });
        }
        return this.syncPromise;
    }

    private async runPendingSyncs(): Promise<void> {
        while (!this.stopped && this.tractiveApi) {
            const fullSync = this.fullSyncPending;
            this.fullSyncPending = false;
            await this.performSync(fullSync);
            if (!this.fullSyncPending) {
                return;
            }
        }
    }

    private async performSync(fullSync: boolean): Promise<void> {
        if (!this.tractiveApi || this.stopped) {
            return;
        }

        await this.setState('info.lastSync', Date.now(), true);
        try {
            const result = fullSync
                ? await this.tractiveApi.updateAllData()
                : await this.tractiveApi.updateTrackersOnly();

            if (!result.success) {
                await this.setState('info.connection', false, true);
                await this.setState('info.dataFresh', false, true);
                await this.setState('info.status', 'synchronization_failed', true);
                this.log.warn('Tractive synchronization failed; the adapter will retry automatically');
                return;
            }

            const now = Date.now();
            if (fullSync) {
                this.lastFullSync = now;
            }
            await this.setState('info.connection', true, true);
            await this.setState('info.dataFresh', true, true);
            await this.setState('info.lastSuccessfulSync', now, true);
            await this.setState('info.status', 'ok', true);
        } catch {
            await this.setState('info.connection', false, true);
            await this.setState('info.dataFresh', false, true);
            await this.setState('info.status', 'synchronization_failed', true);
            this.log.error('Unexpected error during Tractive synchronization');
        }
    }

    private async onStateChange(id: string, state: ioBroker.State | null | undefined): Promise<void> {
        if (!state || state.ack) {
            return;
        }

        if (id === `${this.namespace}.info.refresh`) {
            await this.setState('info.refresh', false, true);
            await this.queueSync(true);
            return;
        }

        const prefix = `${this.namespace}.trackers.`;
        if (!id.startsWith(prefix) || typeof state.val !== 'boolean') {
            return;
        }
        const path = id.slice(prefix.length).split('.');
        if (path.length !== 3 || path[1] !== 'commands') {
            return;
        }

        const [trackerId, , command] = path;
        if (!trackerId || !['liveTracking', 'led', 'buzzer'].includes(command)) {
            return;
        }
        await this.queueTrackerCommand(trackerId, command, state.val, id);
    }

    private async onMessage(message: ioBroker.Message): Promise<void> {
        if (!message.callback) {
            return;
        }
        if (!/^system\.adapter\.admin\.\d+$/.test(message.from)) {
            this.sendTo(message.from, message.command, { success: false, error: 'Not authorized' }, message.callback);
            return;
        }
        if (message.command !== 'testConnection') {
            return;
        }
        const payload =
            message.message && typeof message.message === 'object'
                ? (message.message as { email?: unknown; password?: unknown })
                : {};
        const suppliedEmail = typeof payload.email === 'string' && payload.email ? payload.email : undefined;
        const suppliedPassword =
            typeof payload.password === 'string' && payload.password ? payload.password : undefined;
        const credentials =
            suppliedEmail && suppliedPassword
                ? { email: suppliedEmail, password: suppliedPassword }
                : this.config.email && this.config.password
                  ? { email: this.config.email, password: this.config.password }
                  : null;

        if (!credentials) {
            this.sendTo(
                message.from,
                message.command,
                { success: false, error: 'Missing credentials' },
                message.callback,
            );
            return;
        }

        const testApi = new TractiveAPI(
            this.log,
            this.getObjectAsync.bind(this),
            this.setState.bind(this),
            this.extendObjectAsync.bind(this),
            { requestIntervalMs: 0 },
        );
        try {
            const success = await testApi.initialize(credentials.email, credentials.password);
            this.sendTo(
                message.from,
                message.command,
                success ? { success: true } : { success: false, error: 'Authentication failed' },
                message.callback,
            );
        } finally {
            testApi.dispose();
        }
    }

    private async queueTrackerCommand(
        trackerId: string,
        command: string,
        enabled: boolean,
        stateId: string,
    ): Promise<void> {
        const previous = this.commandQueues.get(trackerId) ?? Promise.resolve();
        const current = previous
            .catch(() => undefined)
            .then(() => this.executeTrackerCommand(trackerId, command, enabled, stateId));
        this.commandQueues.set(trackerId, current);
        try {
            await current;
        } finally {
            if (this.commandQueues.get(trackerId) === current) {
                this.commandQueues.delete(trackerId);
            }
        }
    }

    private async executeTrackerCommand(
        trackerId: string,
        command: string,
        enabled: boolean,
        stateId: string,
    ): Promise<void> {
        if (!this.tractiveApi || this.stopped) {
            return;
        }
        const result =
            command === 'liveTracking'
                ? await this.tractiveApi.setLiveTracking(trackerId, enabled)
                : command === 'led'
                  ? await this.tractiveApi.setLed(trackerId, enabled)
                  : await this.tractiveApi.setBuzzer(trackerId, enabled);

        if (result.success) {
            await this.setState(stateId, enabled, true);
        } else {
            this.log.warn(`Tracker command ${command} failed`);
        }
    }

    private async onUnload(callback: () => void): Promise<void> {
        this.stopped = true;
        if (this.pollTimer) {
            clearTimeout(this.pollTimer);
            this.pollTimer = null;
        }
        this.tractiveApi?.dispose();
        this.commandQueues.clear();
        try {
            await this.setState('info.connection', false, true);
            await this.setState('info.dataFresh', false, true);
            await this.setState('info.status', 'stopped', true);
        } finally {
            callback();
        }
    }
}

if (require.main !== module) {
    module.exports = (options: Partial<utils.AdapterOptions> | undefined) => new TractiveGPS(options);
} else {
    (() => new TractiveGPS())();
}
