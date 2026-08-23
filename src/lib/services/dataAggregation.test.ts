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
        expect(states.get('pets.pet-1.info.profilePictureUrl')).to.equal('https://graph.tractive.com/pet/image-1.jpg');
    });

    it('marks retained tracker devices as missing when the account no longer returns them', async () => {
        const setState = sinon.stub().resolves(undefined);
        const api: ITractiveApiEndpoints = {
            auth: null,
            log: { warn: sinon.stub() } as unknown as ioBroker.Logger,
            extendObjectAsync: sinon.stub().resolves(undefined) as ITractiveApiEndpoints['extendObjectAsync'],
            setState: setState as ITractiveApiEndpoints['setState'],
            getObjectAsync: sinon.stub().resolves(null),
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
        expect(getImage.callCount).to.equal(1);
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
        expect(getImage.callCount).to.equal(1);
        expect(getTracker.callCount).to.equal(1);
        expect(getTrackerHardware.callCount).to.equal(2);
        expect(getAllTrackers.callCount).to.equal(3);
        expect(getTrackerLocation.callCount).to.equal(3);
    });
});
