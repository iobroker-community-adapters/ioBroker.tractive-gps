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

    it('writes selected values without expanding array items', async () => {
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

        await writeApiData(
            deps,
            { account: { email: 'local@example' }, subscriptions: { sub1: { services: ['CARE'] } } },
            { complete: true },
        );

        expect(states.get('account.email')).to.equal('local@example');
        expect(states.get('subscriptions.sub1.services')).to.equal('["CARE"]');
        expect(states.has('subscriptions.sub1.servicesItems.0')).to.equal(false);
        expect(String(states.get('info.currentApi'))).to.equal('{"complete":true}');
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
