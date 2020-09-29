const logger = require('./util/logger');
const data = require('./util/data');
const settings = require('./util/settings');
const fs = require('fs');
const objectAssignDeep = require('object-assign-deep');
const stringify = require('json-stable-stringify');

const saveInterval = 1000 * 60 * 5; // 5 minutes

const dontCacheProperties = [
    'action', 'action_.*', 'button', 'button_left', 'button_right', 'click', 'forgotten', 'keyerror',
    'step_size', 'transition_time', 'group_list', 'group_capacity', 'no_occupancy_since',
    'step_mode', 'transition_time', 'duration', 'elapsed', 'from_side', 'to_side',
];

class State {
    constructor(eventBus) {
        this.state = {};
        this.file = data.joinPath('state.json');
        this.timer = null;
        this.eventBus = eventBus;
    }

    start() {
        this._load();

        // Save the state on every interval
        this.clearTimer();
        this.timer = setInterval(() => this.save(), saveInterval);
    }

    clearTimer() {
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
    }

    stop() {
        this.clearTimer();
        this.save();
    }

    _load() {
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

    save() {
        if (settings.get().advanced.cache_state_persistent) {
            logger.debug(`Saving state to file ${this.file}`);
            const json = stringify(this.state, null, 4);
            fs.writeFileSync(this.file, json, 'utf8');
        } else {
            logger.debug(`Not saving state`);
        }
    }

    exists(ID) {
        return this.state.hasOwnProperty(ID);
    }

    get(ID) {
        return this.state[ID];
    }

    set(ID, state, reason=null) {
        const toState = objectAssignDeep.noMutate(state);

        for (const property of Object.keys(toState)) {
            if (dontCacheProperties.find((p) => property.match(p))) {
                delete toState[property];
            }
        }

        const fromState = this.state[ID];

        this.state[ID] = toState;

        this.eventBus.emit('stateChange', {ID, from: fromState, to: toState, reason});
    }

    removeKey(ID, path) {
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

    remove(ID) {
        if (this.exists(ID)) {
            delete this.state[ID];
        }
    }
}

module.exports = State;
