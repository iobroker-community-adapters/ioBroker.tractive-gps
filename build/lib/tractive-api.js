"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
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
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var tractive_api_exports = {};
__export(tractive_api_exports, {
  TractiveAPI: () => TractiveAPI
});
module.exports = __toCommonJS(tractive_api_exports);
var import_axios = __toESM(require("axios"));
var import_dataAggregation = require("./services/dataAggregation");
class TractiveAPI {
  api;
  auth = null;
  log;
  setState;
  getObjectAsync;
  getDevicesAsync;
  getForeignObjectAsync;
  tractiveClient = "6536c228870a3c8857d452e8";
  credentials = null;
  refreshPromise = null;
  abortController = new AbortController();
  extendObjectAsync;
  // Rate limiting / retry configuration
  lastRequestTime = 0;
  requestDelay;
  rateLimitedUntil = 0;
  rateLimitQueue = Promise.resolve();
  retryDelays;
  sleep;
  random;
  reverseGeocoding;
  addressCache = /* @__PURE__ */ new Map();
  /**
   *
   */
  constructor(log, getObjectAsync, setState, extendObjectAsync, options = {}) {
    var _a, _b, _c, _d, _e, _f;
    this.log = log;
    this.getObjectAsync = getObjectAsync;
    this.getDevicesAsync = options.getDevicesAsync;
    this.getForeignObjectAsync = options.getForeignObjectAsync;
    this.setState = setState;
    this.extendObjectAsync = extendObjectAsync;
    this.requestDelay = (_a = options.requestIntervalMs) != null ? _a : 5e3;
    this.retryDelays = (_b = options.retryDelaysMs) != null ? _b : [6e4, 12e4, 3e5, 6e5];
    this.sleep = (_c = options.sleep) != null ? _c : TractiveAPI.delay;
    this.random = (_d = options.random) != null ? _d : Math.random;
    this.reverseGeocoding = (_e = options.reverseGeocoding) != null ? _e : false;
    this.api = (_f = options.httpClient) != null ? _f : import_axios.default.create({
      baseURL: "https://graph.tractive.com/4",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-Tractive-Client": this.tractiveClient
      },
      timeout: 3e4
    });
    this.api.interceptors.request.use(async (config) => {
      var _a2;
      await this.waitForRequestSlot();
      if (config.url !== "/auth/token" && ((_a2 = this.auth) == null ? void 0 : _a2.access_token)) {
        config.headers = config.headers || {};
        config.headers.Authorization = `Bearer ${this.auth.access_token}`;
        config.headers["X-Tractive-User"] = this.auth.user_id;
      }
      return config;
    });
  }
  isAuthenticated() {
    return this.auth !== null && this.auth.expires_at > Math.floor(Date.now() / 1e3) + 300;
  }
  async initialize(email, password) {
    this.credentials = { email, password };
    return this.login(email, password);
  }
  async login(email, password) {
    var _a;
    try {
      const response = await this.api.post(
        "/auth/token",
        {
          grant_type: "tractive",
          platform_email: email,
          platform_token: password
        },
        { signal: this.abortController.signal }
      );
      if (TractiveAPI.isAuthResponse(response.data)) {
        this.auth = {
          access_token: response.data.access_token,
          expires_at: (_a = response.data.expires_at) != null ? _a : Math.floor(Date.now() / 1e3) + 86400,
          user_id: response.data.user_id
        };
        this.log.info("Login successful");
        return true;
      }
      this.auth = null;
      this.log.warn("Tractive authentication returned an invalid response");
      return false;
    } catch (error) {
      this.auth = null;
      this.log.error(`Tractive authentication failed: ${TractiveAPI.getSafeError(error)}`);
      return false;
    }
  }
  async refreshAuth() {
    if (!this.credentials) {
      return false;
    }
    if (!this.refreshPromise) {
      const { email, password } = this.credentials;
      this.refreshPromise = this.login(email, password).finally(() => {
        this.refreshPromise = null;
      });
    }
    return this.refreshPromise;
  }
  static isAuthResponse(value) {
    if (!value || typeof value !== "object") {
      return false;
    }
    const candidate = value;
    return typeof candidate.access_token === "string" && candidate.access_token.length > 0 && typeof candidate.user_id === "string" && candidate.user_id.length > 0 && (candidate.expires_at === void 0 || typeof candidate.expires_at === "number");
  }
  static isAddressResponse(value) {
    if (!value || typeof value !== "object") {
      return false;
    }
    const address = value;
    return ["street", "house_number", "zip_code", "city", "country", "full_address"].every(
      (key) => typeof address[key] === "string"
    );
  }
  static async delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
  async waitForRequestSlot() {
    const previous = this.rateLimitQueue;
    let release = () => void 0;
    this.rateLimitQueue = new Promise((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      const now = Date.now();
      const wait = Math.max(0, this.requestDelay - (now - this.lastRequestTime), this.rateLimitedUntil - now);
      if (wait > 0) {
        await this.sleep(wait);
      }
      this.lastRequestTime = Date.now();
    } finally {
      release();
    }
  }
  static getSafeError(error) {
    var _a;
    if (!import_axios.default.isAxiosError(error)) {
      return "Unexpected Tractive API error";
    }
    if (error.code === "ECONNABORTED" || error.code === "ETIMEDOUT") {
      return "Tractive API request timed out";
    }
    if (typeof ((_a = error.response) == null ? void 0 : _a.status) === "number") {
      return `Tractive API returned HTTP ${error.response.status}`;
    }
    return "Tractive API request failed";
  }
  static getRetryAfterMs(error, fallbackMs) {
    var _a, _b;
    if (!import_axios.default.isAxiosError(error)) {
      return fallbackMs;
    }
    const header = (_b = (_a = error.response) == null ? void 0 : _a.headers) == null ? void 0 : _b["retry-after"];
    const value = Array.isArray(header) ? header[0] : header;
    if (typeof value === "number" && Number.isFinite(value)) {
      return Math.max(0, value * 1e3);
    }
    if (typeof value === "string") {
      const seconds = Number(value);
      if (Number.isFinite(seconds)) {
        return Math.max(0, seconds * 1e3);
      }
      const date = Date.parse(value);
      if (Number.isFinite(date)) {
        return Math.max(0, date - Date.now());
      }
    }
    return fallbackMs;
  }
  async apiCall(method, endpoint, data, config, retryCount = 0, authRetried = false) {
    var _a;
    if (!this.isAuthenticated() && !await this.refreshAuth()) {
      return { success: false, error: "Not authenticated" };
    }
    try {
      const response = await this.api.request({
        ...config,
        method,
        url: endpoint,
        data,
        signal: this.abortController.signal
      });
      if (this.requestDelay > 5e3) {
        this.requestDelay = Math.max(Math.floor(this.requestDelay * 0.9), 5e3);
      }
      return { success: true, data: response.data };
    } catch (error) {
      const status = import_axios.default.isAxiosError(error) ? (_a = error.response) == null ? void 0 : _a.status : void 0;
      if (status === 401 && !authRetried) {
        this.log.warn("Tractive authentication expired; refreshing the session");
        if (await this.refreshAuth()) {
          return this.apiCall(method, endpoint, data, config, retryCount, true);
        }
      }
      if ((status === 429 || status && status >= 500) && retryCount < this.retryDelays.length) {
        const fallback = this.retryDelays[retryCount] + Math.floor(this.random() * 1e3);
        const wait = status === 429 ? TractiveAPI.getRetryAfterMs(error, fallback) : fallback;
        if (status === 429) {
          this.requestDelay = Math.min(Math.max(this.requestDelay * 2, 3e4), 3e5);
          this.rateLimitedUntil = Math.max(this.rateLimitedUntil, Date.now() + wait);
        }
        const retryMessage = `Tractive API returned HTTP ${status}; retry ${retryCount + 1}/${this.retryDelays.length} in ${wait}ms`;
        if (status === 429) {
          this.log.debug(retryMessage);
        } else {
          this.log.warn(retryMessage);
        }
        await this.sleep(wait);
        return this.apiCall(method, endpoint, data, config, retryCount + 1, authRetried);
      }
      const safeError = TractiveAPI.getSafeError(error);
      this.log.error(safeError);
      return { success: false, error: safeError };
    }
  }
  dispose() {
    this.abortController.abort();
    this.auth = null;
    this.credentials = null;
  }
  static isRecord(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }
  async getRecord(endpoint, resource) {
    const response = await this.apiCall("get", endpoint);
    if (!response.success) {
      return response;
    }
    if (!TractiveAPI.isRecord(response.data)) {
      this.log.warn(`Tractive returned an invalid ${resource} response`);
      return { success: false, error: `Invalid ${resource} response` };
    }
    return { success: true, data: response.data };
  }
  async getRecordArray(endpoint, resource) {
    const response = await this.apiCall("get", endpoint);
    if (!response.success) {
      return response;
    }
    if (!Array.isArray(response.data) || !response.data.every(TractiveAPI.isRecord)) {
      this.log.warn(`Tractive returned an invalid ${resource} response`);
      return { success: false, error: `Invalid ${resource} response` };
    }
    return { success: true, data: response.data };
  }
  // Endpoints
  async getAccount() {
    if (!this.auth) {
      return { success: false, error: "Not authenticated" };
    }
    return this.getRecord(`/user/${encodeURIComponent(this.auth.user_id)}`, "account");
  }
  async getSubscriptions() {
    if (!this.auth) {
      return { success: false, error: "Not authenticated" };
    }
    return this.getRecordArray(`/user/${encodeURIComponent(this.auth.user_id)}/subscriptions`, "subscription list");
  }
  async getSubscription(subscriptionID) {
    return this.getRecord(`/subscription/${encodeURIComponent(subscriptionID)}`, "subscription");
  }
  async getShares() {
    if (!this.auth) {
      return { success: false, error: "Not authenticated" };
    }
    return this.getRecordArray(`/user/${encodeURIComponent(this.auth.user_id)}/shares`, "share list");
  }
  /** Build the same public media URL that is used by Tractive's web application. */
  getProfilePictureUrl(imageID) {
    return `https://cdn.tractive.com/3/media/resource/${encodeURIComponent(imageID)}.jpg`;
  }
  /**
   *
   */
  async getPets() {
    if (!this.auth) {
      return { success: false, error: "Not authenticated" };
    }
    return this.getRecordArray(`/user/${encodeURIComponent(this.auth.user_id)}/trackable_objects`, "pet list");
  }
  /**
   * Retrieve the complete details for one trackable object. The account list
   * only contains a lightweight reference and therefore usually has no pet
   * name or profile data.
   */
  async getPet(petID) {
    if (!this.auth) {
      return { success: false, error: "Not authenticated" };
    }
    return this.getRecord(`/trackable_object/${encodeURIComponent(petID)}`, "pet");
  }
  /** Resolve a profile-picture reference through Tractive's graph bulk endpoint. */
  async getImage(imageID) {
    const response = await this.apiCall(
      "post",
      "https://graph.tractive.com/3/bulk",
      [{ _id: imageID, _type: "image" }],
      { params: { schema: "flat", partial: "false" } }
    );
    if (!response.success) {
      return response;
    }
    if (!Array.isArray(response.data) || !TractiveAPI.isRecord(response.data[0])) {
      return { success: false, error: "Invalid image response" };
    }
    return { success: true, data: response.data[0] };
  }
  /**
   *
   */
  async getAllTrackers() {
    if (!this.auth) {
      return { success: false, error: "Not authenticated" };
    }
    return this.getRecordArray(`/user/${encodeURIComponent(this.auth.user_id)}/trackers`, "tracker list");
  }
  /**
   *
   */
  async getTracker(trackerID) {
    if (!this.auth) {
      return { success: false, error: "Not authenticated" };
    }
    return this.getRecord(`/tracker/${encodeURIComponent(trackerID)}`, "tracker");
  }
  /**
   *
   */
  async getTrackerLocation(trackerID) {
    if (!this.auth) {
      return { success: false, error: "Not authenticated" };
    }
    try {
      const response = await this.getRecord(
        `/device_pos_report/${encodeURIComponent(trackerID)}`,
        "tracker location"
      );
      if (response.success && response.data.latlong !== void 0 && (!Array.isArray(response.data.latlong) || response.data.latlong.length !== 2 || !response.data.latlong.every(
        (coordinate) => typeof coordinate === "number" && Number.isFinite(coordinate)
      ))) {
        this.log.warn("Tractive returned an invalid tracker location response");
        return { success: false, error: "Invalid tracker location response" };
      }
      if (this.reverseGeocoding && response.success && response.data && Array.isArray(response.data.latlong) && response.data.latlong.length >= 2) {
        const latitude = response.data.latlong[0];
        const longitude = response.data.latlong[1];
        const cachedAddress = this.addressCache.get(trackerID);
        if (cachedAddress && cachedAddress.latitude === latitude && cachedAddress.longitude === longitude) {
          response.data.address = cachedAddress.address;
          return response;
        }
        try {
          const addressResponse = await this.apiCall(
            "get",
            "/platform/geo/address/location",
            void 0,
            {
              params: {
                latitude,
                longitude
              }
            }
          );
          if (addressResponse.success && TractiveAPI.isAddressResponse(addressResponse.data)) {
            response.data.address = addressResponse.data;
            this.addressCache.set(trackerID, {
              latitude,
              longitude,
              address: addressResponse.data
            });
          }
        } catch (error) {
          this.log.warn(`Could not fetch address: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      return response;
    } catch (error) {
      return {
        success: false,
        error: `Error fetching tracker location: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }
  /**
   *
   */
  async getTrackerHardware(trackerID) {
    if (!this.auth) {
      return { success: false, error: "Not authenticated" };
    }
    return this.getRecord(`/device_hw_report/${encodeURIComponent(trackerID)}`, "tracker hardware");
  }
  async setLiveTracking(trackerID, enabled) {
    return this.sendTrackerCommand(trackerID, "live_tracking", enabled);
  }
  async setLed(trackerID, enabled) {
    return this.sendTrackerCommand(trackerID, "led_control", enabled);
  }
  async setBuzzer(trackerID, enabled) {
    return this.sendTrackerCommand(trackerID, "buzzer_control", enabled);
  }
  async sendTrackerCommand(trackerID, command, enabled) {
    return this.apiCall(
      "get",
      `/tracker/${encodeURIComponent(trackerID)}/command/${command}/${enabled ? "on" : "off"}`
    );
  }
  // Aggregations
  /**
   *
   */
  async updateAllData() {
    return (0, import_dataAggregation.updateAllData)(this);
  }
  /**
   *
   */
  async updateTrackersOnly() {
    return (0, import_dataAggregation.updateTrackersOnly)(this);
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  TractiveAPI
});
//# sourceMappingURL=tractive-api.js.map
