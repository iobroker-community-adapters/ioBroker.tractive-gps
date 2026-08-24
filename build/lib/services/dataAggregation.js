"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
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
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var dataAggregation_exports = {};
__export(dataAggregation_exports, {
  updateAllData: () => updateAllData,
  updateTrackersOnly: () => updateTrackersOnly
});
module.exports = __toCommonJS(dataAggregation_exports);
var import_stateHelpers = require("../helpers/stateHelpers");
const HARDWARE_SYNC_INTERVAL_MS = 15 * 60 * 1e3;
const aggregationCaches = /* @__PURE__ */ new WeakMap();
function getAggregationCache(api) {
  const cached = aggregationCaches.get(api);
  if (cached) {
    return cached;
  }
  const created = {
    subscriptions: { list: [], details: {} },
    shares: [],
    petApiData: {},
    petIdByTracker: /* @__PURE__ */ new Map(),
    trackerDetails: /* @__PURE__ */ new Map(),
    trackerHardware: /* @__PURE__ */ new Map(),
    lastHardwareSync: 0
  };
  aggregationCaches.set(api, created);
  return created;
}
function asRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value : void 0;
}
function compactRecord(value) {
  return Object.fromEntries(Object.entries(value).filter(([, child]) => child !== null && child !== void 0));
}
function resourcesById(values) {
  return Object.fromEntries(
    values.map((value, index) => {
      var _a;
      return [(_a = firstString(layers(value), "_id", "id")) != null ? _a : String(index), value];
    })
  );
}
function layers(value) {
  const result = [];
  let current = asRecord(value);
  for (let depth = 0; current && depth < 4; depth++) {
    result.push(current);
    current = asRecord(current.details);
  }
  return result;
}
function firstString(records, ...keys) {
  for (const record of records) {
    for (const key of keys) {
      const value = record[key];
      if (typeof value === "string" && value.length > 0) {
        return value;
      }
    }
  }
  return void 0;
}
function firstNumber(records, ...keys) {
  for (const record of records) {
    for (const key of keys) {
      const value = record[key];
      if (typeof value === "number" && Number.isFinite(value)) {
        return value;
      }
    }
  }
  return void 0;
}
function firstBoolean(records, ...keys) {
  for (const record of records) {
    for (const key of keys) {
      const value = record[key];
      if (typeof value === "boolean") {
        return value;
      }
    }
  }
  return void 0;
}
function firstStringArray(records, ...keys) {
  for (const record of records) {
    for (const key of keys) {
      const value = record[key];
      if (Array.isArray(value)) {
        return value.filter((entry) => typeof entry === "string");
      }
    }
  }
  return [];
}
function findImageSource(value, depth = 0) {
  if (depth > 8) {
    return void 0;
  }
  if (typeof value === "string") {
    if (/^(?:https?:\/\/|data:image\/)/i.test(value)) {
      return value;
    }
    if (value.startsWith("//")) {
      return `https:${value}`;
    }
    return value.startsWith("/") ? `https://graph.tractive.com${value}` : void 0;
  }
  if (Array.isArray(value)) {
    for (const child of value) {
      const source = findImageSource(child, depth + 1);
      if (source) {
        return source;
      }
    }
    return void 0;
  }
  const record = asRecord(value);
  if (!record) {
    return void 0;
  }
  const preferredKeys = [
    "url",
    "image_url",
    "original_url",
    "download_url",
    "uri",
    "src",
    "path",
    "original",
    "large",
    "medium",
    "thumbnail"
  ];
  for (const key of preferredKeys) {
    const source = findImageSource(record[key], depth + 1);
    if (source) {
      return source;
    }
  }
  for (const child of Object.values(record)) {
    const source = findImageSource(child, depth + 1);
    if (source) {
      return source;
    }
  }
  return void 0;
}
function timestampToMilliseconds(value) {
  if (value === void 0) {
    return void 0;
  }
  return value < 1e12 ? value * 1e3 : value;
}
function distanceInMeters(latitude1, longitude1, latitude2, longitude2) {
  const toRadians = (degrees) => degrees * Math.PI / 180;
  const latitudeDelta = toRadians(latitude2 - latitude1);
  const longitudeDelta = toRadians(longitude2 - longitude1);
  const a = Math.sin(latitudeDelta / 2) ** 2 + Math.cos(toRadians(latitude1)) * Math.cos(toRadians(latitude2)) * Math.sin(longitudeDelta / 2) ** 2;
  return Math.round(6371e3 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}
async function getSystemCoordinates(api) {
  var _a;
  const systemConfig = await ((_a = api.getForeignObjectAsync) == null ? void 0 : _a.call(api, "system.config"));
  const common = systemConfig == null ? void 0 : systemConfig.common;
  const parseCoordinate = (value) => {
    if (typeof value !== "number" && (typeof value !== "string" || value.trim() === "")) {
      return void 0;
    }
    const coordinate = Number(value);
    return Number.isFinite(coordinate) ? coordinate : void 0;
  };
  const latitude = parseCoordinate(common == null ? void 0 : common.latitude);
  const longitude = parseCoordinate(common == null ? void 0 : common.longitude);
  return latitude !== void 0 && longitude !== void 0 ? [latitude, longitude] : void 0;
}
function normalizePet(value, imageValue) {
  var _a, _b;
  const records = layers(value);
  const activitySettings = records.map((record) => asRecord(record.activity_settings)).find(Boolean);
  const id = firstString(records, "_id", "id");
  if (!id) {
    return void 0;
  }
  return {
    id,
    name: (_a = firstString(records, "name")) != null ? _a : id,
    type: firstString(records, "pet_type", "type"),
    gender: firstString(records, "gender"),
    birthday: timestampToMilliseconds(firstNumber(records, "birthday")),
    height: normalizeHeight(firstNumber(records, "height")),
    length: normalizeHeight(firstNumber(records, "length")),
    weight: normalizeWeight(firstNumber(records, "weight")),
    trackerId: firstString(records, "device_id", "tracker_id"),
    breedIds: firstStringArray(records, "breed_ids"),
    chipId: firstString(records, "chip_id"),
    neutered: firstBoolean(records, "neutered"),
    personality: firstStringArray(records, "personality"),
    lostOrDead: firstBoolean(records, "lost_or_dead"),
    profilePictureId: firstString(records, "profile_picture_id"),
    profilePictureUrl: (_b = firstString(records, "profile_picture_url", "picture_url", "image_url")) != null ? _b : findImageSource(imageValue),
    galleryPictureIds: firstStringArray(records, "gallery_picture_ids"),
    createdAt: timestampToMilliseconds(firstNumber(records, "created_at")),
    dailyGoal: firstNumber(activitySettings ? [activitySettings] : [], "daily_goal"),
    dailyDistanceGoal: firstNumber(activitySettings ? [activitySettings] : [], "daily_distance_goal"),
    dailyActiveMinutesGoal: firstNumber(activitySettings ? [activitySettings] : [], "daily_active_minutes_goal")
  };
}
function normalizeHeight(value) {
  return value !== void 0 && value > 0 && value <= 3 ? value * 100 : value;
}
function normalizeWeight(value) {
  return value !== void 0 && value >= 100 ? value / 1e3 : value;
}
function addressText(value) {
  const record = asRecord(value);
  if (!record) {
    return void 0;
  }
  const fullAddress = firstString([record], "full_address", "formatted_address");
  if (fullAddress) {
    return fullAddress;
  }
  const street = [firstString([record], "street"), firstString([record], "house_number")].filter(Boolean).join(" ");
  const city = [firstString([record], "zip_code"), firstString([record], "city")].filter(Boolean).join(" ");
  return [street, city, firstString([record], "country")].filter(Boolean).join(", ") || void 0;
}
function normalizeTracker(listValue, detailsValue, locationValue, hardwareValue, petIdByTracker, systemCoordinates) {
  var _a, _b, _c;
  const records = [...layers(detailsValue), ...layers(listValue)];
  const id = firstString(records, "_id", "id");
  if (!id) {
    return void 0;
  }
  const location = asRecord(locationValue);
  const hardware = asRecord(hardwareValue);
  const latlong = Array.isArray(location == null ? void 0 : location.latlong) ? location.latlong : [];
  const state = firstString(records, "state");
  const chargingState = firstString(records, "charging_state");
  const stateReason = firstString(records, "state_reason");
  const positionTime = timestampToMilliseconds(firstNumber(location ? [location] : [], "time", "time_rcvd"));
  const hardwareTime = timestampToMilliseconds(firstNumber(hardware ? [hardware] : [], "time"));
  const sensorUsed = firstString(location ? [location] : [], "sensor_used", "connection_type");
  const normalizedSensor = sensorUsed == null ? void 0 : sensorUsed.toUpperCase();
  const latitude = typeof latlong[0] === "number" ? latlong[0] : void 0;
  const longitude = typeof latlong[1] === "number" ? latlong[1] : void 0;
  return {
    id,
    name: (_a = firstString(records, "name", "hw_id")) != null ? _a : id,
    model: firstString(records, "model_number", "model"),
    firmwareVersion: firstString(records, "fw_version", "firmware_version"),
    hardwareVersion: firstString(records, "hw_edition", "hardware_version"),
    petId: (_b = petIdByTracker.get(id)) != null ? _b : firstString(records, "trackable_object_id", "pet_id"),
    online: state === void 0 ? positionTime !== void 0 : !["OFFLINE", "DISABLED"].includes(state.toUpperCase()),
    lastSeen: positionTime,
    sensorUsed,
    home: normalizedSensor === "KNOWN_WIFI" ? true : normalizedSensor === "GPS" ? false : void 0,
    batteryLevel: firstNumber(hardware ? [hardware] : [], "battery_level"),
    charging: chargingState === void 0 ? void 0 : chargingState.toUpperCase() === "CHARGING",
    chargingState,
    powerSaving: (_c = firstBoolean(records, "battery_save_mode", "power_saving")) != null ? _c : stateReason === void 0 ? void 0 : stateReason.toUpperCase().includes("POWER"),
    positionAccuracy: firstNumber(location ? [location] : [], "pos_uncertainty", "accuracy"),
    latitude,
    longitude,
    altitude: firstNumber(location ? [location] : [], "altitude", "alt"),
    speed: firstNumber(location ? [location] : [], "speed"),
    address: addressText(location == null ? void 0 : location.address),
    distance: systemCoordinates && latitude !== void 0 && longitude !== void 0 ? distanceInMeters(systemCoordinates[0], systemCoordinates[1], latitude, longitude) : void 0,
    capabilities: firstStringArray(records, "capabilities"),
    operationalState: state,
    stateReason,
    batteryState: firstString(records, "battery_state"),
    lastHardwareUpdate: hardwareTime,
    stale: positionTime === void 0 || Date.now() - positionTime > 3 * 60 * 60 * 1e3
  };
}
function stateDeps(api) {
  return {
    extendObjectAsync: api.extendObjectAsync,
    setState: api.setState,
    getObjectAsync: api.getObjectAsync
  };
}
async function synchronize(api, fullSync) {
  var _a, _b, _c, _d, _e, _f, _g, _h;
  const cache = getAggregationCache(api);
  const hardwareSyncDue = fullSync || Date.now() - cache.lastHardwareSync >= HARDWARE_SYNC_INTERVAL_MS;
  if (fullSync) {
    const account2 = await api.getAccount();
    if (account2.success) {
      cache.account = account2.data;
    } else {
      api.log.warn("Could not retrieve complete Tractive account data");
    }
    const subscriptions2 = await api.getSubscriptions();
    if (subscriptions2.success) {
      const details = {};
      for (const subscription of subscriptions2.data) {
        const subscriptionId = firstString(layers(subscription), "_id", "id");
        if (!subscriptionId) {
          continue;
        }
        const detail = await api.getSubscription(subscriptionId);
        if (detail.success) {
          details[subscriptionId] = detail.data;
        }
      }
      cache.subscriptions = { list: subscriptions2.data, details };
    } else {
      api.log.warn("Could not retrieve Tractive subscription data");
    }
    const shares = await api.getShares();
    if (shares.success) {
      cache.shares = shares.data;
    } else {
      api.log.warn("Could not retrieve Tractive share data");
    }
    const petsResult = await api.getPets();
    if (!petsResult.success || !petsResult.data) {
      return { success: false, error: "Could not retrieve pets" };
    }
    const petApiData = {};
    const petIdByTracker = /* @__PURE__ */ new Map();
    for (const petListItem of petsResult.data) {
      const petId = firstString(layers(petListItem), "_id", "id");
      if (!petId) {
        api.log.warn("Skipping a pet without a stable ID");
        continue;
      }
      const details = await api.getPet(petId);
      if (!details.success) {
        api.log.warn(`Could not retrieve details for pet ${petId}; using list data`);
      }
      const detailValue = (_a = details.data) != null ? _a : petListItem;
      const profilePictureId = firstString(layers(detailValue), "profile_picture_id");
      const profilePictureUrl = profilePictureId ? await api.getProfilePictureUrl(profilePictureId) : void 0;
      const pet = normalizePet(detailValue, profilePictureUrl);
      if (!pet) {
        api.log.warn("Skipping pet data that does not match the expected schema");
        continue;
      }
      petApiData[petId] = {
        list: petListItem,
        ...details.data ? { details: details.data } : {},
        ...profilePictureUrl ? { profilePictureUrl } : {}
      };
      if (pet.trackerId) {
        petIdByTracker.set(pet.trackerId, pet.id);
      }
      await (0, import_stateHelpers.writePetStates)(stateDeps(api), pet);
    }
    cache.petApiData = petApiData;
    cache.petIdByTracker = petIdByTracker;
  }
  const trackersResult = await api.getAllTrackers();
  if (!trackersResult.success || !trackersResult.data) {
    return { success: false, error: "Could not retrieve trackers" };
  }
  let writtenTrackers = 0;
  const systemCoordinates = await getSystemCoordinates(api);
  const trackerApiData = {};
  const seenTrackerIds = /* @__PURE__ */ new Set();
  for (const trackerListItem of trackersResult.data) {
    const listRecords = layers(trackerListItem);
    const trackerId = firstString(listRecords, "_id", "id");
    if (!trackerId) {
      api.log.warn("Skipping a tracker without a stable ID");
      continue;
    }
    const details = fullSync ? await api.getTracker(trackerId) : { success: true, data: (_b = cache.trackerDetails.get(trackerId)) != null ? _b : trackerListItem };
    const location = await api.getTrackerLocation(trackerId);
    const hardware = hardwareSyncDue ? await api.getTrackerHardware(trackerId) : { success: true, data: (_c = cache.trackerHardware.get(trackerId)) != null ? _c : {} };
    if (fullSync && details.success) {
      cache.trackerDetails.set(trackerId, details.data);
    }
    if (hardwareSyncDue && hardware.success) {
      cache.trackerHardware.set(trackerId, hardware.data);
    }
    trackerApiData[trackerId] = {
      list: trackerListItem,
      ...details.data ? { details: details.data } : {},
      ...location.data ? { location: location.data } : {},
      ...hardware.data ? { hardware: hardware.data } : {}
    };
    const tracker = normalizeTracker(
      trackerListItem,
      details.data,
      location.data,
      hardware.data,
      cache.petIdByTracker,
      systemCoordinates
    );
    if (!tracker) {
      api.log.warn("Skipping tracker data that does not match the expected schema");
      continue;
    }
    await (0, import_stateHelpers.writeTrackerStates)(stateDeps(api), tracker);
    seenTrackerIds.add(tracker.id);
    writtenTrackers += 1;
  }
  if (hardwareSyncDue) {
    cache.lastHardwareSync = Date.now();
  }
  const rawSnapshot = {
    updatedAt: Date.now(),
    userInfo: api.auth ? { user_id: api.auth.user_id, expires_at: api.auth.expires_at } : null,
    account: (_d = cache.account) != null ? _d : null,
    subscriptions: cache.subscriptions,
    shares: cache.shares,
    pets: cache.petApiData,
    trackers: trackerApiData
  };
  const account = (_e = asRecord(cache.account)) != null ? _e : {};
  const accountDetails = (_f = asRecord(account.details)) != null ? _f : {};
  const accountDemographics = (_g = asRecord(account.demographics)) != null ? _g : {};
  const accountSettings = (_h = asRecord(account.settings)) != null ? _h : {};
  const subscriptions = Object.fromEntries(
    Object.entries({ ...resourcesById(cache.subscriptions.list), ...cache.subscriptions.details }).map(
      ([subscriptionId, source]) => {
        var _a2, _b2;
        const subscription = (_a2 = asRecord(source)) != null ? _a2 : {};
        const renewal = (_b2 = asRecord(subscription.renewal_information)) != null ? _b2 : {};
        return [
          subscriptionId,
          compactRecord({
            status: subscription.status,
            validFrom: subscription.valid_from,
            validTo: subscription.valid_to,
            recurring: subscription.recurring,
            planType: subscription.plan_type_used,
            trackerId: subscription.tracker_id,
            billingInterval: subscription.billing_interval,
            insuranceActive: subscription.insurance_active,
            renewalCurrency: renewal.currency,
            renewalTotal: renewal.total
          })
        ];
      }
    )
  );
  const logicalTree = {
    updatedAt: rawSnapshot.updatedAt,
    account: compactRecord({
      email: account.email,
      firstName: accountDetails.first_name,
      lastName: accountDetails.last_name,
      activatedAt: account.activated_at,
      country: accountDemographics.country,
      language: accountDemographics.language,
      metricSystem: accountSettings.metric_system,
      distanceUnit: accountSettings.distance_unit,
      weightUnit: accountSettings.weight_unit
    }),
    subscriptions
  };
  await (0, import_stateHelpers.writeApiData)(stateDeps(api), logicalTree, rawSnapshot);
  if (api.getDevicesAsync) {
    const devices = await api.getDevicesAsync();
    for (const device of devices) {
      const match = /(?:^|\.)trackers\.([^.]+)$/.exec(device._id);
      const trackerId = match == null ? void 0 : match[1];
      if (trackerId && !seenTrackerIds.has(trackerId)) {
        await api.setState(`trackers.${trackerId}.status.missing`, true, true);
      }
    }
  }
  return writtenTrackers > 0 || trackersResult.data.length === 0 ? { success: true, data: true } : { success: false, error: "No tracker data could be processed" };
}
async function updateAllData(api) {
  return synchronize(api, true);
}
async function updateTrackersOnly(api) {
  return synchronize(api, false);
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  updateAllData,
  updateTrackersOnly
});
//# sourceMappingURL=dataAggregation.js.map
