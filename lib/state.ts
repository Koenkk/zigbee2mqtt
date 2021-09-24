import logger from './util/logger';
import * as data from './util/data';
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
        this._load();

        // Save the state on every interval
        this.clearTimer();
        this.timer = setInterval(() => this.save(), saveInterval);
    }

    clearTimer(): void {
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
    }

    stop(): void {
        this.clearTimer();
        this.save();
    }

    _load(): void {
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

    save(): void {
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

    exists(ID: string | number): boolean {
        return this.state.hasOwnProperty(ID);
    }

    get(ID: string | number): KeyValue {
        return this.state[ID];
    }

    set(ID: string | number, update: KeyValue, reason: string=null): KeyValue {
        const fromState = this.state[ID] || {};
        const toState = objectAssignDeep({}, fromState, update);
        const result = {...toState};

        for (const property of Object.keys(toState)) {
            if (dontCacheProperties.find((p) => property.match(p))) {
                delete toState[property];
            }
        }

        this.state[ID] = toState;
        this.eventBus.emit('stateChange', {ID, from: fromState, to: toState, reason, update});
        return result;
    }

    removeKey(ID: string | number, path: string[]): void {
        if (this.exists(ID)) {
            let state = this.state[ID];
            for (let i = 0; i < path.length; i++) {
                const key = path[i];
                if (i === path.length - 1) {
                    delete state[key];
                } else {
                    if (state[key]) {
                        state = state[key];
                    } else {
                        break;
                    }
                }
            }
        }
    }

    remove(ID: string | number): void {
        if (this.exists(ID)) {
            delete this.state[ID];
        }
    }
}

module.exports = State;
