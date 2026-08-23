import type { AxiosRequestConfig, AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import axios, { AxiosError, AxiosHeaders } from 'axios';
import { expect } from 'chai';
import sinon from 'sinon';

import { TractiveAPI } from './tractive-api';

type TractiveAPIConstructor = ConstructorParameters<typeof TractiveAPI>;

function createLogger(): ioBroker.Logger {
    return {
        debug: sinon.stub(),
        error: sinon.stub(),
        info: sinon.stub(),
        level: 'info',
        silly: sinon.stub(),
        warn: sinon.stub(),
    } as unknown as ioBroker.Logger;
}

function response<T>(config: InternalAxiosRequestConfig, data: T): AxiosResponse<T> {
    return {
        config,
        data,
        headers: {},
        status: 200,
        statusText: 'OK',
    } as AxiosResponse<T>;
}

function createClient(
    adapter: NonNullable<AxiosRequestConfig['adapter']>,
    options: { sleep?: (milliseconds: number) => Promise<void>; reverseGeocoding?: boolean } = {},
): TractiveAPI {
    const httpClient = axios.create({ adapter });
    const getObject = (() => Promise.resolve(null)) as TractiveAPIConstructor[1];
    const setState = (() => Promise.resolve(undefined)) as unknown as TractiveAPIConstructor[2];
    const extendObject = (() => Promise.resolve(undefined)) as unknown as TractiveAPIConstructor[3];

    return new TractiveAPI(createLogger(), getObject, setState, extendObject, {
        httpClient,
        random: () => 0,
        requestIntervalMs: 0,
        retryDelaysMs: [0],
        sleep: options.sleep ?? (() => Promise.resolve()),
        reverseGeocoding: options.reverseGeocoding,
    });
}

function httpError(
    config: InternalAxiosRequestConfig,
    status: number,
    headers: Record<string, string> = {},
): AxiosError {
    const axiosResponse = response(config, {});
    axiosResponse.status = status;
    axiosResponse.statusText = String(status);
    axiosResponse.headers = new AxiosHeaders(headers);
    return new AxiosError(`HTTP ${status}`, 'ERR_BAD_RESPONSE', config, undefined, axiosResponse);
}

describe('TractiveAPI authentication', () => {
    it('sends credentials in the JSON body and keeps tokens in memory', async () => {
        const requests: AxiosRequestConfig[] = [];
        const client = createClient(config => {
            requests.push(config);
            if (config.url === '/auth/token') {
                return Promise.resolve(
                    response(config, {
                        access_token: 'test-token',
                        expires_at: Math.floor(Date.now() / 1000) + 3600,
                        user_id: 'test-user',
                    }),
                );
            }
            if (config.url === '/user/test-user/trackers') {
                return Promise.resolve(response(config, []));
            }
            return Promise.reject(new Error('Unexpected test request'));
        });

        expect(await client.initialize('user@example.invalid', 'test-password')).to.equal(true);
        expect((await client.getAllTrackers()).success).to.equal(true);

        expect(requests[0].url).to.equal('/auth/token');
        expect(requests[0].url).not.to.contain('user@example.invalid');
        expect(JSON.parse(String(requests[0].data))).to.deep.equal({
            grant_type: 'tractive',
            platform_email: 'user@example.invalid',
            platform_token: 'test-password',
        });
        expect(requests[1].headers?.Authorization).to.equal('Bearer test-token');
        expect(requests[1].headers?.['X-Tractive-User']).to.equal('test-user');
    });

    it('shares one refresh between concurrent requests', async () => {
        let authRequests = 0;
        const client = createClient(config => {
            if (config.url === '/auth/token') {
                authRequests += 1;
                return Promise.resolve(
                    response(config, {
                        access_token: `test-token-${authRequests}`,
                        expires_at: Math.floor(Date.now() / 1000) + 3600,
                        user_id: 'test-user',
                    }),
                );
            }
            if (config.url === '/user/test-user/trackers') {
                return Promise.resolve(response(config, []));
            }
            return Promise.reject(new Error('Unexpected test request'));
        });

        expect(await client.initialize('user@example.invalid', 'test-password')).to.equal(true);
        if (!client.auth) {
            throw new Error('Test setup failed to authenticate');
        }
        client.auth.expires_at = 0;

        const results = await Promise.all([client.getAllTrackers(), client.getAllTrackers()]);

        expect(results.every(result => result.success)).to.equal(true);
        expect(authRequests).to.equal(2);
    });

    it('refreshes once and replays a request after HTTP 401', async () => {
        let authRequests = 0;
        let trackerRequests = 0;
        const client = createClient(config => {
            if (config.url === '/auth/token') {
                authRequests += 1;
                return Promise.resolve(
                    response(config, {
                        access_token: `test-token-${authRequests}`,
                        expires_at: Math.floor(Date.now() / 1000) + 3600,
                        user_id: 'test-user',
                    }),
                );
            }
            if (config.url === '/user/test-user/trackers') {
                trackerRequests += 1;
                if (trackerRequests === 1) {
                    return Promise.reject(httpError(config, 401));
                }
                return Promise.resolve(response(config, []));
            }
            return Promise.reject(new Error('Unexpected test request'));
        });

        expect(await client.initialize('user@example.invalid', 'test-password')).to.equal(true);
        expect((await client.getAllTrackers()).success).to.equal(true);
        expect(authRequests).to.equal(2);
        expect(trackerRequests).to.equal(2);
    });

    it('honors Retry-After without exposing the request URL', async () => {
        const waits: number[] = [];
        let trackerRequests = 0;
        const client = createClient(
            config => {
                if (config.url === '/auth/token') {
                    return Promise.resolve(
                        response(config, {
                            access_token: 'test-token',
                            expires_at: Math.floor(Date.now() / 1000) + 3600,
                            user_id: 'test-user',
                        }),
                    );
                }
                if (config.url === '/user/test-user/trackers') {
                    trackerRequests += 1;
                    if (trackerRequests === 1) {
                        return Promise.reject(httpError(config, 429, { 'retry-after': '2' }));
                    }
                    return Promise.resolve(response(config, []));
                }
                return Promise.reject(new Error('Unexpected test request'));
            },
            {
                sleep: milliseconds => {
                    waits.push(milliseconds);
                    return Promise.resolve();
                },
            },
        );

        expect(await client.initialize('user@example.invalid', 'test-password')).to.equal(true);
        expect((await client.getAllTrackers()).success).to.equal(true);
        expect(waits[0]).to.equal(2000);
        expect(trackerRequests).to.equal(2);
    });

    it('reuses the resolved address while tracker coordinates are unchanged', async () => {
        let positionRequests = 0;
        let addressRequests = 0;
        const client = createClient(
            config => {
                if (config.url === '/auth/token') {
                    return Promise.resolve(
                        response(config, {
                            access_token: 'test-token',
                            expires_at: Math.floor(Date.now() / 1000) + 3600,
                            user_id: 'test-user',
                        }),
                    );
                }
                if (config.url === '/device_pos_report/tracker-1') {
                    positionRequests += 1;
                    return Promise.resolve(response(config, { latlong: [48.1, 13.4] }));
                }
                if (config.url === '/platform/geo/address/location') {
                    addressRequests += 1;
                    return Promise.resolve(
                        response(config, {
                            street: 'Street',
                            house_number: '1',
                            zip_code: '1234',
                            city: 'City',
                            country: 'AT',
                            full_address: 'Street 1, 1234 City',
                        }),
                    );
                }
                return Promise.reject(new Error('Unexpected test request'));
            },
            { reverseGeocoding: true },
        );

        expect(await client.initialize('user@example.invalid', 'test-password')).to.equal(true);
        expect((await client.getTrackerLocation('tracker-1')).success).to.equal(true);
        expect((await client.getTrackerLocation('tracker-1')).success).to.equal(true);
        expect(positionRequests).to.equal(2);
        expect(addressRequests).to.equal(1);
    });

    it('uses the documented GET command endpoints with encoded tracker IDs', async () => {
        const requests: AxiosRequestConfig[] = [];
        const client = createClient(config => {
            requests.push(config);
            if (config.url === '/auth/token') {
                return Promise.resolve(
                    response(config, {
                        access_token: 'test-token',
                        expires_at: Math.floor(Date.now() / 1000) + 3600,
                        user_id: 'test-user',
                    }),
                );
            }
            return Promise.resolve(response(config, {}));
        });

        expect(await client.initialize('user@example.invalid', 'test-password')).to.equal(true);
        await client.setLiveTracking('tracker/id', true);
        await client.setLed('tracker/id', false);
        await client.setBuzzer('tracker/id', true);

        expect(requests.slice(1).map(request => [request.method, request.url])).to.deep.equal([
            ['get', '/tracker/tracker%2Fid/command/live_tracking/on'],
            ['get', '/tracker/tracker%2Fid/command/led_control/off'],
            ['get', '/tracker/tracker%2Fid/command/buzzer_control/on'],
        ]);
    });

    it('retrieves complete pet details from the trackable-object endpoint', async () => {
        const requests: AxiosRequestConfig[] = [];
        const client = createClient(config => {
            requests.push(config);
            if (config.url === '/auth/token') {
                return Promise.resolve(
                    response(config, {
                        access_token: 'test-token',
                        expires_at: Math.floor(Date.now() / 1000) + 3600,
                        user_id: 'test-user',
                    }),
                );
            }
            return Promise.resolve(response(config, { _id: 'pet/id', details: { name: 'Bärli' } }));
        });

        expect(await client.initialize('user@example.invalid', 'test-password')).to.equal(true);
        expect((await client.getPet('pet/id')).success).to.equal(true);
        expect(requests[1].url).to.equal('/trackable_object/pet%2Fid');
    });

    it('resolves pet image references through the v3 bulk endpoint', async () => {
        const requests: AxiosRequestConfig[] = [];
        const client = createClient(config => {
            requests.push(config);
            if (config.url === '/auth/token') {
                return Promise.resolve(
                    response(config, {
                        access_token: 'test-token',
                        expires_at: Math.floor(Date.now() / 1000) + 3600,
                        user_id: 'test-user',
                    }),
                );
            }
            return Promise.resolve(
                response(config, [{ _id: 'image-1', _type: 'image', url: 'https://example.invalid/pet.jpg' }]),
            );
        });

        expect(await client.initialize('user@example.invalid', 'test-password')).to.equal(true);
        const result = await client.getImage('image-1');
        expect(result.success && result.data.url).to.equal('https://example.invalid/pet.jpg');
        expect(requests[1].url).to.equal('https://graph.tractive.com/3/bulk');
        expect(JSON.parse(String(requests[1].data))).to.deep.equal([{ _id: 'image-1', _type: 'image' }]);
    });

    it('rejects malformed endpoint data at the API boundary', async () => {
        const client = createClient(config => {
            if (config.url === '/auth/token') {
                return Promise.resolve(
                    response(config, {
                        access_token: 'test-token',
                        expires_at: Math.floor(Date.now() / 1000) + 3600,
                        user_id: 'test-user',
                    }),
                );
            }
            return Promise.resolve(response(config, ['not-an-object']));
        });

        expect(await client.initialize('user@example.invalid', 'test-password')).to.equal(true);
        expect(await client.getAllTrackers()).to.deep.equal({
            success: false,
            error: 'Invalid tracker list response',
        });
    });
});
