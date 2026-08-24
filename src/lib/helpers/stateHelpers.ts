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
            await writeDynamicTree(deps, `${prefix}Items.${safeIdSegment(resourceId ?? String(index))}`, child);
        }
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

/** Writes a logical, future-proof state tree and keeps the unmodified response as JSON. */
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
    const calculated = `pets.${pet.id}.calculated`;
    await ensureContainer(deps, calculated, 'channel', 'Calculated values');
    const states: StateDefinition[] = [];
    if (pet.birthday !== undefined) {
        states.push({
            id: `${calculated}.birthday`,
            name: 'Birthday',
            type: 'number',
            role: 'date',
            value: pet.birthday,
        });
    }
    if (pet.height !== undefined) {
        states.push({
            id: `${calculated}.height`,
            name: 'Height',
            type: 'number',
            role: 'value',
            unit: 'cm',
            value: pet.height,
        });
    }
    if (pet.weight !== undefined) {
        states.push({
            id: `${calculated}.weight`,
            name: 'Weight',
            type: 'number',
            role: 'value',
            unit: 'kg',
            value: pet.weight,
        });
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
    await ensureContainer(deps, status, 'channel', 'Tracker status');
    await ensureContainer(deps, location, 'channel', 'Location');
    const states: StateDefinition[] = [
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
            id: `trackers.${tracker.id}.info.pet_id`,
            name: 'Pet ID',
            type: 'string',
            role: 'text',
            value: tracker.petId,
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
            id: `${location}.addressText`,
            name: 'Address',
            type: 'string',
            role: 'text',
            value: tracker.address,
        });
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
