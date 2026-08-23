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
function normalizePet(value, imageValue) {
  var _a, _b;
  const records = layers(value);
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
    dailyGoal: firstNumber(records, "daily_goal"),
    dailyDistanceGoal: firstNumber(records, "daily_distance_goal"),
    dailyActiveMinutesGoal: firstNumber(records, "daily_active_minutes_goal")
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
function normalizeTracker(listValue, detailsValue, locationValue, hardwareValue, petIdByTracker) {
  var _a, _b, _c, _d;
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
  return {
    id,
    name: (_a = firstString(records, "name", "hw_id")) != null ? _a : id,
    model: firstString(records, "model_number", "model"),
    firmwareVersion: firstString(records, "fw_version", "firmware_version"),
    hardwareVersion: firstString(records, "hw_edition", "hardware_version"),
    petId: (_b = petIdByTracker.get(id)) != null ? _b : firstString(records, "trackable_object_id", "pet_id"),
    online: state === void 0 ? positionTime !== void 0 : !["OFFLINE", "DISABLED"].includes(state.toUpperCase()),
    lastSeen: positionTime,
    connectionType: (_c = firstString(location ? [location] : [], "connection_type")) != null ? _c : stateReason,
    batteryLevel: firstNumber(hardware ? [hardware] : [], "battery_level"),
    charging: chargingState === void 0 ? void 0 : chargingState.toUpperCase() === "CHARGING",
    powerSaving: (_d = firstBoolean(records, "battery_save_mode", "power_saving")) != null ? _d : stateReason === void 0 ? void 0 : stateReason.toUpperCase().includes("POWER"),
    positionAccuracy: firstNumber(location ? [location] : [], "pos_uncertainty", "accuracy"),
    latitude: typeof latlong[0] === "number" ? latlong[0] : void 0,
    longitude: typeof latlong[1] === "number" ? latlong[1] : void 0,
    altitude: firstNumber(location ? [location] : [], "altitude", "alt"),
    speed: firstNumber(location ? [location] : [], "speed"),
    address: addressText(location == null ? void 0 : location.address),
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
  var _a, _b, _c;
  const cache = getAggregationCache(api);
  const hardwareSyncDue = fullSync || Date.now() - cache.lastHardwareSync >= HARDWARE_SYNC_INTERVAL_MS;
  if (fullSync) {
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
      const profilePicture = profilePictureId ? await api.getImage(profilePictureId) : void 0;
      const pet = normalizePet(detailValue, profilePicture == null ? void 0 : profilePicture.data);
      if (!pet) {
        api.log.warn("Skipping pet data that does not match the expected schema");
        continue;
      }
      petApiData[petId] = {
        list: petListItem,
        ...details.data ? { details: details.data } : {},
        ...(profilePicture == null ? void 0 : profilePicture.data) ? { profilePicture: profilePicture.data } : {}
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
      cache.petIdByTracker
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
  await (0, import_stateHelpers.writeApiData)(stateDeps(api), {
    updatedAt: Date.now(),
    pets: cache.petApiData,
    trackers: trackerApiData
  });
  if (api.getDevicesAsync) {
    const devices = await api.getDevicesAsync();
    for (const device of devices) {
      const match = /(?:^|\.)trackers\.([^.]+)$/.exec(device._id);
      const trackerId = match == null ? void 0 : match[1];
      if (trackerId && !seenTrackerIds.has(trackerId)) {
        await api.setState(`trackers.${trackerId}.health.missing`, true, true);
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
