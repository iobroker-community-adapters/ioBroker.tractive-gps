import type {
    TractiveAPIResponse,
    TractivePet,
    TractiveTracker,
    TractiveTrackerHardware,
    TractiveTrackerLocation,
} from '../../types/types';
import type { PetStateModel, StateDeps, TrackerStateModel } from '../helpers/stateHelpers';
import { writeApiData, writePetStates, writeTrackerStates } from '../helpers/stateHelpers';

const HARDWARE_SYNC_INTERVAL_MS = 15 * 60 * 1000;

export interface ITractiveApiEndpoints {
    auth: { user_id: string; expires_at: number } | null;
    log: ioBroker.Logger;
    extendObjectAsync: StateDeps['extendObjectAsync'];
    setState: StateDeps['setState'];
    getObjectAsync: NonNullable<StateDeps['getObjectAsync']>;
    getDevicesAsync?: () => Promise<readonly ioBroker.Object[]>;
    getPets(): Promise<TractiveAPIResponse<TractivePet[]>>;
    getPet(petID: string): Promise<TractiveAPIResponse<TractivePet>>;
    getImage(imageID: string): Promise<TractiveAPIResponse<Record<string, unknown>>>;
    getAllTrackers(): Promise<TractiveAPIResponse<TractiveTracker[]>>;
    getTracker(trackerID: string): Promise<TractiveAPIResponse<TractiveTracker>>;
    getTrackerLocation(trackerID: string): Promise<TractiveAPIResponse<TractiveTrackerLocation>>;
    getTrackerHardware(trackerID: string): Promise<TractiveAPIResponse<TractiveTrackerHardware>>;
}

type UnknownRecord = Record<string, unknown>;

interface AggregationCache {
    petApiData: Record<string, { list: TractivePet; details?: TractivePet; profilePicture?: Record<string, unknown> }>;
    petIdByTracker: Map<string, string>;
    trackerDetails: Map<string, TractiveTracker>;
    trackerHardware: Map<string, TractiveTrackerHardware>;
    lastHardwareSync: number;
}

const aggregationCaches = new WeakMap<ITractiveApiEndpoints, AggregationCache>();

function getAggregationCache(api: ITractiveApiEndpoints): AggregationCache {
    const cached = aggregationCaches.get(api);
    if (cached) {
        return cached;
    }
    const created: AggregationCache = {
        petApiData: {},
        petIdByTracker: new Map(),
        trackerDetails: new Map(),
        trackerHardware: new Map(),
        lastHardwareSync: 0,
    };
    aggregationCaches.set(api, created);
    return created;
}

function asRecord(value: unknown): UnknownRecord | undefined {
    return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as UnknownRecord) : undefined;
}

function layers(value: unknown): UnknownRecord[] {
    const result: UnknownRecord[] = [];
    let current = asRecord(value);
    for (let depth = 0; current && depth < 4; depth++) {
        result.push(current);
        current = asRecord(current.details);
    }
    return result;
}

function firstString(records: UnknownRecord[], ...keys: string[]): string | undefined {
    for (const record of records) {
        for (const key of keys) {
            const value = record[key];
            if (typeof value === 'string' && value.length > 0) {
                return value;
            }
        }
    }
    return undefined;
}

function firstNumber(records: UnknownRecord[], ...keys: string[]): number | undefined {
    for (const record of records) {
        for (const key of keys) {
            const value = record[key];
            if (typeof value === 'number' && Number.isFinite(value)) {
                return value;
            }
        }
    }
    return undefined;
}

function firstBoolean(records: UnknownRecord[], ...keys: string[]): boolean | undefined {
    for (const record of records) {
        for (const key of keys) {
            const value = record[key];
            if (typeof value === 'boolean') {
                return value;
            }
        }
    }
    return undefined;
}

function firstStringArray(records: UnknownRecord[], ...keys: string[]): string[] {
    for (const record of records) {
        for (const key of keys) {
            const value = record[key];
            if (Array.isArray(value)) {
                return value.filter((entry): entry is string => typeof entry === 'string');
            }
        }
    }
    return [];
}

