import { expect } from 'chai';
import sinon from 'sinon';

import type { ITractiveApiEndpoints } from './dataAggregation';
import { updateAllData, updateTrackersOnly } from './dataAggregation';

describe('data aggregation migration', () => {
    it('uses the deeply nested pet detail name for the device and name state', async () => {
        const objects = new Map<string, ioBroker.PartialObject>();
        const states = new Map<string, ioBroker.StateValue>();
        const api: ITractiveApiEndpoints = {
            auth: null,
            log: { warn: sinon.stub() } as unknown as ioBroker.Logger,
            extendObjectAsync: sinon.stub().callsFake((id: string, object: ioBroker.PartialObject) => {
                objects.set(id, object);
                return Promise.resolve(undefined);
            }) as ITractiveApiEndpoints['extendObjectAsync'],
            setState: sinon.stub().callsFake((id: string, value: ioBroker.StateValue) => {
                states.set(id, value);
                return Promise.resolve(undefined);
            }) as ITractiveApiEndpoints['setState'],
            getObjectAsync: sinon.stub().resolves(null),
            getAccount: () => Promise.resolve({ success: true, data: { _id: 'account-1' } }),
            getSubscriptions: () => Promise.resolve({ success: true, data: [] }),
            getSubscription: () => Promise.resolve({ success: false, error: 'not called' }),
            getShares: () => Promise.resolve({ success: true, data: [] }),
            getProfilePictureUrl: id => `https://cdn.tractive.com/3/media/resource/${id}.jpg`,
            getPets: () => Promise.resolve({ success: true, data: [{ _id: 'pet-1' }] }),
            getPet: () =>
                Promise.resolve({
                    success: true,
                    data: {
                        _id: 'pet-1',
                        details: {
                            details: {
                                details: {
                                    name: 'Bärli',
                                    pet_type: 'CAT',
                                    weight: 4900,
                                    profile_picture_id: 'image-1',
                                },
                            },
                        },
                    },
                }),
            getImage: () =>
                Promise.resolve({
                    success: true,
                    data: { _id: 'image-1', details: { files: { original: { path: '/pet/image-1.jpg' } } } },
                }),
            getAllTrackers: () => Promise.resolve({ success: true, data: [] }),
            getTracker: () => Promise.resolve({ success: false, error: 'not called' }),
            getTrackerLocation: () => Promise.resolve({ success: false, error: 'not called' }),
            getTrackerHardware: () => Promise.resolve({ success: false, error: 'not called' }),
        };

        expect(await updateAllData(api)).to.deep.equal({ success: true, data: true });
        expect(objects.get('pets.pet-1')?.common?.name).to.equal('Bärli');
        expect(states.get('pets.pet-1.info.name')).to.equal('Bärli');
        expect(states.get('pets.pet-1.info.weight')).to.equal(4.9);
        expect(states.get('pets.pet-1.info.profilePictureUrl')).to.equal(
            'https://cdn.tractive.com/3/media/resource/image-1.jpg',
        );
    });

    it('marks retained tracker devices as missing when the account no longer returns them', async () => {
        const setState = sinon.stub().resolves(undefined);
        const api: ITractiveApiEndpoints = {
            auth: null,
            log: { warn: sinon.stub() } as unknown as ioBroker.Logger,
            extendObjectAsync: sinon.stub().resolves(undefined) as ITractiveApiEndpoints['extendObjectAsync'],
            setState: setState as ITractiveApiEndpoints['setState'],
            getObjectAsync: sinon.stub().resolves(null),
            getAccount: () => Promise.resolve({ success: true, data: {} }),
            getSubscriptions: () => Promise.resolve({ success: true, data: [] }),
            getSubscription: () => Promise.resolve({ success: false, error: 'not called' }),
            getShares: () => Promise.resolve({ success: true, data: [] }),
            getProfilePictureUrl: id => id,
            getDevicesAsync: () =>
                Promise.resolve([
                    {
                        _id: 'system.adapter.tractive-gps.0.trackers.retained-tracker',
                        type: 'device',
                        common: { name: 'Retained tracker' },
                        native: {},
                    },
                ]),
            getPets: () => Promise.resolve({ success: true, data: [] }),
            getPet: () => Promise.resolve({ success: false, error: 'not called' }),
            getImage: () => Promise.resolve({ success: false, error: 'not called' }),
            getAllTrackers: () => Promise.resolve({ success: true, data: [] }),
            getTracker: () => Promise.resolve({ success: false, error: 'not called' }),
            getTrackerLocation: () => Promise.resolve({ success: false, error: 'not called' }),
            getTrackerHardware: () => Promise.resolve({ success: false, error: 'not called' }),
        };

        const result = await updateAllData(api);

        expect(result).to.deep.equal({ success: true, data: true });
        expect(setState.calledWithExactly('trackers.retained-tracker.health.missing', true, true)).to.equal(true);
    });

    it('writes sensor, home status, and distance from the ioBroker system position', async () => {
        const states = new Map<string, ioBroker.StateValue>();
        const api: ITractiveApiEndpoints = {
            auth: { user_id: 'user-1', expires_at: 1_900_000_000 },
            log: { warn: sinon.stub() } as unknown as ioBroker.Logger,
            extendObjectAsync: sinon.stub().resolves(undefined) as ITractiveApiEndpoints['extendObjectAsync'],
            setState: sinon.stub().callsFake((id: string, value: ioBroker.StateValue) => {
                states.set(id, value);
                return Promise.resolve(undefined);
            }) as ITractiveApiEndpoints['setState'],
            getObjectAsync: sinon.stub().resolves(null),
            getForeignObjectAsync: () =>
                Promise.resolve({
                    _id: 'system.config',
                    type: 'config',
                    common: { name: 'System configuration', latitude: 48.2, longitude: 13.4 },
                    native: {},
                } as ioBroker.Object),
            getAccount: () => Promise.resolve({ success: true, data: { _id: 'user-1', email: 'local@example' } }),
            getSubscriptions: () => Promise.resolve({ success: true, data: [{ _id: 'sub-1' }] }),
            getSubscription: () => Promise.resolve({ success: true, data: { _id: 'sub-1', plan: 'premium' } }),
            getShares: () => Promise.resolve({ success: true, data: [{ _id: 'share-1' }] }),
            getProfilePictureUrl: id => id,
            getPets: () => Promise.resolve({ success: true, data: [] }),
            getPet: () => Promise.resolve({ success: false, error: 'not called' }),
            getImage: () => Promise.resolve({ success: false, error: 'not called' }),
            getAllTrackers: () => Promise.resolve({ success: true, data: [{ _id: 'tracker-1' }] }),
            getTracker: () => Promise.resolve({ success: true, data: { _id: 'tracker-1' } }),
            getTrackerLocation: () =>
                Promise.resolve({
                    success: true,
                    data: { latlong: [48.21, 13.4], sensor_used: 'KNOWN_WIFI', time: 1_787_500_000 },
                }),
            getTrackerHardware: () => Promise.resolve({ success: true, data: {} }),
        };

        expect((await updateAllData(api)).success).to.equal(true);
        expect(states.get('trackers.tracker-1.status.sensorUsed')).to.equal('KNOWN_WIFI');
        expect(states.get('trackers.tracker-1.status.home')).to.equal(true);
        expect(states.get('trackers.tracker-1.location.distance')).to.be.closeTo(1112, 2);
        expect(states.get('tracker-1.device_pos_report.sensor_used')).to.equal('KNOWN_WIFI');
        expect(states.get('api.data.account.email')).to.equal('local@example');
        expect(states.get('api.data.subscriptions.details.sub-1.plan')).to.equal('premium');
        expect(states.get('api.data.sharesItems.share-1._id')).to.equal('share-1');
        expect(String(states.get('info.currentApi'))).to.contain('local@example');
        expect(String(states.get('info.currentApi'))).not.to.contain('access_token');
    });

    it('does not refetch static pet, image, tracker detail, or hardware data during frequent polls', async () => {
        const getPets = sinon.stub().resolves({ success: true, data: [{ _id: 'pet-1' }] });
        const getPet = sinon.stub().resolves({
            success: true,
            data: {
                _id: 'pet-1',
                details: { name: 'Bärli', device_id: 'tracker-1', profile_picture_id: 'image-1' },
            },
        });
        const getImage = sinon.stub().resolves({ success: true, data: {} });
        const getAllTrackers = sinon.stub().resolves({ success: true, data: [{ _id: 'tracker-1', name: 'Tracker' }] });
        const getTracker = sinon.stub().resolves({
            success: true,
            data: { _id: 'tracker-1', name: 'Tracker', capabilities: ['LT'] },
        });
        const getTrackerLocation = sinon.stub().resolves({
            success: true,
            data: { latlong: [48.1, 13.4], time: 1_787_500_000 },
        });
        const getTrackerHardware = sinon.stub().resolves({
            success: true,
            data: { battery_level: 95, time: 1_787_500_000 },
        });
        const api: ITractiveApiEndpoints = {
            auth: null,
            log: { warn: sinon.stub() } as unknown as ioBroker.Logger,
            extendObjectAsync: sinon.stub().resolves(undefined) as ITractiveApiEndpoints['extendObjectAsync'],
            setState: sinon.stub().resolves(undefined) as ITractiveApiEndpoints['setState'],
            getObjectAsync: sinon.stub().resolves(null),
            getAccount: () => Promise.resolve({ success: true, data: {} }),
            getSubscriptions: () => Promise.resolve({ success: true, data: [] }),
            getSubscription: () => Promise.resolve({ success: false, error: 'not called' }),
            getShares: () => Promise.resolve({ success: true, data: [] }),
            getProfilePictureUrl: id => id,
            getPets,
            getPet,
            getImage,
            getAllTrackers,
            getTracker,
            getTrackerLocation,
            getTrackerHardware,
        };

        expect((await updateAllData(api)).success).to.equal(true);
        expect((await updateTrackersOnly(api)).success).to.equal(true);

        expect(getPets.callCount).to.equal(1);
        expect(getPet.callCount).to.equal(1);
        expect(getImage.callCount).to.equal(0);
        expect(getTracker.callCount).to.equal(1);
        expect(getTrackerHardware.callCount).to.equal(1);
        expect(getAllTrackers.callCount).to.equal(2);
        expect(getTrackerLocation.callCount).to.equal(2);

        const afterHardwareInterval = Date.now() + 15 * 60 * 1000;
        const now = sinon.stub(Date, 'now').returns(afterHardwareInterval);
        try {
            expect((await updateTrackersOnly(api)).success).to.equal(true);
        } finally {
            now.restore();
        }

        expect(getPets.callCount).to.equal(1);
        expect(getPet.callCount).to.equal(1);
        expect(getImage.callCount).to.equal(0);
        expect(getTracker.callCount).to.equal(1);
        expect(getTrackerHardware.callCount).to.equal(2);
        expect(getAllTrackers.callCount).to.equal(3);
        expect(getTrackerLocation.callCount).to.equal(3);
    });
});
