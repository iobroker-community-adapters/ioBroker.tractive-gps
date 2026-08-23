export interface TractiveAuth {
    access_token: string;
    expires_at: number;
    user_id: string;
}

export interface TractiveAddress {
    street: string;
    house_number: string;
    zip_code: string;
    city: string;
    country: string;
    full_address: string;
}

export type TractivePet = Record<string, unknown>;
export type TractiveTracker = Record<string, unknown>;

export interface TractiveTrackerLocation extends Record<string, unknown> {
    latlong?: [number, number];
    address?: TractiveAddress;
}

export type TractiveTrackerHardware = Record<string, unknown>;

export type TractiveAPIResponse<T> = { success: true; data: T } | { success: false; error: string; data?: undefined };
