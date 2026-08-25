import type { AxiosInstance, AxiosRequestConfig } from 'axios';
import axios from 'axios';
import type {
    TractiveAddress,
    TractiveAccount,
    TractiveAPIResponse,
    TractiveAuth,
    TractivePet,
    TractiveShare,
    TractiveSubscription,
    TractiveTracker,
    TractiveTrackerHardware,
    TractiveTrackerLocation,
} from '../types/types';
import type { ITractiveApiEndpoints } from './services/dataAggregation';
import {
    updateAllData as aggregateUpdateAllData,
    updateTrackersOnly as aggregateUpdateTrackersOnly,
} from './services/dataAggregation';

export interface TractiveAPIOptions {
    httpClient?: AxiosInstance;
    requestIntervalMs?: number;
    retryDelaysMs?: readonly number[];
    sleep: (milliseconds: number) => Promise<void>;
    random?: () => number;
    reverseGeocoding?: boolean;
    getDevicesAsync?: () => Promise<readonly ioBroker.Object[]>;
    getForeignObjectAsync?: (id: string) => Promise<ioBroker.Object | null | undefined>;
    writeFileAsync?: (adapterName: string | null, path: string, data: Buffer | string) => Promise<void>;
    fileNamespace?: string;
}

export class TractiveAPI implements ITractiveApiEndpoints {
    private readonly api: AxiosInstance;
    public auth: TractiveAuth | null = null;
    public log: ioBroker.Logger;

    public readonly setState: (
        id: string,
        state: ioBroker.State | ioBroker.StateValue | ioBroker.SettableState,
        ack?: boolean,
    ) => ioBroker.SetStatePromise;
    public readonly getObjectAsync: (id: string) => Promise<ioBroker.Object | null | undefined>;
    public readonly getDevicesAsync?: () => Promise<readonly ioBroker.Object[]>;
    public readonly getForeignObjectAsync?: (id: string) => Promise<ioBroker.Object | null | undefined>;
    private readonly tractiveClient = '6536c228870a3c8857d452e8';
    private credentials: { email: string; password: string } | null = null;
    private refreshPromise: Promise<boolean> | null = null;
    private readonly abortController = new AbortController();
    public readonly extendObjectAsync: (
        id: string,
        obj: ioBroker.PartialObject,
        options?: ioBroker.ExtendObjectOptions,
    ) => ioBroker.SetObjectPromise;

    // Rate limiting / retry configuration
    private lastRequestTime = 0;
    private requestDelay: number;
    private rateLimitedUntil = 0;
    private rateLimitQueue: Promise<void> = Promise.resolve();
    private readonly retryDelays: readonly number[];
    private readonly sleep: (milliseconds: number) => Promise<void>;
    private readonly random: () => number;
    private readonly reverseGeocoding: boolean;
    private readonly writeFileAsync?: TractiveAPIOptions['writeFileAsync'];
    private readonly fileNamespace?: string;
    private readonly profilePictureCache = new Map<string, string>();
    private readonly addressCache = new Map<
        string,
        { latitude: number; longitude: number; address: TractiveAddress }
    >();

