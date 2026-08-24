export interface StateDeps {
    extendObjectAsync: (
        id: string,
        obj: ioBroker.PartialObject,
        options?: ioBroker.ExtendObjectOptions,
    ) => ioBroker.SetObjectPromise;
    setState: (
        id: string,
        state: ioBroker.State | ioBroker.StateValue | ioBroker.SettableState,
        ack?: boolean,
    ) => ioBroker.SetStatePromise;
    getObjectAsync?: (id: string) => Promise<ioBroker.Object | null | undefined>;
}

export interface PetStateModel {
    id: string;
    name: string;
    type?: string;
    gender?: string;
    birthday?: number;
    height?: number;
    length?: number;
    weight?: number;
    trackerId?: string;
    breedIds: readonly string[];
    chipId?: string;
    neutered?: boolean;
    personality: readonly string[];
    lostOrDead?: boolean;
    profilePictureId?: string;
    profilePictureUrl?: string;
    galleryPictureIds: readonly string[];
    createdAt?: number;
    dailyGoal?: number;
    dailyDistanceGoal?: number;
    dailyActiveMinutesGoal?: number;
}

export interface TrackerStateModel {
    id: string;
    name: string;
    model?: string;
    firmwareVersion?: string;
    hardwareVersion?: string;
    petId?: string;
    online?: boolean;
    lastSeen?: number;
    sensorUsed?: string;
    home?: boolean;
    batteryLevel?: number;
    charging?: boolean;
    chargingState?: string;
    powerSaving?: boolean;
    positionAccuracy?: number;
    latitude?: number;
    longitude?: number;
    altitude?: number;
    speed?: number;
    address?: string;
    distance?: number;
    capabilities: readonly string[];
    operationalState?: string;
    stateReason?: string;
    batteryState?: string;
    lastHardwareUpdate?: number;
    stale: boolean;
}

interface StateDefinition {
    id: string;
    name: string;
    type: ioBroker.CommonType;
    role: string;
    value: ioBroker.StateValue;
    unit?: string;
    min?: number;
    max?: number;
    write?: boolean;
}

async function ensureContainer(
    deps: StateDeps,
    id: string,
    type: 'folder' | 'device' | 'channel',
    name: string,
): Promise<void> {
    const existing = await deps.getObjectAsync?.(id);
    const existingType = existing?.type;
    const containerType =
        existingType === 'folder' || existingType === 'device' || existingType === 'channel' ? existingType : type;
    const existingName = existing?.common?.name;
    await deps.extendObjectAsync(id, {
        type: containerType,
        common: { name: existingType === 'device' && existingName ? existingName : name },
        native: {},
    });
}

async function writeState(deps: StateDeps, definition: StateDefinition): Promise<void> {
    const { id, name, type, role, value, unit, min, max, write = false } = definition;
    await deps.extendObjectAsync(id, {
        type: 'state',
        common: {
            name,
            type,
            role,
            read: true,
            write,
            ...(unit === undefined ? {} : { unit }),
            ...(min === undefined ? {} : { min }),
            ...(max === undefined ? {} : { max }),
        },
        native: {},
    });
    await deps.setState(id, value, true);
}

async function ensureCommandState(deps: StateDeps, id: string, name: string, capability: string): Promise<void> {
    await deps.extendObjectAsync(id, {
        type: 'state',
        common: { name, type: 'boolean', role: 'switch', read: true, write: true, def: false },
        native: { capability },
    });
}

function safeIdSegment(value: string): string {
    const result = value.trim().replace(/[.\s*?,;:'"`<>\\/[\](){}]+/g, '_');
    return result || 'value';
}

async function writeDynamicTree(deps: StateDeps, prefix: string, value: unknown): Promise<void> {
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        await ensureContainer(deps, prefix, 'channel', prefix.split('.').at(-1) ?? prefix);
        for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
            await writeDynamicTree(deps, `${prefix}.${safeIdSegment(key)}`, child);
        }
        return;
    }
    if (Array.isArray(value)) {
        await writeState(deps, {
            id: prefix,
            name: prefix.split('.').at(-1) ?? prefix,
            type: 'string',
            role: 'json',
            value: JSON.stringify(value),
        });
        return;
    }
    await writeState(deps, {
        id: prefix,
        name: prefix.split('.').at(-1) ?? prefix,
        type: value === null ? 'mixed' : (typeof value as ioBroker.CommonType),
        role: 'state',
        value: value as ioBroker.StateValue,
    });
}