function findImageSource(value: unknown, depth = 0): string | undefined {
    if (depth > 8) {
        return undefined;
    }
    if (typeof value === 'string') {
        if (/^(?:https?:\/\/|data:image\/)/i.test(value)) {
            return value;
        }
        if (value.startsWith('//')) {
            return `https:${value}`;
        }
        return value.startsWith('/') ? `https://graph.tractive.com${value}` : undefined;
    }
    if (Array.isArray(value)) {
        for (const child of value) {
            const source = findImageSource(child, depth + 1);
            if (source) {
                return source;
            }
        }
        return undefined;
    }
    const record = asRecord(value);
    if (!record) {
        return undefined;
    }

    const preferredKeys = [
        'url',
        'image_url',
        'original_url',
        'download_url',
        'uri',
        'src',
        'path',
        'original',
        'large',
        'medium',
        'thumbnail',
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
    return undefined;
}

function timestampToMilliseconds(value: number | undefined): number | undefined {
    if (value === undefined) {
        return undefined;
    }
    return value < 1_000_000_000_000 ? value * 1000 : value;
}

function normalizePet(value: unknown, imageValue?: unknown): PetStateModel | undefined {
    const records = layers(value);
    const id = firstString(records, '_id', 'id');
    if (!id) {
        return undefined;
    }
    return {
        id,
        name: firstString(records, 'name') ?? id,
        type: firstString(records, 'pet_type', 'type'),
        gender: firstString(records, 'gender'),
        birthday: timestampToMilliseconds(firstNumber(records, 'birthday')),
        height: normalizeHeight(firstNumber(records, 'height')),
        length: normalizeHeight(firstNumber(records, 'length')),
        weight: normalizeWeight(firstNumber(records, 'weight')),
        trackerId: firstString(records, 'device_id', 'tracker_id'),
        breedIds: firstStringArray(records, 'breed_ids'),
        chipId: firstString(records, 'chip_id'),
        neutered: firstBoolean(records, 'neutered'),
        personality: firstStringArray(records, 'personality'),
        lostOrDead: firstBoolean(records, 'lost_or_dead'),
        profilePictureId: firstString(records, 'profile_picture_id'),
        profilePictureUrl:
            firstString(records, 'profile_picture_url', 'picture_url', 'image_url') ?? findImageSource(imageValue),
        galleryPictureIds: firstStringArray(records, 'gallery_picture_ids'),
        createdAt: timestampToMilliseconds(firstNumber(records, 'created_at')),
        dailyGoal: firstNumber(records, 'daily_goal'),
        dailyDistanceGoal: firstNumber(records, 'daily_distance_goal'),
        dailyActiveMinutesGoal: firstNumber(records, 'daily_active_minutes_goal'),
    };
}

function normalizeHeight(value: number | undefined): number | undefined {
    return value !== undefined && value > 0 && value <= 3 ? value * 100 : value;
}

function normalizeWeight(value: number | undefined): number | undefined {
    return value !== undefined && value >= 100 ? value / 1000 : value;
}

function addressText(value: unknown): string | undefined {
    const record = asRecord(value);
    if (!record) {
        return undefined;
    }
    const fullAddress = firstString([record], 'full_address', 'formatted_address');
    if (fullAddress) {
        return fullAddress;
    }
    const street = [firstString([record], 'street'), firstString([record], 'house_number')].filter(Boolean).join(' ');
    const city = [firstString([record], 'zip_code'), firstString([record], 'city')].filter(Boolean).join(' ');
    return [street, city, firstString([record], 'country')].filter(Boolean).join(', ') || undefined;
}

function normalizeTracker(
    listValue: unknown,
    detailsValue: unknown,
    locationValue: unknown,
    hardwareValue: unknown,
    petIdByTracker: ReadonlyMap<string, string>,
): TrackerStateModel | undefined {
    const records = [...layers(detailsValue), ...layers(listValue)];
    const id = firstString(records, '_id', 'id');
    if (!id) {
        return undefined;
    }
    const location = asRecord(locationValue);
    const hardware = asRecord(hardwareValue);
    const latlong = Array.isArray(location?.latlong) ? location.latlong : [];
    const state = firstString(records, 'state');
    const chargingState = firstString(records, 'charging_state');
    const stateReason = firstString(records, 'state_reason');
    const positionTime = timestampToMilliseconds(firstNumber(location ? [location] : [], 'time', 'time_rcvd'));
    const hardwareTime = timestampToMilliseconds(firstNumber(hardware ? [hardware] : [], 'time'));

    return {
        id,
        name: firstString(records, 'name', 'hw_id') ?? id,
        model: firstString(records, 'model_number', 'model'),
        firmwareVersion: firstString(records, 'fw_version', 'firmware_version'),
        hardwareVersion: firstString(records, 'hw_edition', 'hardware_version'),
        petId: petIdByTracker.get(id) ?? firstString(records, 'trackable_object_id', 'pet_id'),
        online:
            state === undefined ? positionTime !== undefined : !['OFFLINE', 'DISABLED'].includes(state.toUpperCase()),
        lastSeen: positionTime,
        connectionType: firstString(location ? [location] : [], 'connection_type') ?? stateReason,
        batteryLevel: firstNumber(hardware ? [hardware] : [], 'battery_level'),
        charging: chargingState === undefined ? undefined : chargingState.toUpperCase() === 'CHARGING',
        powerSaving:
            firstBoolean(records, 'battery_save_mode', 'power_saving') ??
            (stateReason === undefined ? undefined : stateReason.toUpperCase().includes('POWER')),
        positionAccuracy: firstNumber(location ? [location] : [], 'pos_uncertainty', 'accuracy'),
        latitude: typeof latlong[0] === 'number' ? latlong[0] : undefined,
        longitude: typeof latlong[1] === 'number' ? latlong[1] : undefined,
        altitude: firstNumber(location ? [location] : [], 'altitude', 'alt'),
        speed: firstNumber(location ? [location] : [], 'speed'),
        address: addressText(location?.address),
        capabilities: firstStringArray(records, 'capabilities'),
        operationalState: state,
        stateReason,
        batteryState: firstString(records, 'battery_state'),
        lastHardwareUpdate: hardwareTime,
        stale: positionTime === undefined || Date.now() - positionTime > 3 * 60 * 60 * 1000,
    };
}

function stateDeps(api: ITractiveApiEndpoints): StateDeps {
    return {
        extendObjectAsync: api.extendObjectAsync,
        setState: api.setState,
        getObjectAsync: api.getObjectAsync,
    };
}

async function synchronize(api: ITractiveApiEndpoints, fullSync: boolean): Promise<TractiveAPIResponse<boolean>> {
    const cache = getAggregationCache(api);
    const hardwareSyncDue = fullSync || Date.now() - cache.lastHardwareSync >= HARDWARE_SYNC_INTERVAL_MS;

    if (fullSync) {
        const petsResult = await api.getPets();
        if (!petsResult.success || !petsResult.data) {
            return { success: false, error: 'Could not retrieve pets' };
        }

        const petApiData: AggregationCache['petApiData'] = {};
        const petIdByTracker = new Map<string, string>();
        for (const petListItem of petsResult.data) {
            const petId = firstString(layers(petListItem), '_id', 'id');
            if (!petId) {
                api.log.warn('Skipping a pet without a stable ID');
                continue;
            }

            const details = await api.getPet(petId);
            if (!details.success) {
                api.log.warn(`Could not retrieve details for pet ${petId}; using list data`);
            }
            const detailValue = details.data ?? petListItem;
            const profilePictureId = firstString(layers(detailValue), 'profile_picture_id');
            const profilePicture = profilePictureId ? await api.getImage(profilePictureId) : undefined;
            const pet = normalizePet(detailValue, profilePicture?.data);
            if (!pet) {
                api.log.warn('Skipping pet data that does not match the expected schema');
                continue;
            }
            petApiData[petId] = {
                list: petListItem,
                ...(details.data ? { details: details.data } : {}),
                ...(profilePicture?.data ? { profilePicture: profilePicture.data } : {}),
            };
            if (pet.trackerId) {
                petIdByTracker.set(pet.trackerId, pet.id);
            }
            await writePetStates(stateDeps(api), pet);
        }
        cache.petApiData = petApiData;
        cache.petIdByTracker = petIdByTracker;
    }

    const trackersResult = await api.getAllTrackers();
    if (!trackersResult.success || !trackersResult.data) {
        return { success: false, error: 'Could not retrieve trackers' };
    }

    let writtenTrackers = 0;
    const trackerApiData: Record<
        string,
        {
            list: TractiveTracker;
            details?: TractiveTracker;
            location?: TractiveTrackerLocation;
            hardware?: TractiveTrackerHardware;
        }
    > = {};
    const seenTrackerIds = new Set<string>();
    for (const trackerListItem of trackersResult.data) {
        const listRecords = layers(trackerListItem);
        const trackerId = firstString(listRecords, '_id', 'id');
        if (!trackerId) {
            api.log.warn('Skipping a tracker without a stable ID');
            continue;
        }

        // Static details are refreshed daily. Hardware reports (including battery)
        // use a separate 15-minute cadence, while positions follow the poll interval.
        const details = fullSync
            ? await api.getTracker(trackerId)
            : { success: true as const, data: cache.trackerDetails.get(trackerId) ?? trackerListItem };
        const location = await api.getTrackerLocation(trackerId);
        const hardware = hardwareSyncDue
            ? await api.getTrackerHardware(trackerId)
            : { success: true as const, data: cache.trackerHardware.get(trackerId) ?? {} };
        if (fullSync && details.success) {
            cache.trackerDetails.set(trackerId, details.data);
        }
        if (hardwareSyncDue && hardware.success) {
            cache.trackerHardware.set(trackerId, hardware.data);
        }
        trackerApiData[trackerId] = {
            list: trackerListItem,
            ...(details.data ? { details: details.data } : {}),
            ...(location.data ? { location: location.data } : {}),
            ...(hardware.data ? { hardware: hardware.data } : {}),
        };
        const tracker = normalizeTracker(
            trackerListItem,
            details.data,
            location.data,
            hardware.data,
            cache.petIdByTracker,
        );
        if (!tracker) {
            api.log.warn('Skipping tracker data that does not match the expected schema');
            continue;
        }
        await writeTrackerStates(stateDeps(api), tracker);
        seenTrackerIds.add(tracker.id);
        writtenTrackers += 1;
    }

    if (hardwareSyncDue) {
        cache.lastHardwareSync = Date.now();
    }

    await writeApiData(stateDeps(api), {
        updatedAt: Date.now(),
        pets: cache.petApiData,
        trackers: trackerApiData,
    });

    if (api.getDevicesAsync) {
        const devices = await api.getDevicesAsync();
        for (const device of devices) {
            const match = /(?:^|\.)trackers\.([^.]+)$/.exec(device._id);
            const trackerId = match?.[1];
            if (trackerId && !seenTrackerIds.has(trackerId)) {
                await api.setState(`trackers.${trackerId}.health.missing`, true, true);
            }
        }
    }

    return writtenTrackers > 0 || trackersResult.data.length === 0
        ? { success: true, data: true }
        : { success: false, error: 'No tracker data could be processed' };
}

export async function updateAllData(api: ITractiveApiEndpoints): Promise<TractiveAPIResponse<boolean>> {
    return synchronize(api, true);
}

export async function updateTrackersOnly(api: ITractiveApiEndpoints): Promise<TractiveAPIResponse<boolean>> {
    return synchronize(api, false);
}
