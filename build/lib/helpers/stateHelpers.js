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
var stateHelpers_exports = {};
__export(stateHelpers_exports, {
  writeApiData: () => writeApiData,
  writePetStates: () => writePetStates,
  writeTrackerStates: () => writeTrackerStates
});
module.exports = __toCommonJS(stateHelpers_exports);
async function ensureContainer(deps, id, type, name) {
  var _a, _b;
  const existing = await ((_a = deps.getObjectAsync) == null ? void 0 : _a.call(deps, id));
  const existingType = existing == null ? void 0 : existing.type;
  const containerType = existingType === "folder" || existingType === "device" || existingType === "channel" ? existingType : type;
  const existingName = (_b = existing == null ? void 0 : existing.common) == null ? void 0 : _b.name;
  await deps.extendObjectAsync(id, {
    type: containerType,
    common: { name: existingType === "device" && existingName ? existingName : name },
    native: {}
  });
}
async function writeState(deps, definition) {
  const { id, name, type, role, value, unit, min, max, write = false } = definition;
  await deps.extendObjectAsync(id, {
    type: "state",
    common: {
      name,
      type,
      role,
      read: true,
      write,
      ...unit === void 0 ? {} : { unit },
      ...min === void 0 ? {} : { min },
      ...max === void 0 ? {} : { max }
    },
    native: {}
  });
  await deps.setState(id, value, true);
}
async function ensureCommandState(deps, id, name, capability) {
  await deps.extendObjectAsync(id, {
    type: "state",
    common: { name, type: "boolean", role: "switch", read: true, write: true, def: false },
    native: { capability }
  });
}
function safeIdSegment(value) {
  const result = value.trim().replace(/[.\s*?,;:'"`<>\\/[\](){}]+/g, "_");
  return result || "value";
}
async function writeDynamicTree(deps, prefix, value) {
  var _a, _b, _c;
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    await ensureContainer(deps, prefix, "channel", (_a = prefix.split(".").at(-1)) != null ? _a : prefix);
    for (const [key, child] of Object.entries(value)) {
      await writeDynamicTree(deps, `${prefix}.${safeIdSegment(key)}`, child);
    }
    return;
  }
  if (Array.isArray(value)) {
    await writeState(deps, {
      id: prefix,
      name: (_b = prefix.split(".").at(-1)) != null ? _b : prefix,
      type: "string",
      role: "json",
      value: JSON.stringify(value)
    });
    await writeState(deps, {
      id: `${prefix}Length`,
      name: "Length",
      type: "number",
      role: "value",
      value: value.length
    });
    await ensureContainer(deps, `${prefix}Items`, "channel", "Items");
    for (const [index, child] of value.entries()) {
      const record = child !== null && typeof child === "object" && !Array.isArray(child) ? child : void 0;
      const resourceId = typeof (record == null ? void 0 : record._id) === "string" ? record._id : typeof (record == null ? void 0 : record.id) === "string" ? record.id : void 0;
      await writeDynamicTree(deps, `${prefix}Items.${safeIdSegment(resourceId != null ? resourceId : String(index))}`, child);
    }
    return;
  }
  await writeState(deps, {
    id: prefix,
    name: (_c = prefix.split(".").at(-1)) != null ? _c : prefix,
    type: value === null ? "mixed" : typeof value,
    role: "state",
    value
  });
}
async function writeApiData(deps, value, rawValue = value) {
  await ensureContainer(deps, "info", "channel", "Information");
  for (const [key, child] of Object.entries(value)) {
    if (key === "updatedAt") {
      await writeState(deps, {
        id: "info.apiUpdatedAt",
        name: "API data updated at",
        type: "number",
        role: "date",
        value: child
      });
    } else {
      await writeDynamicTree(deps, safeIdSegment(key), child);
    }
  }
  await writeState(deps, {
    id: "info.currentApi",
    name: "Current complete API data",
    type: "string",
    role: "json",
    value: JSON.stringify(rawValue)
  });
}
async function writePetStates(deps, pet) {
  await ensureContainer(deps, "pets", "folder", "Pets");
  await ensureContainer(deps, `pets.${pet.id}`, "device", pet.name || pet.id);
  const calculated = `pets.${pet.id}.calculated`;
  await ensureContainer(deps, calculated, "channel", "Calculated values");
  const states = [];
  if (pet.birthday !== void 0) {
    states.push({
      id: `${calculated}.birthday`,
      name: "Birthday",
      type: "number",
      role: "date",
      value: pet.birthday
    });
  }
  if (pet.height !== void 0) {
    states.push({
      id: `${calculated}.height`,
      name: "Height",
      type: "number",
      role: "value",
      unit: "cm",
      value: pet.height
    });
  }
  if (pet.weight !== void 0) {
    states.push({
      id: `${calculated}.weight`,
      name: "Weight",
      type: "number",
      role: "value",
      unit: "kg",
      value: pet.weight
    });
  }
  for (const state of states) {
    await writeState(deps, state);
  }
}
async function writeTrackerStates(deps, tracker) {
  await ensureContainer(deps, "trackers", "folder", "Trackers");
  await ensureContainer(deps, `trackers.${tracker.id}`, "device", tracker.name || tracker.id);
  const status = `trackers.${tracker.id}.status`;
  const location = `trackers.${tracker.id}.location`;
  await ensureContainer(deps, status, "channel", "Tracker status");
  await ensureContainer(deps, location, "channel", "Location");
  const states = [
    {
      id: `${status}.stale`,
      name: "Tracker data is stale",
      type: "boolean",
      role: "indicator.maintenance",
      value: tracker.stale
    },
    {
      id: `${status}.missing`,
      name: "Tracker is missing from the account",
      type: "boolean",
      role: "indicator.maintenance",
      value: false
    }
  ];
  if (tracker.online !== void 0) {
    states.push({
      id: `${status}.online`,
      name: "Online",
      type: "boolean",
      role: "indicator.connected",
      value: tracker.online
    });
  }
  if (tracker.home !== void 0) {
    states.push({
      id: `${status}.home`,
      name: "Tracker is at home",
      type: "boolean",
      role: "indicator",
      value: tracker.home
    });
  }
  if (tracker.lastSeen !== void 0) {
    states.push({
      id: `${status}.lastSeen`,
      name: "Last seen",
      type: "number",
      role: "date",
      value: tracker.lastSeen
    });
  }
  if (tracker.petId !== void 0) {
    states.push({
      id: `trackers.${tracker.id}.info.pet_id`,
      name: "Pet ID",
      type: "string",
      role: "text",
      value: tracker.petId
    });
  }
  if (tracker.latitude !== void 0) {
    states.push({
      id: `${location}.latitude`,
      name: "Latitude",
      type: "number",
      role: "value.gps.latitude",
      unit: "\xB0",
      value: tracker.latitude
    });
  }
  if (tracker.longitude !== void 0) {
    states.push({
      id: `${location}.longitude`,
      name: "Longitude",
      type: "number",
      role: "value.gps.longitude",
      unit: "\xB0",
      value: tracker.longitude
    });
  }
  if (tracker.distance !== void 0) {
    states.push({
      id: `${location}.distance`,
      name: "Distance from ioBroker",
      type: "number",
      role: "value.distance",
      unit: "m",
      value: tracker.distance
    });
  }
  if (tracker.address !== void 0) {
    states.push({
      id: `${location}.addressText`,
      name: "Address",
      type: "string",
      role: "text",
      value: tracker.address
    });
  }
  for (const state of states) {
    await writeState(deps, state);
  }
  const capabilities = new Set(tracker.capabilities.map((capability) => capability.toUpperCase()));
  const commands = `trackers.${tracker.id}.commands`;
  if (capabilities.has("LT") || capabilities.has("LED") || capabilities.has("BUZZER")) {
    await ensureContainer(deps, commands, "channel", "Tracker commands");
  }
  if (capabilities.has("LT")) {
    await ensureCommandState(deps, `${commands}.liveTracking`, "Live tracking", "LT");
  }
  if (capabilities.has("LED")) {
    await ensureCommandState(deps, `${commands}.led`, "LED", "LED");
  }
  if (capabilities.has("BUZZER")) {
    await ensureCommandState(deps, `${commands}.buzzer`, "Buzzer", "BUZZER");
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  writeApiData,
  writePetStates,
  writeTrackerStates
});
//# sourceMappingURL=stateHelpers.js.map