/** Writes the selected logical state tree and keeps the unmodified response as one JSON state. */
export async function writeApiData(
    deps: StateDeps,
    value: Record<string, unknown>,
    rawValue: unknown = value,
): Promise<void> {
    await ensureContainer(deps, 'info', 'channel', 'Information');
    for (const [key, child] of Object.entries(value)) {
        if (key === 'updatedAt') {
            await writeState(deps, {
                id: 'info.apiUpdatedAt',
                name: 'API data updated at',
                type: 'number',
                role: 'date',
                value: child as ioBroker.StateValue,
            });
        } else {
            await writeDynamicTree(deps, safeIdSegment(key), child);
        }
    }
    await writeState(deps, {
        id: 'info.currentApi',
        name: 'Current complete API data',
        type: 'string',
        role: 'json',
        value: JSON.stringify(rawValue),
    });
}

export async function writePetStates(deps: StateDeps, pet: PetStateModel): Promise<void> {
    await ensureContainer(deps, 'pets', 'folder', 'Pets');
    await ensureContainer(deps, `pets.${pet.id}`, 'device', pet.name || pet.id);
    const info = `pets.${pet.id}.info`;
    const activity = `pets.${pet.id}.activity`;
    const media = `pets.${pet.id}.media`;
    await ensureContainer(deps, info, 'channel', 'Pet information');
    const states: StateDefinition[] = [
        { id: `${info}.name`, name: 'Name', type: 'string', role: 'text', value: pet.name },
        {
            id: `${info}.breedIds`,
            name: 'Breed IDs',
            type: 'string',
            role: 'json',
            value: JSON.stringify(pet.breedIds),
        },
        {
            id: `${info}.personality`,
            name: 'Personality',
            type: 'string',
            role: 'json',
            value: JSON.stringify(pet.personality),
        },
    ];
    if (pet.type !== undefined) {
        states.push({ id: `${info}.type`, name: 'Pet type', type: 'string', role: 'text', value: pet.type });
    }
    if (pet.gender !== undefined) {
        states.push({ id: `${info}.gender`, name: 'Gender', type: 'string', role: 'text', value: pet.gender });
    }
    if (pet.birthday !== undefined) {
        states.push({
            id: `${info}.birthday`,
            name: 'Birthday',
            type: 'number',
            role: 'date',
            value: pet.birthday,
        });
    }
    if (pet.height !== undefined) {
        states.push({
            id: `${info}.height`,
            name: 'Height',
            type: 'number',
            role: 'value',
            unit: 'cm',
            value: pet.height,
        });
    }
    if (pet.weight !== undefined) {
        states.push({
            id: `${info}.weight`,
            name: 'Weight',
            type: 'number',
            role: 'value',
            unit: 'kg',
            value: pet.weight,
        });
    }
    if (pet.length !== undefined) {
        states.push({
            id: `${info}.length`,
            name: 'Length',
            type: 'number',
            role: 'value',
            unit: 'cm',
            value: pet.length,
        });
    }
    if (pet.trackerId !== undefined) {
        states.push({
            id: `${info}.trackerId`,
            name: 'Tracker ID',
            type: 'string',
            role: 'text',
            value: pet.trackerId,
        });
    }
    if (pet.chipId !== undefined) {
        states.push({ id: `${info}.chipId`, name: 'Chip ID', type: 'string', role: 'text', value: pet.chipId });
    }
    if (pet.neutered !== undefined) {
        states.push({
            id: `${info}.neutered`,
            name: 'Neutered',
            type: 'boolean',
            role: 'indicator',
            value: pet.neutered,
        });
    }
    if (pet.lostOrDead !== undefined) {
        states.push({
            id: `${info}.lostOrDead`,
            name: 'Lost or dead',
            type: 'boolean',
            role: 'indicator.alarm',
            value: pet.lostOrDead,
        });
    }
    if (pet.createdAt !== undefined) {
        states.push({
            id: `${info}.createdAt`,
            name: 'Created at',
            type: 'number',
            role: 'date',
            value: pet.createdAt,
        });
    }
    const activityStates: StateDefinition[] = [];
    if (pet.dailyGoal !== undefined) {
        activityStates.push({
            id: `${activity}.dailyGoal`,
            name: 'Daily goal',
            type: 'number',
            role: 'value',
            value: pet.dailyGoal,
        });
    }
    if (pet.dailyDistanceGoal !== undefined) {
        activityStates.push({
            id: `${activity}.dailyDistanceGoal`,
            name: 'Daily distance goal',
            type: 'number',
            role: 'value.distance',
            value: pet.dailyDistanceGoal,
        });
    }
    if (pet.dailyActiveMinutesGoal !== undefined) {
        activityStates.push({
            id: `${activity}.dailyActiveMinutesGoal`,
            name: 'Daily active minutes goal',
            type: 'number',
            role: 'value.interval',
            unit: 'min',
            value: pet.dailyActiveMinutesGoal,
        });
    }
    if (activityStates.length) {
        await ensureContainer(deps, activity, 'channel', 'Activity goals');
        states.push(...activityStates);
    }
    const mediaStates: StateDefinition[] = [];
    if (pet.profilePictureId !== undefined) {
        mediaStates.push({
            id: `${media}.profilePictureId`,
            name: 'Profile picture ID',
            type: 'string',
            role: 'text',
            value: pet.profilePictureId,
        });
    }
    if (pet.profilePictureUrl !== undefined) {
        mediaStates.push({
            id: `${media}.localProfilePictureUrl`,
            name: 'Local profile picture URL',
            type: 'string',
            role: 'text.url',
            value: pet.profilePictureUrl,
        });
    }
    if (mediaStates.length) {
        await ensureContainer(deps, media, 'channel', 'Pet image');
        states.push(...mediaStates);
    }
    for (const state of states) {
        await writeState(deps, state);
    }
}

