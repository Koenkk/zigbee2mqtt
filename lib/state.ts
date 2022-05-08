import logger from './util/logger';
import data from './util/data';
import * as settings from './util/settings';
import fs from 'fs';
import objectAssignDeep from 'object-assign-deep';

const saveInterval = 1000 * 60 * 5; // 5 minutes

const dontCacheProperties = [
    '^action$', '^action_.*$', '^button$', '^button_left$', '^button_right$', '^click$', '^forgotten$', '^keyerror$',
    '^step_size$', '^transition_time$', '^group_list$', '^group_capacity$', '^no_occupancy_since$',
    '^step_mode$', '^transition_time$', '^duration$', '^elapsed$', '^from_side$', '^to_side$',
];

class State {
    private state: {[s: string | number]: KeyValue} = {};
    private file = data.joinPath('state.json');
    private timer: NodeJS.Timer = null;
    private eventBus: EventBus;

    constructor(eventBus: EventBus) {
        this.eventBus = eventBus;
    }

    start(): void {
        this.load();

        // Save the state on every interval
        this.timer = setInterval(() => this.save(), saveInterval);
        this.eventBus.onDeviceLeave(this, (data) => delete this.state[data.ieeeAddr]);
    }

    stop(): void {
        this.eventBus.removeListeners(this);
        clearTimeout(this.timer);
        this.save();
    }

    private load(): void {
        if (fs.existsSync(this.file)) {
            try {
                this.state = JSON.parse(fs.readFileSync(this.file, 'utf8'));
                logger.debug(`Loaded state from file ${this.file}`);
            } catch (e) {
                logger.debug(`Failed to load state from file ${this.file} (corrupt file?)`);
            }
        } else {
            logger.debug(`Can't load state from file ${this.file} (doesn't exist)`);
        }
    }

    private save(): void {
        if (settings.get().advanced.cache_state_persistent) {
            logger.debug(`Saving state to file ${this.file}`);
            const json = JSON.stringify(this.state, null, 4);
            try {
                fs.writeFileSync(this.file, json, 'utf8');
            } catch (e) {
                logger.error(`Failed to write state to '${this.file}' (${e.message})`);
            }
        } else {
            logger.debug(`Not saving state`);
        }
    }

    exists(entity: Device | Group): boolean {
        return this.state.hasOwnProperty(entity.ID);
    }

    get(entity: Group | Device): KeyValue {
        return this.state[entity.ID] || {};
    }

    set(entity: Group | Device, update: KeyValue, reason: string=null): KeyValue {
        const fromState = this.state[entity.ID] || {};
        const toState = objectAssignDeep({}, fromState, update);
        const result = {...toState};

        for (const property of Object.keys(toState)) {
            if (dontCacheProperties.find((p) => property.match(p))) {
                delete toState[property];
            }
        }

        this.state[entity.ID] = toState;
        this.eventBus.emitStateChange({entity, from: fromState, to: toState, reason, update});
        return result;
    }

    remove(ID: string | number): void {
        delete this.state[ID];
    }
}

export default State;