    /**
     *
     */
    constructor(
        log: ioBroker.Logger,
        getObjectAsync: (id: string) => Promise<ioBroker.Object | null | undefined>,
        setState: (
            id: string,
            state: ioBroker.State | ioBroker.StateValue | ioBroker.SettableState,
            ack?: boolean,
        ) => ioBroker.SetStatePromise,
        extendObjectAsync: (
            id: string,
            obj: ioBroker.PartialObject,
            options?: ioBroker.ExtendObjectOptions,
        ) => ioBroker.SetObjectPromise,
        options: TractiveAPIOptions,
    ) {
        this.log = log;
        this.getObjectAsync = getObjectAsync;
        this.getDevicesAsync = options.getDevicesAsync;
        this.getForeignObjectAsync = options.getForeignObjectAsync;
        this.writeFileAsync = options.writeFileAsync;
        this.fileNamespace = options.fileNamespace;
        this.setState = setState;
        this.extendObjectAsync = extendObjectAsync;

        this.requestDelay = options.requestIntervalMs ?? 5000;
        this.retryDelays = options.retryDelaysMs ?? [60000, 120000, 300000, 600000];
        this.sleep = options.sleep;
        this.random = options.random ?? Math.random;
        this.reverseGeocoding = options.reverseGeocoding ?? false;

        this.api =
            options.httpClient ??
            axios.create({
                baseURL: 'https://graph.tractive.com/4',
                headers: {
                    'Content-Type': 'application/json',
                    Accept: 'application/json',
                    'X-Tractive-Client': this.tractiveClient,
                },
                timeout: 30000,
            });

        this.api.interceptors.request.use(async config => {
            await this.waitForRequestSlot();

            const requestUrl = config.url ?? '';
            const isGraphRequest =
                !/^https?:\/\//i.test(requestUrl) || /^https:\/\/graph\.tractive\.com\//i.test(requestUrl);
            if (requestUrl !== '/auth/token' && isGraphRequest && this.auth?.access_token) {
                config.headers = config.headers || {};
                config.headers.Authorization = `Bearer ${this.auth.access_token}`;
                config.headers['X-Tractive-User'] = this.auth.user_id;
            }
            return config;
        });
    }

    private isAuthenticated(): boolean {
        return this.auth !== null && this.auth.expires_at > Math.floor(Date.now() / 1000) + 300;
    }

    async initialize(email: string, password: string): Promise<boolean> {
        this.credentials = { email, password };
        return this.login(email, password);
    }

    async login(email: string, password: string): Promise<boolean> {
        try {
            const response = await this.api.post<unknown>(
                '/auth/token',
                {
                    grant_type: 'tractive',
                    platform_email: email,
                    platform_token: password,
                },
                { signal: this.abortController.signal },
            );

            if (TractiveAPI.isAuthResponse(response.data)) {
                this.auth = {
                    access_token: response.data.access_token,
                    expires_at: response.data.expires_at ?? Math.floor(Date.now() / 1000) + 86400,
                    user_id: response.data.user_id,
                };
                this.log.info('Login successful');
                return true;
            }
            this.auth = null;
            this.log.warn('Tractive authentication returned an invalid response');
            return false;
        } catch (error) {
            this.auth = null;
            this.log.error(`Tractive authentication failed: ${TractiveAPI.getSafeError(error)}`);
            return false;
        }
    }

