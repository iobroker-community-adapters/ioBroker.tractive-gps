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
    connectionType?: string;
    sensorUsed?: string;
    home?: boolean;
    batteryLevel?: number;
    charging?: boolean;
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
    await deps.extendObjectAsync(id, {
        type,
        common: { name },
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
        common: {
            name,
            type: 'boolean',
            role: 'switch',
            read: true,
            write: true,
            def: false,
        },
        native: { capability },
    });
}

function optional(value: string | number | boolean | undefined): ioBroker.StateValue {
    return value === undefined ? null : value;
}

function safeIdSegment(value: string): string {
    const result = value.trim().replace(/[.\s*?,;:'"`<>\\/[\](){}]+/g, '_');
    return result || 'value';
}

async function writeApiTree(deps: StateDeps, prefix: string, value: unknown): Promise<void> {
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        await ensureContainer(deps, prefix, 'channel', prefix.split('.').at(-1) ?? prefix);
        for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
            await writeApiTree(deps, `${prefix}.${safeIdSegment(key)}`, child);
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
        await writeState(deps, {
            id: `${prefix}Length`,
            name: 'Length',
            type: 'number',
            role: 'value',
            value: value.length,
        });
        await ensureContainer(deps, `${prefix}Items`, 'channel', 'Items');
        for (const [index, child] of value.entries()) {
            const record =
                child !== null && typeof child === 'object' && !Array.isArray(child)
                    ? (child as Record<string, unknown>)
                    : undefined;
            const resourceId =
                typeof record?._id === 'string' ? record._id : typeof record?.id === 'string' ? record.id : undefined;
            await writeApiTree(deps, `${prefix}Items.${safeIdSegment(resourceId ?? String(index))}`, child);
        }
        return;
    }

    const stateType: ioBroker.CommonType = value === null ? 'mixed' : (typeof value as ioBroker.CommonType);
    await writeState(deps, {
        id: prefix,
        name: prefix.split('.').at(-1) ?? prefix,
        type: stateType,
        role: 'state',
        value: value as ioBroker.StateValue,
    });
}

/** Writes the complete API response locally. Callers must never pass credentials or the access token. */
export async function writeApiData(deps: StateDeps, value: unknown): Promise<void> {
    await ensureContainer(deps, 'api', 'folder', 'Current API data');
    await ensureContainer(deps, 'info', 'channel', 'Information');
    await writeApiTree(deps, 'api.data', value);
    await writeState(deps, {
        id: 'info.currentApi',
        name: 'Current complete API data',
        type: 'string',
        role: 'json',
        value: JSON.stringify(value),
    });
}

export async function writePetStates(deps: StateDeps, pet: PetStateModel): Promise<void> {
    await ensureContainer(deps, 'pets', 'folder', 'Pets');
    await ensureContainer(deps, `pets.${pet.id}`, 'device', pet.name || pet.id);
    await ensureContainer(deps, `pets.${pet.id}.info`, 'channel', 'Pet information');

    const prefix = `pets.${pet.id}.info`;
    const states: StateDefinition[] = [
        { id: `${prefix}.name`, name: 'Name', type: 'string', role: 'text', value: pet.name },
        { id: `${prefix}.type`, name: 'Pet type', type: 'string', role: 'text', value: optional(pet.type) },
        { id: `${prefix}.gender`, name: 'Gender', type: 'string', role: 'text', value: optional(pet.gender) },
        {
            id: `${prefix}.birthday`,
            name: 'Birthday',
            type: 'number',
            role: 'date',
            value: optional(pet.birthday),
        },
        {
            id: `${prefix}.height`,
            name: 'Height',
            type: 'number',
            role: 'value',
            unit: 'cm',
            value: optional(pet.height),
        },
        {
            id: `${prefix}.weight`,
            name: 'Weight',
            type: 'number',
            role: 'value',
            unit: 'kg',
            value: optional(pet.weight),
        },
        {
            id: `${prefix}.length`,
            name: 'Length',
            type: 'number',
            role: 'value',
            unit: 'cm',
            value: optional(pet.length),
        },
        {
            id: `${prefix}.trackerId`,
            name: 'Tracker ID',
            type: 'string',
            role: 'text',
            value: optional(pet.trackerId),
        },
        {
            id: `${prefix}.breedIds`,
            name: 'Breed IDs',
            type: 'string',
            role: 'json',
            value: JSON.stringify(pet.breedIds),
        },
        { id: `${prefix}.chipId`, name: 'Chip ID', type: 'string', role: 'text', value: optional(pet.chipId) },
        {
            id: `${prefix}.neutered`,
            name: 'Neutered',
            type: 'boolean',
            role: 'indicator',
            value: optional(pet.neutered),
        },
        {
            id: `${prefix}.personality`,
            name: 'Personality',
            type: 'string',
            role: 'json',
            value: JSON.stringify(pet.personality),
        },
        {
            id: `${prefix}.lostOrDead`,
            name: 'Lost or dead',
            type: 'boolean',
            role: 'indicator.alarm',
            value: optional(pet.lostOrDead),
        },
        {
            id: `${prefix}.profilePictureId`,
            name: 'Profile picture ID',
            type: 'string',
            role: 'text',
            value: optional(pet.profilePictureId),
        },
        {
            id: `${prefix}.profilePictureUrl`,
            name: 'Profile picture URL',
            type: 'string',
            role: 'url',
            value: optional(pet.profilePictureUrl),
        },
        {
            id: `${prefix}.galleryPictureIds`,
            name: 'Gallery picture IDs',
            type: 'string',
            role: 'json',
            value: JSON.stringify(pet.galleryPictureIds),
        },
        {
            id: `${prefix}.createdAt`,
            name: 'Created at',
            type: 'number',
            role: 'date',
            value: optional(pet.createdAt),
        },
        {
            id: `${prefix}.dailyGoal`,
            name: 'Daily activity goal',
            type: 'number',
            role: 'value',
            value: optional(pet.dailyGoal),
        },
        {
            id: `${prefix}.dailyDistanceGoal`,
            name: 'Daily distance goal',
            type: 'number',
            role: 'value.distance',
            unit: 'm',
            value: optional(pet.dailyDistanceGoal),
        },
        {
            id: `${prefix}.dailyActiveMinutesGoal`,
            name: 'Daily active minutes goal',
            type: 'number',
            role: 'value.interval',
            unit: 'min',
            value: optional(pet.dailyActiveMinutesGoal),
        },
    ];
    for (const state of states) {
        await writeState(deps, state);
    }
}

export async function writeTrackerStates(deps: StateDeps, tracker: TrackerStateModel): Promise<void> {
    const legacyDevice = await deps.getObjectAsync?.(tracker.id);
    const legacyName = typeof legacyDevice?.common?.name === 'string' ? legacyDevice.common.name : undefined;
    const displayName = legacyName && legacyName !== tracker.id ? legacyName : tracker.name;

    await ensureContainer(deps, 'trackers', 'folder', 'Trackers');
    await ensureContainer(deps, `trackers.${tracker.id}`, 'device', displayName || tracker.id);
    await ensureContainer(deps, `trackers.${tracker.id}.info`, 'channel', 'Tracker information');
    await ensureContainer(deps, `trackers.${tracker.id}.status`, 'channel', 'Tracker status');
    await ensureContainer(deps, `trackers.${tracker.id}.location`, 'channel', 'Location');
    await ensureContainer(deps, `trackers.${tracker.id}.health`, 'channel', 'Tracker health');

    const info = `trackers.${tracker.id}.info`;
    const status = `trackers.${tracker.id}.status`;
    const location = `trackers.${tracker.id}.location`;
    const health = `trackers.${tracker.id}.health`;
    const states: StateDefinition[] = [
        { id: `${info}.name`, name: 'Name', type: 'string', role: 'text', value: tracker.name },
        { id: `${info}.model`, name: 'Model', type: 'string', role: 'text', value: optional(tracker.model) },
        {
            id: `${info}.firmwareVersion`,
            name: 'Firmware version',
            type: 'string',
            role: 'text',
            value: optional(tracker.firmwareVersion),
        },
        {
            id: `${info}.hardwareVersion`,
            name: 'Hardware version',
            type: 'string',
            role: 'text',
            value: optional(tracker.hardwareVersion),
        },
        { id: `${info}.petId`, name: 'Pet ID', type: 'string', role: 'text', value: optional(tracker.petId) },
        {
            id: `${info}.capabilities`,
            name: 'Capabilities',
            type: 'string',
            role: 'json',
            value: JSON.stringify(tracker.capabilities),
        },
        {
            id: `${status}.online`,
            name: 'Online',
            type: 'boolean',
            role: 'indicator.connected',
            value: optional(tracker.online),
        },
        {
            id: `${status}.lastSeen`,
            name: 'Last seen',
            type: 'number',
            role: 'date',
            value: optional(tracker.lastSeen),
        },
        {
            id: `${status}.connectionType`,
            name: 'Connection type',
            type: 'string',
            role: 'text',
            value: optional(tracker.connectionType),
        },
        {
            id: `${status}.sensorUsed`,
            name: 'Position sensor used',
            type: 'string',
            role: 'text',
            value: optional(tracker.sensorUsed),
        },
        {
            id: `${status}.home`,
            name: 'Tracker is at home',
            type: 'boolean',
            role: 'indicator',
            value: optional(tracker.home),
        },
        {
            id: `${status}.batteryLevel`,
            name: 'Battery level',
            type: 'number',
            role: 'value.battery',
            unit: '%',
            min: 0,
            max: 100,
            value: optional(tracker.batteryLevel),
        },
        {
            id: `${status}.charging`,
            name: 'Charging',
            type: 'boolean',
            role: 'indicator',
            value: optional(tracker.charging),
        },
        {
            id: `${status}.powerSaving`,
            name: 'Power saving',
            type: 'boolean',
            role: 'indicator',
            value: optional(tracker.powerSaving),
        },
        {
            id: `${status}.positionAccuracy`,
            name: 'Position accuracy',
            type: 'number',
            role: 'value.distance',
            unit: 'm',
            value: optional(tracker.positionAccuracy),
        },
        {
            id: `${location}.latitude`,
            name: 'Latitude',
            type: 'number',
            role: 'value.gps.latitude',
            unit: '°',
            value: optional(tracker.latitude),
        },
        {
            id: `${location}.longitude`,
            name: 'Longitude',
            type: 'number',
            role: 'value.gps.longitude',
            unit: '°',
            value: optional(tracker.longitude),
        },
        {
            id: `${location}.altitude`,
            name: 'Altitude',
            type: 'number',
            role: 'value',
            unit: 'm',
            value: optional(tracker.altitude),
        },
        {
            id: `${location}.speed`,
            name: 'Speed',
            type: 'number',
            role: 'value.speed',
            value: optional(tracker.speed),
        },
        {
            id: `${location}.timestamp`,
            name: 'Position timestamp',
            type: 'number',
            role: 'date',
            value: optional(tracker.lastSeen),
        },
        {
            id: `${location}.address`,
            name: 'Address',
            type: 'string',
            role: 'text',
            value: optional(tracker.address),
        },
        {
            id: `${location}.distance`,
            name: 'Distance from ioBroker',
            type: 'number',
            role: 'value.distance',
            unit: 'm',
            value: optional(tracker.distance),
        },
        {
            id: `${health}.operationalState`,
            name: 'Operational state',
            type: 'string',
            role: 'text',
            value: optional(tracker.operationalState),
        },
        {
            id: `${health}.stateReason`,
            name: 'State reason',
            type: 'string',
            role: 'text',
            value: optional(tracker.stateReason),
        },
        {
            id: `${health}.batteryState`,
            name: 'Battery state',
            type: 'string',
            role: 'text',
            value: optional(tracker.batteryState),
        },
        {
            id: `${health}.lastHardwareUpdate`,
            name: 'Last hardware update',
            type: 'number',
            role: 'date',
            value: optional(tracker.lastHardwareUpdate),
        },
        {
            id: `${health}.stale`,
            name: 'Tracker data is stale',
            type: 'boolean',
            role: 'indicator.maintenance',
            value: tracker.stale,
        },
        {
            id: `${health}.missing`,
            name: 'Tracker is missing from the account',
            type: 'boolean',
            role: 'indicator.maintenance',
            value: false,
        },
    ];
    for (const state of states) {
        await writeState(deps, state);
    }

    // Keep the two widely used legacy location IDs available for existing
    // scripts and visualizations. Their canonical equivalents remain below trackers.*.
    await ensureContainer(deps, tracker.id, 'device', displayName || tracker.id);
    await ensureContainer(deps, `${tracker.id}.device_pos_report`, 'channel', 'Position report');
    await writeState(deps, {
        id: `${tracker.id}.device_pos_report.sensor_used`,
        name: 'Position sensor used',
        type: 'string',
        role: 'text',
        value: optional(tracker.sensorUsed),
    });
    await writeState(deps, {
        id: `${tracker.id}.device_pos_report.distance`,
        name: 'Distance from ioBroker',
        type: 'number',
        role: 'value.distance',
        unit: 'm',
        value: optional(tracker.distance),
    });

    const capabilities = new Set(tracker.capabilities.map(capability => capability.toUpperCase()));
    const commands = `trackers.${tracker.id}.commands`;
    if (capabilities.has('LT')) {
        await ensureContainer(deps, commands, 'channel', 'Tracker commands');
        await ensureCommandState(deps, `${commands}.liveTracking`, 'Live tracking', 'LT');
    }
    if (capabilities.has('LED')) {
        await ensureContainer(deps, commands, 'channel', 'Tracker commands');
        await ensureCommandState(deps, `${commands}.led`, 'LED', 'LED');
    }
    if (capabilities.has('BUZZER')) {
        await ensureContainer(deps, commands, 'channel', 'Tracker commands');
        await ensureCommandState(deps, `${commands}.buzzer`, 'Buzzer', 'BUZZER');
    }

    await updateLegacyTrackerStates(deps, tracker);
}

async function updateLegacyTrackerStates(deps: StateDeps, tracker: TrackerStateModel): Promise<void> {
    if (!deps.getObjectAsync) {
        return;
    }
    const values: Record<string, ioBroker.StateValue> = {
        [`${tracker.id}.trackers.name`]: tracker.name,
        [`${tracker.id}.tracker.state`]: optional(tracker.operationalState),
        [`${tracker.id}.tracker.state_reason`]: optional(tracker.stateReason),
        [`${tracker.id}.tracker.battery_state`]: optional(tracker.batteryState),
        [`${tracker.id}.tracker.capabilities`]: JSON.stringify(tracker.capabilities),
        [`${tracker.id}.device_hw_report.battery_level`]: optional(tracker.batteryLevel),
        [`${tracker.id}.device_pos_report.time`]: optional(tracker.lastSeen),
        [`${tracker.id}.device_pos_report.latitude`]: optional(tracker.latitude),
        [`${tracker.id}.device_pos_report.longitude`]: optional(tracker.longitude),
        [`${tracker.id}.device_pos_report.speed`]: optional(tracker.speed),
        [`${tracker.id}.device_pos_report.altitude`]: optional(tracker.altitude),
        [`${tracker.id}.device_pos_report.pos_uncertainty`]: optional(tracker.positionAccuracy),
        [`${tracker.id}.device_pos_report.sensor_used`]: optional(tracker.sensorUsed),
        [`${tracker.id}.device_pos_report.distance`]: optional(tracker.distance),
    };

    for (const [id, value] of Object.entries(values)) {
        if (await deps.getObjectAsync(id)) {
            await deps.setState(id, value, true);
        }
    }
}