export async function writeTrackerStates(deps: StateDeps, tracker: TrackerStateModel): Promise<void> {
    await ensureContainer(deps, 'trackers', 'folder', 'Trackers');
    await ensureContainer(deps, `trackers.${tracker.id}`, 'device', tracker.name || tracker.id);
    const status = `trackers.${tracker.id}.status`;
    const location = `trackers.${tracker.id}.location`;
    const info = `trackers.${tracker.id}.info`;
    const hardware = `trackers.${tracker.id}.hardware`;
    await ensureContainer(deps, info, 'channel', 'Tracker information');
    await ensureContainer(deps, status, 'channel', 'Tracker status');
    await ensureContainer(deps, location, 'channel', 'Location');
    const states: StateDefinition[] = [
        { id: `${info}.name`, name: 'Name', type: 'string', role: 'text', value: tracker.name },
        {
            id: `${info}.capabilities`,
            name: 'Capabilities',
            type: 'string',
            role: 'json',
            value: JSON.stringify(tracker.capabilities),
        },
        {
            id: `${status}.stale`,
            name: 'Tracker data is stale',
            type: 'boolean',
            role: 'indicator.maintenance',
            value: tracker.stale,
        },
        {
            id: `${status}.missing`,
            name: 'Tracker is missing from the account',
            type: 'boolean',
            role: 'indicator.maintenance',
            value: false,
        },
    ];
    if (tracker.model !== undefined) {
        states.push({ id: `${info}.model`, name: 'Model', type: 'string', role: 'text', value: tracker.model });
    }
    if (tracker.firmwareVersion !== undefined) {
        states.push({
            id: `${info}.firmwareVersion`,
            name: 'Firmware version',
            type: 'string',
            role: 'text',
            value: tracker.firmwareVersion,
        });
    }
    if (tracker.hardwareVersion !== undefined) {
        states.push({
            id: `${info}.hardwareVersion`,
            name: 'Hardware version',
            type: 'string',
            role: 'text',
            value: tracker.hardwareVersion,
        });
    }
    if (tracker.online !== undefined) {
        states.push({
            id: `${status}.online`,
            name: 'Online',
            type: 'boolean',
            role: 'indicator.connected',
            value: tracker.online,
        });
    }
    if (tracker.home !== undefined) {
        states.push({
            id: `${status}.home`,
            name: 'Tracker is at home',
            type: 'boolean',
            role: 'indicator',
            value: tracker.home,
        });
    }
    if (tracker.lastSeen !== undefined) {
        states.push({
            id: `${status}.lastSeen`,
            name: 'Last seen',
            type: 'number',
            role: 'date',
            value: tracker.lastSeen,
        });
    }
    if (tracker.petId !== undefined) {
        states.push({
            id: `${info}.petId`,
            name: 'Pet ID',
            type: 'string',
            role: 'text',
            value: tracker.petId,
        });
    }
    if (tracker.sensorUsed !== undefined) {
        states.push({
            id: `${location}.sensorUsed`,
            name: 'Position source',
            type: 'string',
            role: 'text',
            value: tracker.sensorUsed,
        });
    }
    if (tracker.positionAccuracy !== undefined) {
        states.push({
            id: `${location}.positionAccuracy`,
            name: 'Position accuracy',
            type: 'number',
            role: 'value.distance',
            unit: 'm',
            value: tracker.positionAccuracy,
        });
    }
    if (tracker.latitude !== undefined) {
        states.push({
            id: `${location}.latitude`,
            name: 'Latitude',
            type: 'number',
            role: 'value.gps.latitude',
            unit: '°',
            value: tracker.latitude,
        });
    }
    if (tracker.longitude !== undefined) {
        states.push({
            id: `${location}.longitude`,
            name: 'Longitude',
            type: 'number',
            role: 'value.gps.longitude',
            unit: '°',
            value: tracker.longitude,
        });
    }
    if (tracker.altitude !== undefined) {
        states.push({
            id: `${location}.altitude`,
            name: 'Altitude',
            type: 'number',
            role: 'value',
            unit: 'm',
            value: tracker.altitude,
        });
    }
    if (tracker.speed !== undefined) {
        states.push({
            id: `${location}.speed`,
            name: 'Speed',
            type: 'number',
            role: 'value.speed',
            value: tracker.speed,
        });
    }
    if (tracker.distance !== undefined) {
        states.push({
            id: `${location}.distance`,
            name: 'Distance from ioBroker',
            type: 'number',
            role: 'value.distance',
            unit: 'm',
            value: tracker.distance,
        });
    }
    if (tracker.address !== undefined) {
        states.push({
            id: `${location}.address`,
            name: 'Address',
            type: 'string',
            role: 'text',
            value: tracker.address,
        });
    }
    if (tracker.operationalState !== undefined) {
        states.push({
            id: `${status}.state`,
            name: 'Operational state',
            type: 'string',
            role: 'text',
            value: tracker.operationalState,
        });
    }
    if (tracker.stateReason !== undefined) {
        states.push({
            id: `${status}.stateReason`,
            name: 'State reason',
            type: 'string',
            role: 'text',
            value: tracker.stateReason,
        });
    }
    if (tracker.powerSaving !== undefined) {
        states.push({
            id: `${status}.powerSaving`,
            name: 'Power saving',
            type: 'boolean',
            role: 'indicator',
            value: tracker.powerSaving,
        });
    }
    const hardwareStates: StateDefinition[] = [];
    if (tracker.batteryLevel !== undefined) {
        hardwareStates.push({
            id: `${hardware}.batteryLevel`,
            name: 'Battery level',
            type: 'number',
            role: 'value.battery',
            unit: '%',
            min: 0,
            max: 100,
            value: tracker.batteryLevel,
        });
    }
    if (tracker.charging !== undefined) {
        hardwareStates.push({
            id: `${hardware}.charging`,
            name: 'Charging',
            type: 'boolean',
            role: 'indicator',
            value: tracker.charging,
        });
    }
    if (tracker.chargingState !== undefined) {
        hardwareStates.push({
            id: `${hardware}.chargingState`,
            name: 'Charging state',
            type: 'string',
            role: 'text',
            value: tracker.chargingState,
        });
    }
    if (tracker.batteryState !== undefined) {
        hardwareStates.push({
            id: `${hardware}.batteryState`,
            name: 'Battery state',
            type: 'string',
            role: 'text',
            value: tracker.batteryState,
        });
    }
    if (tracker.lastHardwareUpdate !== undefined) {
        hardwareStates.push({
            id: `${hardware}.lastUpdate`,
            name: 'Last hardware update',
            type: 'number',
            role: 'date',
            value: tracker.lastHardwareUpdate,
        });
    }
    if (hardwareStates.length) {
        await ensureContainer(deps, hardware, 'channel', 'Hardware and battery');
        states.push(...hardwareStates);
    }
    for (const state of states) {
        await writeState(deps, state);
    }

    const capabilities = new Set(tracker.capabilities.map(capability => capability.toUpperCase()));
    const commands = `trackers.${tracker.id}.commands`;
    if (capabilities.has('LT') || capabilities.has('LED') || capabilities.has('BUZZER')) {
        await ensureContainer(deps, commands, 'channel', 'Tracker commands');
    }
    if (capabilities.has('LT')) {
        await ensureCommandState(deps, `${commands}.liveTracking`, 'Live tracking', 'LT');
    }
    if (capabilities.has('LED')) {
        await ensureCommandState(deps, `${commands}.led`, 'LED', 'LED');
    }
    if (capabilities.has('BUZZER')) {
        await ensureCommandState(deps, `${commands}.buzzer`, 'Buzzer', 'BUZZER');
    }
}
