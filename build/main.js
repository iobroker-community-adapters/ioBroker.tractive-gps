"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var utils = __toESM(require("@iobroker/adapter-core"));
var import_tractive_api = require("./lib/tractive-api");
const MINIMUM_INTERVAL_SECONDS = 120;
const MAXIMUM_INTERVAL_SECONDS = 3600;
const FULL_SYNC_INTERVAL_MS = 24 * 60 * 60 * 1e3;
const OBJECT_STRUCTURE_VERSION = 4;
class TractiveGPS extends utils.Adapter {
  tractiveApi = null;
  pollTimer;
  syncPromise = null;
  fullSyncPending = false;
  lastFullSync = 0;
  stopped = false;
  structureMigrationPending = false;
  commandQueues = /* @__PURE__ */ new Map();
  constructor(options = {}) {
    super({
      ...options,
      name: "tractive-gps"
    });
    this.on("ready", this.onReady.bind(this));
    this.on("stateChange", this.onStateChange.bind(this));
    this.on("message", this.onMessage.bind(this));
    this.on("unload", this.onUnload.bind(this));
  }
  async onReady() {
    this.stopped = false;
    await this.ensureLifecycleObjects();
    await this.setState("info.connection", false, true);
    await this.setState("info.dataFresh", false, true);
    await this.setState("info.status", "starting", true);
    if (!this.config.email || !this.config.password) {
      await this.setState("info.status", "missing_credentials", true);
      this.log.error("Missing credentials. Please enter your Tractive credentials in the adapter settings.");
      return;
    }
    this.tractiveApi = new import_tractive_api.TractiveAPI(
      this.log,
      this.getObjectAsync.bind(this),
      this.setState.bind(this),
      this.extendObjectAsync.bind(this),
      {
        reverseGeocoding: Boolean(this.config.reverseGeocoding),
        getDevicesAsync: this.getDevicesAsync.bind(this),
        getForeignObjectAsync: this.getForeignObjectAsync.bind(this),
        writeFileAsync: this.writeFileAsync.bind(this),
        fileNamespace: `${this.namespace}.images`,
        delay: this.delay.bind(this)
      }
    );
    if (!await this.tractiveApi.initialize(this.config.email, this.config.password)) {
      await this.setState("info.status", "authentication_failed", true);
      this.log.error("Login to Tractive failed. Please check your credentials.");
      return;
    }
    this.structureMigrationPending = await this.resetDataObjectsIfNeeded();
    this.subscribeStates("info.refresh");
    this.subscribeStates("trackers.*.commands.*");
    await this.queueSync(true);
    this.scheduleNextSync();
  }
  async ensureLifecycleObjects() {
    await this.extendObjectAsync("images", {
      type: "meta",
      common: {
        name: "Tractive profile images",
        type: "meta.user"
      },
      native: {}
    });
    await this.extendObjectAsync("info", {
      type: "channel",
      common: {
        name: "Information"
      },
      native: {}
    });
    await this.extendObjectAsync("info.refresh", {
      type: "state",
      common: {
        name: "Refresh data",
        type: "boolean",
        role: "button",
        read: false,
        write: true,
        def: false
      },
      native: {}
    });
    await this.extendObjectAsync("info.lastSync", {
      type: "state",
      common: {
        name: "Last synchronization attempt",
        type: "number",
        role: "date",
        read: true,
        write: false,
        def: 0
      },
      native: {}
    });
    await this.extendObjectAsync("info.lastSuccessfulSync", {
      type: "state",
      common: {
        name: "Last successful synchronization",
        type: "number",
        role: "date",
        read: true,
        write: false,
        def: 0
      },
      native: {}
    });
    await this.extendObjectAsync("info.dataFresh", {
      type: "state",
      common: {
        name: "Data is fresh",
        type: "boolean",
        role: "indicator",
        read: true,
        write: false,
        def: false
      },
      native: {}
    });
    await this.extendObjectAsync("info.status", {
      type: "state",
      common: {
        name: "Adapter status",
        type: "string",
        role: "text",
        read: true,
        write: false,
        def: "starting",
        states: {
          starting: "Starting",
          ok: "OK",
          synchronization_failed: "Synchronization failed",
          authentication_failed: "Authentication failed",
          missing_credentials: "Missing credentials",
          stopped: "Stopped"
        }
      },
      native: {}
    });
    await this.extendObjectAsync("info.structureVersion", {
      type: "state",
      common: {
        name: "Object structure version",
        type: "number",
        role: "value.version",
        read: true,
        write: false,
        def: 0
      },
      native: {}
    });
  }
  async resetDataObjectsIfNeeded() {
    var _a, _b;
    const currentVersion = Number((_b = (_a = await this.getStateAsync("info.structureVersion")) == null ? void 0 : _a.val) != null ? _b : 0);
    if (currentVersion === OBJECT_STRUCTURE_VERSION) {
      return false;
    }
    const objects = await this.getAdapterObjectsAsync();
    const namespacePrefix = `${this.namespace}.`;
    const roots = /* @__PURE__ */ new Set();
    for (const id of Object.keys(objects)) {
      const relativeId = id.startsWith(namespacePrefix) ? id.slice(namespacePrefix.length) : id;
      const root = relativeId.split(".")[0];
      if (root && root !== "info" && root !== "images") {
        roots.add(root);
      }
    }
    for (const root of roots) {
      await this.delObjectAsync(root, { recursive: true });
    }
    if (await this.getObjectAsync("info.currentApi")) {
      await this.delObjectAsync("info.currentApi");
    }
    this.log.info("Removed the previous Tractive object structure; rebuilding it from current API data");
    return true;
  }
  getPollIntervalMs() {
    const configured = Number(this.config.interval) || 300;
    const seconds = Math.min(MAXIMUM_INTERVAL_SECONDS, Math.max(MINIMUM_INTERVAL_SECONDS, configured));
    if (seconds !== configured) {
      this.log.warn(
        `Configured polling interval is outside the supported range; using ${seconds} seconds instead`
      );
    }
    return seconds * 1e3;
  }
  scheduleNextSync() {
    if (this.stopped) {
      return;
    }
    if (this.pollTimer !== void 0) {
      this.clearTimeout(this.pollTimer);
    }
    this.pollTimer = this.setTimeout(() => {
      this.pollTimer = void 0;
      const fullSyncDue = Date.now() - this.lastFullSync >= FULL_SYNC_INTERVAL_MS;
      void this.queueSync(fullSyncDue).finally(() => this.scheduleNextSync());
    }, this.getPollIntervalMs());
  }
  queueSync(fullSync) {
    this.fullSyncPending || (this.fullSyncPending = fullSync);
    if (!this.syncPromise) {
      this.syncPromise = this.runPendingSyncs().finally(() => {
        this.syncPromise = null;
      });
    }
    return this.syncPromise;
  }
  async runPendingSyncs() {
    while (!this.stopped && this.tractiveApi) {
      const fullSync = this.fullSyncPending;
      this.fullSyncPending = false;
      await this.performSync(fullSync);
      if (!this.fullSyncPending) {
        return;
      }
    }
  }
  async performSync(fullSync) {
    if (!this.tractiveApi || this.stopped) {
      return;
    }
    await this.setState("info.lastSync", Date.now(), true);
    try {
      const result = fullSync ? await this.tractiveApi.updateAllData() : await this.tractiveApi.updateTrackersOnly();
      if (!result.success) {
        await this.setState("info.connection", false, true);
        await this.setState("info.dataFresh", false, true);
        await this.setState("info.status", "synchronization_failed", true);
        this.log.warn("Tractive synchronization failed; the adapter will retry automatically");
        return;
      }
      const now = Date.now();
      if (fullSync) {
        this.lastFullSync = now;
      }
      if (this.structureMigrationPending) {
        await this.setState("info.structureVersion", OBJECT_STRUCTURE_VERSION, true);
        this.structureMigrationPending = false;
      }
      await this.setState("info.connection", true, true);
      await this.setState("info.dataFresh", true, true);
      await this.setState("info.lastSuccessfulSync", now, true);
      await this.setState("info.status", "ok", true);
    } catch {
      await this.setState("info.connection", false, true);
      await this.setState("info.dataFresh", false, true);
      await this.setState("info.status", "synchronization_failed", true);
      this.log.error("Unexpected error during Tractive synchronization");
    }
  }
  async onStateChange(id, state) {
    if (!state || state.ack) {
      return;
    }
    if (id === `${this.namespace}.info.refresh`) {
      await this.setState("info.refresh", false, true);
      await this.queueSync(true);
      return;
    }
    const prefix = `${this.namespace}.trackers.`;
    if (!id.startsWith(prefix) || typeof state.val !== "boolean") {
      return;
    }
    const path = id.slice(prefix.length).split(".");
    if (path.length !== 3 || path[1] !== "commands") {
      return;
    }
    const [trackerId, , command] = path;
    if (!trackerId || !["liveTracking", "led", "buzzer"].includes(command)) {
      return;
    }
    await this.queueTrackerCommand(trackerId, command, state.val, id);
  }
  async onMessage(message) {
    if (!message.callback) {
      return;
    }
    if (!/^system\.adapter\.admin\.\d+$/.test(message.from)) {
      this.sendTo(message.from, message.command, { success: false, error: "Not authorized" }, message.callback);
      return;
    }
    if (message.command !== "testConnection") {
      return;
    }
    const payload = message.message && typeof message.message === "object" ? message.message : {};
    const suppliedEmail = typeof payload.email === "string" && payload.email ? payload.email : void 0;
    const suppliedPassword = typeof payload.password === "string" && payload.password ? payload.password : void 0;
    const credentials = suppliedEmail && suppliedPassword ? { email: suppliedEmail, password: suppliedPassword } : this.config.email && this.config.password ? { email: this.config.email, password: this.config.password } : null;
    if (!credentials) {
      this.sendTo(
        message.from,
        message.command,
        { success: false, error: "Missing credentials" },
        message.callback
      );
      return;
    }
    const testApi = new import_tractive_api.TractiveAPI(
      this.log,
      this.getObjectAsync.bind(this),
      this.setState.bind(this),
      this.extendObjectAsync.bind(this),
      { requestIntervalMs: 0, delay: this.delay.bind(this) }
    );
    try {
      const success = await testApi.initialize(credentials.email, credentials.password);
      this.sendTo(
        message.from,
        message.command,
        success ? { success: true } : { success: false, error: "Authentication failed" },
        message.callback
      );
    } finally {
      testApi.dispose();
    }
  }
  async queueTrackerCommand(trackerId, command, enabled, stateId) {
    var _a;
    const previous = (_a = this.commandQueues.get(trackerId)) != null ? _a : Promise.resolve();
    const current = previous.catch(() => void 0).then(() => this.executeTrackerCommand(trackerId, command, enabled, stateId));
    this.commandQueues.set(trackerId, current);
    try {
      await current;
    } finally {
      if (this.commandQueues.get(trackerId) === current) {
        this.commandQueues.delete(trackerId);
      }
    }
  }
  async executeTrackerCommand(trackerId, command, enabled, stateId) {
    if (!this.tractiveApi || this.stopped) {
      return;
    }
    const result = command === "liveTracking" ? await this.tractiveApi.setLiveTracking(trackerId, enabled) : command === "led" ? await this.tractiveApi.setLed(trackerId, enabled) : await this.tractiveApi.setBuzzer(trackerId, enabled);
    if (result.success) {
      await this.setState(stateId, enabled, true);
    } else {
      this.log.warn(`Tracker command ${command} failed`);
    }
  }
  async onUnload(callback) {
    var _a;
    this.stopped = true;
    if (this.pollTimer !== void 0) {
      this.clearTimeout(this.pollTimer);
      this.pollTimer = void 0;
    }
    (_a = this.tractiveApi) == null ? void 0 : _a.dispose();
    this.commandQueues.clear();
    try {
      await this.setState("info.connection", false, true);
      await this.setState("info.dataFresh", false, true);
      await this.setState("info.status", "stopped", true);
    } finally {
      callback();
    }
  }
}
if (require.main !== module) {
  module.exports = (options) => new TractiveGPS(options);
} else {
  (() => new TractiveGPS())();
}
//# sourceMappingURL=main.js.map
