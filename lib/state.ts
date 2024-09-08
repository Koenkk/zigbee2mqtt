import fs from 'fs';

import objectAssignDeep from 'object-assign-deep';

import data from './util/data';
import logger from './util/logger';
import * as settings from './util/settings';
import utils from './util/utils';

const saveInterval = 1000 * 60 * 5; // 5 minutes

const dontCacheProperties = [
    'action',
    'action_.*',
    'button',
    'button_left',
    'button_right',
    'click',
    'forgotten',
    'keyerror',
    'step_size',
    'transition_time',
    'group_list',
    'group_capacity',
    'no_occupancy_since',
    'step_mode',
    'transition_time',
    'duration',
    'elapsed',
    'from_side',
    'to_side',
];

class State {
    private state: {[s: string | number]: KeyValue} = {};
    private file = data.joinPath('state.json');
    private timer?: NodeJS.Timeout;

    constructor(
        private readonly eventBus: EventBus,
        private readonly zigbee: Zigbee,
    ) {
        this.eventBus = eventBus;
        this.zigbee = zigbee;
    }

    start(): void {
        this.load();

        // Save the state on every interval
        this.timer = setInterval(() => this.save(), saveInterval);
    }

    stop(): void {
        // Remove any invalid states (ie when the device has left the network) when the system is stopped
        Object.keys(this.state)
            .filter((k) => typeof k === 'string' && !this.zigbee.resolveEntity(k)) // string key = ieeeAddr
            .forEach((k) => delete this.state[k]);

        clearTimeout(this.timer);
        this.save();
    }

    private load(): void {
        if (fs.existsSync(this.file)) {
            try {
                this.state = JSON.parse(fs.readFileSync(this.file, 'utf8'));
                logger.debug(`Loaded state from file ${this.file}`);
            } catch (error) {
                logger.debug(`Failed to load state from file ${this.file} (corrupt file?) (${(error as Error).message})`);
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
            } catch (error) {
                logger.error(`Failed to write state to '${this.file}' (${error})`);
            }
        } else {
            logger.debug(`Not saving state`);
        }
    }

    exists(entity: Device | Group): boolean {
        return this.state[entity.ID] !== undefined;
    }

    get(entity: Group | Device): KeyValue {
        return this.state[entity.ID] || {};
    }

    set(entity: Group | Device, update: KeyValue, reason?: string): KeyValue {
        const fromState = this.state[entity.ID] || {};
        const toState = objectAssignDeep({}, fromState, update);
        const newCache = {...toState};
        const entityDontCacheProperties = entity.options.filtered_cache || [];

        utils.filterProperties(dontCacheProperties.concat(entityDontCacheProperties), newCache);

        this.state[entity.ID] = newCache;
        this.eventBus.emitStateChange({entity, from: fromState, to: toState, reason, update});
        return toState;
    }

    remove(ID: string | number): void {
        delete this.state[ID];
    }
}

export default State;
