"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = __importStar(require("@iobroker/adapter-core"));
// Load your modules here, e.g.:
// import 'source-map-support/register.js';
const axios_1 = __importDefault(require("axios"));
const cron_1 = require("cron");
const geo_position_ts_1 = require("geo-position.ts");
const source_map_support_1 = __importDefault(require("source-map-support"));
const object_definition_1 = require("./lib/object_definition");
source_map_support_1.default.install();
// Global variables here
class TractiveGPS extends utils.Adapter {
    constructor(options = {}) {
        super({
            ...options,
            name: 'tractive-gps',
        });
        this.on('ready', this.onReady.bind(this));
        this.on('stateChange', this.onStateChange.bind(this));
        this.on('message', this.onMessage.bind(this));
        this.on('unload', this.onUnload.bind(this));
        this.requestTimer = null;
        this.interval = 60000;
        this.client_id = '5f9be055d8912eb21a4cd7ba';
        this.allData = {
            userInfo: {
                user_id: '',
                expires_at: 0,
            },
            trackers: [],
            tracker: [],
            device_hw_report: [],
            positions: [],
            device_pos_report: [],
        };
    }
    /**
     * Is called when databases are connected and adapter received configuration.
     */
    async onReady() {
        // Initialize your adapter here
        this.writeLog(`[Adapter v.${this.version} onReady] Starting adapter`, 'debug');
        // convert the interval to milliseconds and add a random value between 0 and 100
        this.interval = this.config.interval * 1000 + Math.floor(Math.random() * 100);
        // Reset the connection indicator during startup
        await this.setStateAsync('info.connection', false, true);
        // check if the access data are available
        if (this.config.email && this.config.password) {
            // check if user_id and expires_at is greater than 0, and access_token is present
            if (this.config.user_id && this.config.expires_at > 0 && this.config.access_token) {
                // check if expires_at is smaller than now
                // convert Date.now() to seconds
                const now = Math.round(Date.now() / 1000);
                if (this.config.expires_at < now) {
                    // get new access token when expires_at is smaller than now
                    this.writeLog(`[Adapter v.${this.version} onReady] access_token expired`, 'debug');
                    await this.getAccessToken();
                    await this.setStateAsync('info.connection', true, true);
                }
                else {
                    this.writeLog(`[Adapter v.${this.version} onReady] access_token valid`, 'debug');
                    this.allData.userInfo.user_id = this.config.user_id;
                    this.allData.userInfo.expires_at = this.config.expires_at;
                    await this.createCronjob();
                    // start the requestData timer
                    this.writeLog(`[Adapter v.${this.version} onReady] start requestData`, 'debug');
                    await this.requestData();
                    await this.setStateAsync('info.connection', true, true);
                }
            }
            else {
                // get new access token
                this.writeLog(`[Adapter v.${this.version} onReady] access_token not available call new access_token`, 'debug');
                await this.getAccessToken();
                await this.setStateAsync('info.connection', true, true);
            }
        }
        else {
            this.writeLog(`[Adapter v.${this.version} onReady] email and password are required`, 'error');
        }
    }
    // create a cronjob to get new access_token wenn expires_at is reached
    async createCronjob() {
        // create the cronjob
        this.writeLog(`[Adapter v.${this.version} createCronjob] create cronjob`, 'debug');
        const expires_at = this.config.expires_at;
        console.log('expires_at: ', new Date(expires_at * 1000));
        const cronjob = new cron_1.CronJob(new Date(expires_at * 1000), async () => {
            this.writeLog(`[Adapter v.${this.version} createCronjob] get new access_token`, 'debug');
            console.log(`[Adapter v.${this.version} createCronjob] get new access_token`);
            await this.getAccessToken();
        }, null, true, 'Europe/Berlin');
        console.log('cronjob: ', cronjob);
    }
    async requestData() {
        // Request data from all Key Lights every 5 minutes
        if (this.requestTimer)
            this.clearTimeout(this.requestTimer);
        await this.getTrackers();
        await this.getTrackerInfo();
        await this.getTrackerDeviceHwReport();
        await this.getTrackerLocation();
        // await this.getTrackerPosition('1674226858', '1674313258');
        await this.createStates();
        await this.writeAllData();
        console.log('all data', this.allData);
        this.requestTimer = this.setTimeout(() => {
            this.writeLog(`[Adapter v.${this.version} requestData] next request in ${this.interval} ms`, 'debug');
            this.requestData();
        }, this.interval);
    }
    // write all data in the state
    async writeAllData() {
        for (const device of this.allData.trackers) {
            for (const [key, value] of Object.entries(device)) {
                await this.setStateAsync(`${device._id}.trackers.${key}`, { val: value, ack: true });
            }
        }
        for (const device of this.allData.tracker) {
            for (const [key, value] of Object.entries(device)) {
                // if key is capabilities and supported_geofence_types then write the data with JSON.stringify
                if (typeof value === 'object' && value !== null) {
                    await this.setStateAsync(`${device._id}.tracker.${key}`, {
                        val: JSON.stringify(value),
                        ack: true,
                    });
                }
                else {
                    await this.setStateAsync(`${device._id}.tracker.${key}`, { val: value, ack: true });
                }
            }
        }
        for (const device of this.allData.device_hw_report) {
            for (const [key, value] of Object.entries(device)) {
                if (typeof value === 'object' && value !== null) {
                    await this.setStateAsync(`${device._id}.device_hw_report.${key}`, {
                        val: JSON.stringify(value),
                        ack: true,
                    });
                }
                else {
                    await this.setStateAsync(`${device._id}.device_hw_report.${key}`, { val: value, ack: true });
                }
            }
        }
        for (const device of this.allData.device_pos_report) {
            for (const [key, value] of Object.entries(device)) {
                // if key is latlong then write the data with JSON.stringify and split in latitude,longitude
                if (key === 'latlong') {
                    await this.setStateAsync(`${device._id}.device_pos_report.${key}`, {
                        val: JSON.stringify(value),
                        ack: true,
                    });
                    await this.setStateAsync(`${device._id}.device_pos_report.latitude`, {
                        val: value[0],
                        ack: true,
                    });
                    await this.setStateAsync(`${device._id}.device_pos_report.longitude`, {
                        val: value[1],
                        ack: true,
                    });
                    const sysConfig = await this.getForeignObjectAsync('system.config');
                    if (sysConfig && sysConfig.common && sysConfig.common.longitude && sysConfig.common.latitude) {
                        const sysPoint = new geo_position_ts_1.GeoPosition(sysConfig.common.latitude, sysConfig.common.longitude);
                        const petPoint = new geo_position_ts_1.GeoPosition(value[0], value[1]);
                        await this.setStateAsync(`${device._id}.device_pos_report.distance`, {
                            val: Number(sysPoint.Distance(petPoint).toFixed(0)),
                            ack: true,
                        });
                    }
                    else {
                        this.writeLog('No gps coordinates of system found!', 'warn');
                    }
                }
                else {
                    if (typeof value === 'object' && value !== null) {
                        await this.setStateAsync(`${device._id}.device_pos_report.${key}`, {
                            val: JSON.stringify(value),
                            ack: true,
                        });
                    }
                    else {
                        await this.setStateAsync(`${device._id}.device_pos_report.${key}`, { val: value, ack: true });
                    }
                }
            }
            if (this.allData.positions.length !== 0) {
                for (const positionsDevice of this.allData.positions) {
                    for (const [key, value] of Object.entries(positionsDevice)) {
                        await this.setStateAsync(`${device._id}.positions.${key}`, {
                            val: JSON.stringify(value),
                            ack: true,
                        });
                    }
                }
            }
            else {
                // check if the object positions already exists
                const obj = await this.getObjectAsync(`${device._id}.positions.0`);
                if (obj) {
                    await this.setStateAsync(`${device._id}.positions.0`, {
                        val: JSON.stringify([]),
                        ack: true,
                    });
                }
            }
        }
        await this.setStateAsync('json', JSON.stringify(this.allData), true);
    }
    /**
     * create the all states for the adapter
     */
    async createStates() {
        // create the device channel for all devices in the this.allData.trackers array
        for (const device of this.allData.trackers) {
            // console.log('device', device);
            // create the device channel
            if (this.config.nameArray.length > 0) {
                console.log('this.config.nameArray', this.config.nameArray);
                for (const object of this.config.nameArray) {
                    if (object.id === device._id) {
                        await this.setObjectNotExistsAsync(device._id, {
                            type: 'device',
                            common: {
                                name: object.name,
                            },
                            native: {},
                        });
                        // create the channel for the device
                        await this.setObjectNotExistsAsync(`${device._id}.trackers`, {
                            type: 'channel',
                            common: {
                                name: 'trackers',
                            },
                            native: {},
                        });
                        await this.setObjectNotExistsAsync(`${device._id}.trackers.name`, {
                            type: 'state',
                            common: {
                                name: 'name',
                                desc: 'name of the tracker',
                                type: 'string',
                                role: 'text',
                                read: true,
                                write: false,
                            },
                            native: {},
                        });
                        await this.setStateAsync(`${device._id}.trackers.name`, {
                            val: object.name,
                            ack: true,
                        });
                    }
                }
            }
            else {
                await this.setObjectNotExistsAsync(device._id, {
                    type: 'device',
                    common: {
                        name: device._id,
                    },
                    native: {},
                });
                // create the channel for the device
                await this.setObjectNotExistsAsync(`${device._id}.trackers`, {
                    type: 'channel',
                    common: {
                        name: 'trackers',
                    },
                    native: {},
                });
            }
            // create the states
            for (const [key] of Object.entries(device)) {
                const common = object_definition_1.stateAttrb[key];
                // console.log('common', device);
                if (common) {
                    await this.setObjectNotExistsAsync(`${device._id}.trackers.${key}`, {
                        type: 'state',
                        common: common,
                        native: {},
                    });
                }
                else {
                    this.writeLog(`[Adapter v.${this.version} createStates] no state attribute found for ${key}`, 'warn');
                }
            }
            // end of the for loop this.allData.trackers
        }
        // create the device channel for all devices in the this.allData.tracker array
        for (const device of this.allData.tracker) {
            // console.log('device', device);
            // create the channel for the device
            await this.setObjectNotExistsAsync(`${device._id}.tracker`, {
                type: 'channel',
                common: {
                    name: 'tracker',
                },
                native: {},
            });
            // create the states
            for (const [key] of Object.entries(device)) {
                const common = object_definition_1.stateAttrb[key];
                // console.log('common', device);
                if (common) {
                    await this.setObjectNotExistsAsync(`${device._id}.tracker.${key}`, {
                        type: 'state',
                        common: common,
                        native: {},
                    });
                }
                else {
                    this.writeLog(`[Adapter v.${this.version} createStates] no state attribute found for ${key} in tracker`, 'warn');
                }
            }
            // end of the for loop this.allData.tracker
        }
        // create the device channel for all devices in the this.allData.device_hw_report array
        for (const device of this.allData.device_hw_report) {
            // console.log('device', device);
            // create the channel for the device
            await this.setObjectNotExistsAsync(`${device._id}.device_hw_report`, {
                type: 'channel',
                common: {
                    name: 'device hardware report',
                },
                native: {},
            });
            // create the states
            for (const [key] of Object.entries(device)) {
                const common = object_definition_1.stateAttrb[key];
                // console.log('common', device);
                if (common) {
                    await this.setObjectNotExistsAsync(`${device._id}.device_hw_report.${key}`, {
                        type: 'state',
                        common: common,
                        native: {},
                    });
                }
                else {
                    this.writeLog(`[Adapter v.${this.version} createStates] no state attribute found for ${key} in device_hw_report`, 'warn');
                }
            }
            // end of the for loop this.allData.device_hw_report
        }
        // create the device channel for all devices in the this.allData.device_pos_report array
        for (const device of this.allData.device_pos_report) {
            // console.log('device', device);
            // create the channel for the device
            await this.setObjectNotExistsAsync(`${device._id}.device_pos_report`, {
                type: 'channel',
                common: {
                    name: 'device position report',
                },
                native: {},
            });
            // create the states
            for (const [key] of Object.entries(device)) {
                const common = object_definition_1.stateAttrb[key];
                // console.log('common', device);
                if (common) {
                    if (key === 'latlong') {
                        await this.setObjectNotExistsAsync(`${device._id}.device_pos_report.${key}`, {
                            type: 'state',
                            common: common,
                            native: {},
                        });
                        await this.setObjectNotExistsAsync(`${device._id}.device_pos_report.latitude`, {
                            type: 'state',
                            common: object_definition_1.stateAttrb['latitude'],
                            native: {},
                        });
                        await this.setObjectNotExistsAsync(`${device._id}.device_pos_report.longitude`, {
                            type: 'state',
                            common: object_definition_1.stateAttrb['longitude'],
                            native: {},
                        });
                        await this.setObjectNotExistsAsync(`${device._id}.device_pos_report.distance`, {
                            type: 'state',
                            common: object_definition_1.stateAttrb['distance'],
                            native: {},
                        });
                    }
                    else {
                        await this.setObjectNotExistsAsync(`${device._id}.device_pos_report.${key}`, {
                            type: 'state',
                            common: common,
                            native: {},
                        });
                    }
                }
                else {
                    this.writeLog(`[Adapter v.${this.version} createStates] no state attribute found for ${key} in device_pos_report`, 'warn');
                }
            }
            // create the device channel for all devices in the this.allData.positions array
            for (const positionsDevice of this.allData.positions) {
                // console.log('device', device);
                // create the channel for the device
                await this.setObjectNotExistsAsync(`${device._id}.positions`, {
                    type: 'channel',
                    common: {
                        name: 'positions',
                    },
                    native: {},
                });
                // // create the states
                for (const [key] of Object.entries(positionsDevice)) {
                    const common = object_definition_1.stateAttrb['positions'];
                    // console.log('common', device);
                    if (common) {
                        await this.setObjectNotExistsAsync(`${device._id}.positions.${key}`, {
                            type: 'state',
                            common: common,
                            native: {},
                        });
                    }
                    else {
                        this.writeLog(`[Adapter v.${this.version} createStates] no state attribute found for ${key} in positions`, 'warn');
                    }
                }
                // end of the for loop this.allData.device_pos_report
            }
            // end of the for loop this.allData.positions
        }
        await this.setObjectNotExistsAsync(`json`, {
            type: 'state',
            common: {
                name: 'json',
                desc: 'all data from the api as json',
                type: 'string',
                role: 'json',
                read: true,
                write: false,
            },
            native: {},
        });
    }
    /**
     * @description a function for log output
     */
    writeLog(logText, logType) {
        if (logType === 'silly')
            this.log.silly(logText);
        if (logType === 'info')
            this.log.info(logText);
        if (logType === 'debug')
            this.log.debug(logText);
        if (logType === 'warn')
            this.log.warn(logText);
        if (logType === 'error')
            this.log.error(logText);
    }
    /**
     * Is called if a subscribed state changes
     */
    async onStateChange(id, state) {
        if (state) {
            if (state.from === 'system.adapter.' + this.namespace) {
                // ignore the state change from the adapter itself
                return;
            }
            else {
                this.writeLog(`[Adapter v.${this.version} onStateChange] state ${id} changed: ${state.val} (ack = ${state.ack})`, 'debug');
            }
        }
        else {
            return;
        }
    }
    /**
     * call all trackers from the user
     * https://graph.tractive.com/3/user/${this.user_id}/trackers
     */
    async getTrackers() {
        // Request data from api
        const url = `https://graph.tractive.com/3/user/${this.allData.userInfo.user_id}/trackers`;
        const options = {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'x-tractive-client': this.client_id,
                'x-tractive-user': this.allData.userInfo.user_id,
                Authorization: `Bearer ${this.config.access_token}`,
            },
        };
        try {
            const response = await (0, axios_1.default)(url, options);
            if (response.status === 200) {
                this.writeLog(`[Adapter v.${this.version} Axios V: ${axios_1.default.VERSION} getTrackers] response: ${JSON.stringify(response.data)}`, 'debug');
                if (response.data) {
                    this.allData.trackers = response.data;
                    this.writeLog(`[Adapter v.${this.version} Axios V: ${axios_1.default.VERSION}  getTrackers] trackers: ${JSON.stringify(this.allData.trackers)}`, 'debug');
                    this.writeLog(`[Adapter v.${this.version} Axios V: ${axios_1.default.VERSION}  getTrackers] trackers: ${JSON.stringify(this.allData.trackers)}`, 'debug');
                }
                else {
                    this.writeLog(`[Adapter v.${this.version} Axios V: ${axios_1.default.VERSION}  getTrackers] no data`, 'warn');
                }
            }
            else {
                this.writeLog(`[Adapter v.${this.version} Axios V: ${axios_1.default.VERSION}  getTrackers] error: ${response.status}`, 'error');
                if (response.data) {
                    this.writeLog(`[Adapter v.${this.version} Axios V: ${axios_1.default.VERSION}  getTrackers] response: ${JSON.stringify(response.data)}`, 'error');
                }
            }
        }
        catch (error) {
            this.writeLog(`[Adapter v.${this.version} Axios V: ${axios_1.default.VERSION}  getTrackers] error: ${error}`, 'error');
        }
    }
    /**
     * call all tracker information
     * https://graph.tractive.com/3/tracker/${tracker._id}
     */
    async getTrackerInfo() {
        this.allData.tracker = [];
        // gehe alle tracker durch und hole die informationen
        for (const tracker of this.allData.trackers) {
            const url = `https://graph.tractive.com/3/tracker/${tracker._id}`;
            const options = {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'x-tractive-client': this.client_id,
                    'x-tractive-user': this.allData.userInfo.user_id,
                    Authorization: `Bearer ${this.config.access_token}`,
                },
            };
            try {
                const response = await (0, axios_1.default)(url, options);
                if (response.status === 200) {
                    this.writeLog(`[Adapter v.${this.version} Axios V: ${axios_1.default.VERSION}  getTrackerInfo] response: ${JSON.stringify(response.data)}`, 'debug');
                    if (response.data) {
                        this.allData.tracker.push(response.data);
                        // this.tracker.push(response.data);
                        this.writeLog(`[Adapter v.${this.version} Axios V: ${axios_1.default.VERSION}  getTrackerInfo] tracker: ${JSON.stringify(this.allData.tracker)}`, 'debug');
                        // console.log('tracker Info', this.allData.tracker);
                    }
                    else {
                        this.writeLog(`[Adapter v.${this.version} Axios V: ${axios_1.default.VERSION}  getTrackerInfo] no data`, 'warn');
                    }
                }
            }
            catch (error) {
                this.writeLog(`[Adapter v.${this.version} Axios V: ${axios_1.default.VERSION}  getTrackerInfo] error: ${error}`, 'error');
            }
        }
    }
    /**
     * call all tracker device_hw_report
     * https://graph.tractive.com/3/device_hw_report/${tracker._id}
     */
    async getTrackerDeviceHwReport() {
        this.allData.device_hw_report = [];
        // gehe alle tracker durch und hole die informationen
        for (const tracker of this.allData.trackers) {
            const url = `https://graph.tractive.com/3/device_hw_report/${tracker._id}`;
            const options = {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'x-tractive-client': this.client_id,
                    'x-tractive-user': this.allData.userInfo.user_id,
                    Authorization: `Bearer ${this.config.access_token}`,
                },
            };
            try {
                const response = await (0, axios_1.default)(url, options);
                if (response.status === 200) {
                    this.writeLog(`[Adapter v.${this.version} Axios V: ${axios_1.default.VERSION}  getTrackerDeviceHwReport] response: ${JSON.stringify(response.data)}`, 'debug');
                    if (response.data) {
                        this.allData.device_hw_report.push(response.data);
                        this.writeLog(`[Adapter v.${this.version} Axios V: ${axios_1.default.VERSION}  getTrackerDeviceHwReport] trackerDeviceHwReport: ${JSON.stringify(this.allData.device_hw_report)}`, 'debug');
                        // console.log('tracker DeviceHwReport', this.allData.device_hw_report);
                    }
                    else {
                        this.writeLog(`[Adapter v.${this.version} Axios V: ${axios_1.default.VERSION}  getTrackerDeviceHwReport] no data`, 'warn');
                    }
                }
            }
            catch (error) {
                if (error.response && error.response.data.code === 4002) {
                    this.writeLog(`[Adapter v.${this.version} Axios V: ${axios_1.default.VERSION}  getTrackerDeviceHwReport] warn: ${JSON.stringify(error.response.data.message)} - the tracker does not yet contain any data`, 'warn');
                }
                else {
                    this.writeLog(`[Adapter v.${this.version} Axios V: ${axios_1.default.VERSION}  getTrackerDeviceHwReport] error: ${error}`, 'error');
                }
            }
        }
    }
    /**
     * call all tracker location
     * https://graph.tractive.com/3/device_pos_report/${tracker._id}
     */
    async getTrackerLocation() {
        this.allData.device_pos_report = [];
        // gehe alle tracker durch und hole die informationen
        for (const tracker of this.allData.trackers) {
            const url = `https://graph.tractive.com/3/device_pos_report/${tracker._id}`;
            const options = {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'x-tractive-client': this.client_id,
                    'x-tractive-user': this.allData.userInfo.user_id,
                    Authorization: `Bearer ${this.config.access_token}`,
                },
            };
            try {
                const response = await (0, axios_1.default)(url, options);
                if (response.status === 200) {
                    this.writeLog(`[Adapter v.${this.version} Axios V: ${axios_1.default.VERSION}  getTrackerLocation] response: ${JSON.stringify(response.data)}`, 'debug');
                    if (response.data) {
                        this.allData.device_pos_report.push(response.data);
                        this.writeLog(`[Adapter v.${this.version} Axios V: ${axios_1.default.VERSION}  getTrackerLocation] trackerLocation: ${JSON.stringify(this.allData.device_pos_report)}`, 'debug');
                        // console.log('tracker Location', this.allData.device_pos_report);
                    }
                    else {
                        this.writeLog(`[Adapter v.${this.version} Axios V: ${axios_1.default.VERSION}  getTrackerLocation] no data`, 'warn');
                    }
                }
            }
            catch (error) {
                if (error.response && error.response.data.code === 4002) {
                    this.writeLog(`[Adapter v.${this.version} Axios V: ${axios_1.default.VERSION}  getTrackerLocation] warn: ${JSON.stringify(error.response.data.message)} - the tracker does not yet contain any data`, 'warn');
                }
                else {
                    this.writeLog(`[Adapter v.${this.version} Axios V: ${axios_1.default.VERSION}  getTrackerLocation] error: ${error}`, 'error');
                }
            }
        }
    }
    /**
     * call all tracker position
     * https://graph.tractive.com/3/tracker/CDSOLIJE/positions?time_from=${time_from}&time_to=${time_to}&format=json_segments
     * time_from = 1.1.2023 00:00:00 in seconds
     * time_to = 1.1.2023 23:59:59 in seconds
     * format = json_segments
     */
    async getTrackerPosition(time_from, time_to) {
        this.allData.positions = [];
        // gehe alle tracker durch und hole die informationen
        for (const tracker of this.allData.trackers) {
            const url = `https://graph.tractive.com/3/tracker/${tracker._id}/positions?time_from=${time_from}&time_to=${time_to}&format=json_segments`;
            const options = {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'x-tractive-client': this.client_id,
                    'x-tractive-user': this.allData.userInfo.user_id,
                    Authorization: `Bearer ${this.config.access_token}`,
                },
            };
            try {
                const response = await (0, axios_1.default)(url, options);
                if (response.status === 200) {
                    this.writeLog(`[Adapter v.${this.version} Axios V: ${axios_1.default.VERSION}  getTrackerPosition] response: ${JSON.stringify(response.data)}`, 'debug');
                    if (response.data) {
                        this.allData.positions.push(response.data);
                        const testdata = {};
                        testdata[tracker._id] = response.data;
                        this.writeLog(`[Adapter v.${this.version} Axios V: ${axios_1.default.VERSION}  getTrackerPosition] trackerPosition: ${JSON.stringify(this.allData.positions)}`, 'debug');
                        // console.log('tracker Position', this.allData.positions);
                    }
                    else {
                        this.writeLog(`[Adapter v.${this.version} Axios V: ${axios_1.default.VERSION}  getTrackerPosition] no data`, 'warn');
                    }
                }
            }
            catch (error) {
                this.writeLog(`[Adapter v.${this.version} Axios V: ${axios_1.default.VERSION}  getTrackerPosition] error: ${error}`, 'error');
            }
        }
    }
    async onMessage(obj) {
        if (typeof obj === 'object' && obj?.message) {
            if (obj.command === 'refreshToken') {
                this.writeLog(`[Adapter v.${this.version} onMessage] refresh the Token`, 'debug');
                const native = await this.getAccessToken(obj.message.email, obj.message.password);
                // Send response in callback if required
                if (obj.callback) {
                    if (!native || native.error) {
                        this.sendTo(obj.from, obj.command, { error: native?.error || 'Cannot get token' }, obj.callback);
                    }
                    else {
                        this.sendTo(obj.from, obj.command, { native }, obj.callback);
                    }
                }
            }
        }
    }
    /**
     * Is called when adapter shuts down - callback has to be called under any circumstances!
     */
    async onUnload(callback) {
        try {
            this.writeLog(`[Adapter v.${this.version} onUnload] Adapter stopped`, 'debug');
            // Here you must clear all timeouts or intervals that may still be active
            if (this.requestTimer)
                this.clearTimeout(this.requestTimer);
            await this.setStateAsync('info.connection', false, true);
            callback();
        }
        catch {
            callback();
        }
    }
    async getAccessToken(email, password) {
        console.log('getAccessToken');
        // get the access token
        const url = 'https://graph.tractive.com/3/auth/token';
        console.log('url', url);
        const options = {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-tractive-client': this.client_id,
            },
            data: {
                platform_email: email || this.config.email,
                platform_token: password || this.config.password,
                grant_type: 'tractive',
            },
        };
        console.log('options', options);
        try {
            const response = await (0, axios_1.default)(url, options);
            console.log('response', response);
            if (response.status === 200) {
                this.writeLog(`[Adapter v.${this.version} Axios V: ${axios_1.default.VERSION}  getAccessToken] response: ${JSON.stringify(response.data)}`, 'debug');
                if (response.data) {
                    if (!password && !email) {
                        // save new token
                        const obj = await this.getForeignObjectAsync(`system.adapter.${this.namespace}`);
                        if (obj) {
                            // write the data into the config
                            obj.native.access_token = response.data.access_token;
                            obj.native.user_id = response.data.user_id;
                            obj.native.expires_at = response.data.expires_at;
                            this.allData.userInfo.user_id = response.data.user_id;
                            this.allData.userInfo.expires_at = response.data.expires_at;
                            this.writeLog(`[Adapter v.${this.version} Axios V: ${axios_1.default.VERSION}  getAccessToken] obj: ${JSON.stringify(obj)}`, 'debug');
                            await this.setForeignObjectAsync(`system.adapter.${this.namespace}`, obj);
                            this.writeLog(`[Adapter v.${this.version} getAccessToken] new access_token: ${response.data.access_token}`, 'debug');
                        }
                    }
                    else {
                        return {
                            access_token: response.data.access_token,
                            user_id: response.data.user_id,
                            expires_at: response.data.expires_at,
                        };
                    }
                }
                else {
                    this.writeLog(`[Adapter v.${this.version} Axios V: ${axios_1.default.VERSION} getAccessToken] no data`, 'warn');
                    return {
                        error: 'no data',
                    };
                }
            }
            else {
                if (response.data) {
                    this.writeLog(`[Adapter v.${this.version} Axios V: ${axios_1.default.VERSION} getAccessToken] ${response.status} ${response.statusText} ${response.data}`, 'warn');
                    return {
                        error: response.data.toString(),
                    };
                }
                else {
                    this.writeLog(`[Adapter v.${this.version} Axios V: ${axios_1.default.VERSION} getAccessToken] ${response.status} ${response.statusText}`, 'warn');
                    return {
                        error: response.statusText.toString(),
                    };
                }
            }
        }
        catch (error) {
            this.writeLog(`[Adapter v.${this.version} Axios V: ${axios_1.default.VERSION} getAccessToken] error: ${error}`, 'error');
            return {
                error: error.toString(),
            };
        }
        return null;
    }
}
if (require.main !== module) {
    // Export the constructor in compact mode
    module.exports = (options) => new TractiveGPS(options);
}
else {
    // otherwise start the instance directly
    (() => new TractiveGPS())();
}
//# sourceMappingURL=main.js.map