import { expect } from 'chai';
import sinon from 'sinon';

import type { StateDeps, TrackerStateModel } from './stateHelpers';
import { writeApiData, writeTrackerStates } from './stateHelpers';

function tracker(capabilities: readonly string[]): TrackerStateModel {
    return {
        id: 'tracker-1',
        name: 'Tracker',
        capabilities,
        stale: false,
    };
}

describe('tracker state model', () => {
    it('creates command states only for reported device capabilities', async () => {
        const objects = new Map<string, ioBroker.PartialObject>();
        const deps: StateDeps = {
            extendObjectAsync: sinon.stub().callsFake((id: string, object: ioBroker.PartialObject) => {
                objects.set(id, object);
                return Promise.resolve(undefined);
            }) as StateDeps['extendObjectAsync'],
            setState: sinon.stub().resolves(undefined) as StateDeps['setState'],
        };

        await writeTrackerStates(deps, tracker(['LT', 'BUZZER']));

        expect(objects.has('trackers.tracker-1.commands.liveTracking')).to.equal(true);
        expect(objects.has('trackers.tracker-1.commands.buzzer')).to.equal(true);
        expect(objects.has('trackers.tracker-1.commands.led')).to.equal(false);
        const common = objects.get('trackers.tracker-1.commands.liveTracking')?.common as
            ioBroker.StateCommon | undefined;
        expect(common?.write).to.equal(true);
    });

    it('mirrors complete API values locally, including arrays and personal account fields', async () => {
        const states = new Map<string, ioBroker.StateValue>();
        const objects = new Map<string, ioBroker.PartialObject>();
        const deps: StateDeps = {
            extendObjectAsync: sinon.stub().callsFake((id: string, object: ioBroker.PartialObject) => {
                objects.set(id, object);
                return Promise.resolve(undefined);
            }) as StateDeps['extendObjectAsync'],
            setState: sinon.stub().callsFake((id: string, value: ioBroker.StateValue) => {
                states.set(id, value);
                return Promise.resolve(undefined);
            }) as StateDeps['setState'],
        };

        await writeApiData(deps, {
            pets: { pet1: { details: { name: 'Bärli', breed_ids: ['1G91'] } } },
            access_token: 'secret',
            user_id: 'private',
        });

        expect(states.get('pets.pet1.details.name')).to.equal('Bärli');
        expect(states.get('pets.pet1.details.breed_ids')).to.equal('["1G91"]');
        expect(states.get('pets.pet1.details.breed_idsItems.0')).to.equal('1G91');
        expect(states.get('access_token')).to.equal('secret');
        expect(states.get('user_id')).to.equal('private');
        expect(String(states.get('info.currentApi'))).to.contain('secret');
        expect(String(states.get('info.currentApi'))).to.contain('private');
    });

    it('does not recreate the removed legacy tracker hierarchy', async () => {
        const written = new Map<string, ioBroker.StateValue>();
        const existing = new Set(['tracker-1.device_hw_report.battery_level']);
        const deps: StateDeps = {
            extendObjectAsync: sinon.stub().resolves(undefined) as StateDeps['extendObjectAsync'],
            getObjectAsync: id =>
                Promise.resolve(
                    existing.has(id) ? ({ type: 'state', common: {}, native: {} } as ioBroker.StateObject) : null,
                ),
            setState: sinon.stub().callsFake((id: string, value: ioBroker.StateValue) => {
                written.set(id, value);
                return Promise.resolve(undefined);
            }) as StateDeps['setState'],
        };

        await writeTrackerStates(deps, { ...tracker([]), batteryLevel: 42 });

        expect(written.has('tracker-1.device_hw_report.battery_level')).to.equal(false);
        expect(written.has('tracker-1.device_pos_report.latitude')).to.equal(false);
    });
});
