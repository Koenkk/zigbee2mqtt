const logger = require('./util/logger');
const data = require('./util/data');
const fs = require('fs');
const settings = require('./util/settings');
const objectAssignDeep = require('object-assign-deep');

const saveInterval = 1000 * 60 * 5; // 5 minutes

const dontCacheProperties = [
    'action', 'button', 'button_left', 'button_right', 'click', 'forgotten', 'keyerror',
    'step_size', 'transition_time', 'action_color_temperature', 'action_color',
    'action_group', 'group_list', 'group_capacity', 'no_occupancy_since',
];

class State {
    constructor() {
        this.state = {};
        this.file = data.joinPath('state.json');
        this.timer = null;

        this.handleSettingsChanged = this.handleSettingsChanged.bind(this);
    }

    start() {
        this._load();

        // Save the state on every interval
        this.clearTimer();
        this.timer = setInterval(() => this.save(), saveInterval);

        // Listen for on settings changed events.
        settings.addOnChangeHandler(this.handleSettingsChanged);

        this.checkLastSeen();
    }

    handleSettingsChanged() {
        this.checkLastSeen();
    }

    checkLastSeen() {
        if (settings.get().advanced.last_seen === 'disable') {
            Object.values(this.state).forEach((s) => {
                if (s.hasOwnProperty('last_seen')) {
                    delete s.last_seen;
                }
            });

            this.save();
        }
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
        logger.debug(`Saving state to file ${this.file}`);
        const json = JSON.stringify(this.state, null, 4);
        fs.writeFileSync(this.file, json, 'utf8');
    }

    exists(ieeeAddr) {
        return this.state.hasOwnProperty(ieeeAddr);
    }

    get(ieeeAddr) {
        return this.state[ieeeAddr];
    }

    set(ieeeAddr, state) {
        const s = objectAssignDeep.noMutate(state);
        dontCacheProperties.forEach((property) => {
            if (s.hasOwnProperty(property)) {
                delete s[property];
            }
        });

        this.state[ieeeAddr] = s;
    }

    remove(ieeeAddr) {
        if (this.exists(ieeeAddr)) {
            delete this.state[ieeeAddr];
        }
    }
}

module.exports = State;