    private async refreshAuth(): Promise<boolean> {
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

    private static isAuthResponse(
        value: unknown,
    ): value is { access_token: string; user_id: string; expires_at?: number } {
        if (!value || typeof value !== 'object') {
            return false;
        }
        const candidate = value as Partial<TractiveAuth>;
        return (
            typeof candidate.access_token === 'string' &&
            candidate.access_token.length > 0 &&
            typeof candidate.user_id === 'string' &&
            candidate.user_id.length > 0 &&
            (candidate.expires_at === undefined || typeof candidate.expires_at === 'number')
        );
    }

    private static isAddressResponse(value: unknown): value is TractiveAddress {
        if (!value || typeof value !== 'object') {
            return false;
        }
        const address = value as Partial<TractiveAddress>;
        return ['street', 'house_number', 'zip_code', 'city', 'country', 'full_address'].every(
            key => typeof address[key as keyof TractiveAddress] === 'string',
        );
    }

    private async waitForRequestSlot(): Promise<void> {
        const previous = this.rateLimitQueue;
        let release = (): void => undefined;
        this.rateLimitQueue = new Promise<void>(resolve => {
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

    private static getSafeError(error: unknown): string {
        if (!axios.isAxiosError(error)) {
            return 'Unexpected Tractive API error';
        }
        if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
            return 'Tractive API request timed out';
        }
        if (typeof error.response?.status === 'number') {
            return `Tractive API returned HTTP ${error.response.status}`;
        }
        return 'Tractive API request failed';
    }

    private static getRetryAfterMs(error: unknown, fallbackMs: number): number {
        if (!axios.isAxiosError(error)) {
            return fallbackMs;
        }
        const header = error.response?.headers?.['retry-after'];
        const value = Array.isArray(header) ? header[0] : header;
        if (typeof value === 'number' && Number.isFinite(value)) {
            return Math.max(0, value * 1000);
        }
        if (typeof value === 'string') {
            const seconds = Number(value);
            if (Number.isFinite(seconds)) {
                return Math.max(0, seconds * 1000);
            }
            const date = Date.parse(value);
            if (Number.isFinite(date)) {
                return Math.max(0, date - Date.now());
            }
        }
        return fallbackMs;
    }

    private async apiCall<T>(
        method: 'get' | 'post' | 'put' | 'delete',
        endpoint: string,
        data?: unknown,
        config?: AxiosRequestConfig,
        retryCount = 0,
        authRetried = false,
    ): Promise<TractiveAPIResponse<T>> {
        if (!this.isAuthenticated() && !(await this.refreshAuth())) {
            return { success: false, error: 'Not authenticated' };
        }

        try {
            const response = await this.api.request<T>({
                ...config,
                method,
                url: endpoint,
                data,
                signal: this.abortController.signal,
            });

            if (this.requestDelay > 5000) {
                this.requestDelay = Math.max(Math.floor(this.requestDelay * 0.9), 5000);
            }
            return { success: true, data: response.data };
        } catch (error: unknown) {
            const status = axios.isAxiosError(error) ? error.response?.status : undefined;

            if (status === 401 && !authRetried) {
                this.log.warn('Tractive authentication expired; refreshing the session');
                if (await this.refreshAuth()) {
                    return this.apiCall(method, endpoint, data, config, retryCount, true);
                }
            }

            if ((status === 429 || (status && status >= 500)) && retryCount < this.retryDelays.length) {
                const fallback = this.retryDelays[retryCount] + Math.floor(this.random() * 1000);
                const wait = status === 429 ? TractiveAPI.getRetryAfterMs(error, fallback) : fallback;
                if (status === 429) {
                    this.requestDelay = Math.min(Math.max(this.requestDelay * 2, 30000), 300000);
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

    public dispose(): void {
        this.abortController.abort();
        this.auth = null;
        this.credentials = null;
    }

    private static isRecord(value: unknown): value is Record<string, unknown> {
        return value !== null && typeof value === 'object' && !Array.isArray(value);
    }

    private async getRecord(endpoint: string, resource: string): Promise<TractiveAPIResponse<Record<string, unknown>>> {
        const response = await this.apiCall<unknown>('get', endpoint);
        if (!response.success) {
            return response;
        }
        if (!TractiveAPI.isRecord(response.data)) {
            this.log.warn(`Tractive returned an invalid ${resource} response`);
            return { success: false, error: `Invalid ${resource} response` };
        }
        return { success: true, data: response.data };
    }

    private async getRecordArray(
        endpoint: string,
        resource: string,
    ): Promise<TractiveAPIResponse<Record<string, unknown>[]>> {
        const response = await this.apiCall<unknown>('get', endpoint);
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
    async getAccount(): Promise<TractiveAPIResponse<TractiveAccount>> {
        if (!this.auth) {
            return { success: false, error: 'Not authenticated' };
        }
        return this.getRecord(`/user/${encodeURIComponent(this.auth.user_id)}`, 'account');
    }

    async getSubscriptions(): Promise<TractiveAPIResponse<TractiveSubscription[]>> {
        if (!this.auth) {
            return { success: false, error: 'Not authenticated' };
        }
        return this.getRecordArray(`/user/${encodeURIComponent(this.auth.user_id)}/subscriptions`, 'subscription list');
    }

    async getSubscription(subscriptionID: string): Promise<TractiveAPIResponse<TractiveSubscription>> {
        return this.getRecord(`/subscription/${encodeURIComponent(subscriptionID)}`, 'subscription');
    }

    async getShares(): Promise<TractiveAPIResponse<TractiveShare[]>> {
        if (!this.auth) {
            return { success: false, error: 'Not authenticated' };
        }
        return this.getRecordArray(`/user/${encodeURIComponent(this.auth.user_id)}/shares`, 'share list');
    }

    /** Cache a Tractive profile picture in ioBroker because the CDN declares JPEG files as binary downloads. */
    getProfilePictureUrl(imageID: string): string | Promise<string> {
        const publicUrl = `https://cdn.tractive.com/3/media/resource/${encodeURIComponent(imageID)}.jpg`;
        if (!this.writeFileAsync || !this.fileNamespace) {
            return publicUrl;
        }
        const cached = this.profilePictureCache.get(imageID);
        if (cached) {
            return cached;
        }
        return this.cacheProfilePicture(imageID, publicUrl);
    }

    private async cacheProfilePicture(imageID: string, publicUrl: string): Promise<string> {
        try {
            const response = await this.api.get<ArrayBuffer>(publicUrl, {
                responseType: 'arraybuffer',
                signal: this.abortController.signal,
            });
            const data = Buffer.from(response.data);
            if (data.length < 3 || data[0] !== 0xff || data[1] !== 0xd8 || data[2] !== 0xff) {
                throw new Error('Profile picture is not a JPEG');
            }
            const fileName = `${imageID.replace(/[^A-Za-z0-9_-]/g, '_')}.jpg`;
            await this.writeFileAsync!(this.fileNamespace!, `profile-images/${fileName}`, data);
            const localUrl = `../${this.fileNamespace}/profile-images/${encodeURIComponent(fileName)}`;
            this.profilePictureCache.set(imageID, localUrl);
            return localUrl;
        } catch {
            this.log.warn('Could not cache a Tractive profile picture locally; using the public URL as fallback');
            return publicUrl;
        }
    }

    /**
     *
     */
    async getPets(): Promise<TractiveAPIResponse<TractivePet[]>> {
        if (!this.auth) {
            return { success: false, error: 'Not authenticated' };
        }
        return this.getRecordArray(`/user/${encodeURIComponent(this.auth.user_id)}/trackable_objects`, 'pet list');
    }

    /**
     * Retrieve the complete details for one trackable object. The account list
     * only contains a lightweight reference and therefore usually has no pet
     * name or profile data.
     */
    async getPet(petID: string): Promise<TractiveAPIResponse<TractivePet>> {
        if (!this.auth) {
            return { success: false, error: 'Not authenticated' };
        }
        return this.getRecord(`/trackable_object/${encodeURIComponent(petID)}`, 'pet');
    }

    /** Resolve a profile-picture reference through Tractive's graph bulk endpoint. */
    async getImage(imageID: string): Promise<TractiveAPIResponse<Record<string, unknown>>> {
        const response = await this.apiCall<unknown>(
            'post',
            'https://graph.tractive.com/3/bulk',
            [{ _id: imageID, _type: 'image' }],
            { params: { schema: 'flat', partial: 'false' } },
        );
        if (!response.success) {
            return response;
        }
        if (!Array.isArray(response.data) || !TractiveAPI.isRecord(response.data[0])) {
            return { success: false, error: 'Invalid image response' };
        }
        return { success: true, data: response.data[0] };
    }

    /**
     *
     */
    async getAllTrackers(): Promise<TractiveAPIResponse<TractiveTracker[]>> {
        if (!this.auth) {
            return { success: false, error: 'Not authenticated' };
        }
        return this.getRecordArray(`/user/${encodeURIComponent(this.auth.user_id)}/trackers`, 'tracker list');
    }

    /**
     *
     */
    async getTracker(trackerID: string): Promise<TractiveAPIResponse<TractiveTracker>> {
        if (!this.auth) {
            return { success: false, error: 'Not authenticated' };
        }
        return this.getRecord(`/tracker/${encodeURIComponent(trackerID)}`, 'tracker');
    }

    /**
     *
     */
    async getTrackerLocation(trackerID: string): Promise<TractiveAPIResponse<TractiveTrackerLocation>> {
        if (!this.auth) {
            return { success: false, error: 'Not authenticated' };
        }

        try {
            const response = await this.getRecord(
                `/device_pos_report/${encodeURIComponent(trackerID)}`,
                'tracker location',
            );

            if (
                response.success &&
                response.data.latlong !== undefined &&
                (!Array.isArray(response.data.latlong) ||
                    response.data.latlong.length !== 2 ||
                    !response.data.latlong.every(
                        coordinate => typeof coordinate === 'number' && Number.isFinite(coordinate),
                    ))
            ) {
                this.log.warn('Tractive returned an invalid tracker location response');
                return { success: false, error: 'Invalid tracker location response' };
            }

            if (
                this.reverseGeocoding &&
                response.success &&
                response.data &&
                Array.isArray(response.data.latlong) &&
                response.data.latlong.length >= 2
            ) {
                const latitude = response.data.latlong[0];
                const longitude = response.data.latlong[1];
                const cachedAddress = this.addressCache.get(trackerID);
                if (cachedAddress && cachedAddress.latitude === latitude && cachedAddress.longitude === longitude) {
                    response.data.address = cachedAddress.address;
                    return response;
                }
                try {
                    const addressResponse = await this.apiCall<unknown>(
                        'get',
                        '/platform/geo/address/location',
                        undefined,
                        {
                            params: {
                                latitude,
                                longitude,
                            },
                        },
                    );

                    if (addressResponse.success && TractiveAPI.isAddressResponse(addressResponse.data)) {
                        response.data.address = addressResponse.data;
                        this.addressCache.set(trackerID, {
                            latitude,
                            longitude,
                            address: addressResponse.data,
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
                error: `Error fetching tracker location: ${error instanceof Error ? error.message : String(error)}`,
            };
        }
    }

    /**
     *
     */
    async getTrackerHardware(trackerID: string): Promise<TractiveAPIResponse<TractiveTrackerHardware>> {
        if (!this.auth) {
            return { success: false, error: 'Not authenticated' };
        }
        return this.getRecord(`/device_hw_report/${encodeURIComponent(trackerID)}`, 'tracker hardware');
    }

    async setLiveTracking(trackerID: string, enabled: boolean): Promise<TractiveAPIResponse<unknown>> {
        return this.sendTrackerCommand(trackerID, 'live_tracking', enabled);
    }

    async setLed(trackerID: string, enabled: boolean): Promise<TractiveAPIResponse<unknown>> {
        return this.sendTrackerCommand(trackerID, 'led_control', enabled);
    }

    async setBuzzer(trackerID: string, enabled: boolean): Promise<TractiveAPIResponse<unknown>> {
        return this.sendTrackerCommand(trackerID, 'buzzer_control', enabled);
    }

    private async sendTrackerCommand(
        trackerID: string,
        command: 'live_tracking' | 'led_control' | 'buzzer_control',
        enabled: boolean,
    ): Promise<TractiveAPIResponse<unknown>> {
        return this.apiCall<unknown>(
            'get',
            `/tracker/${encodeURIComponent(trackerID)}/command/${command}/${enabled ? 'on' : 'off'}`,
        );
    }

    // Aggregations
    /**
     *
     */
    async updateAllData(): Promise<TractiveAPIResponse<boolean>> {
        return aggregateUpdateAllData(this);
    }

    /**
     *
     */
    async updateTrackersOnly(): Promise<TractiveAPIResponse<boolean>> {
        return aggregateUpdateTrackersOnly(this);
    }
}
