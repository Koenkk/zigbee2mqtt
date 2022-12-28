import logger from './util/logger';
import data from './util/data';
import * as settings from './util/settings';
import utils from './util/utils';
import fs from 'fs';
import objectAssignDeep from 'object-assign-deep';

const saveInterval = 1000 * 60 * 5; // 5 minutes
const deleteInterval = 1000 * 15; // 15 seconds

const dontCacheProperties = [
    'action', 'action_.*', 'button', 'button_left', 'button_right', 'click', 'forgotten', 'keyerror',
    'step_size', 'transition_time', 'group_list', 'group_capacity', 'no_occupancy_since',
    'step_mode', 'transition_time', 'duration', 'elapsed', 'from_side', 'to_side',
];

class State {
    private state: {[s: string | number]: KeyValue} = {};
    private pendingDeletion: { [ieeeAddress: string]: number; /* Time to really delete this device */ } = { };
    private file = data.joinPath('state.json');
    private timer: NodeJS.Timer = null;
    private deleteTimer: NodeJS.Timer = null;
    private eventBus: EventBus;

    constructor(eventBus: EventBus) {
        this.eventBus = eventBus;
    }

    start(): void {
        this.load();

        // Save the state on every interval
        this.timer = setInterval(() => this.save(), saveInterval);

        // Check if we need to really removed cached states for devices that have left the network
        this.deleteTimer = setInterval(() => {
            const now = Date.now();
            Object.entries(this.pendingDeletion).forEach(([id, time]) => {
                logger.debug(`Pending delete state for ${id} is ${time >= now} ${new Date(this.pendingDeletion[id]).toISOString()}`);
                if (time < now) {
                    delete this.state[id];
                    delete this.pendingDeletion[id];
                }
            });
        }, deleteInterval);

        this.eventBus.onDeviceJoined(this, (data) => {
            if (this.pendingDeletion[data.device.ieeeAddr]) {
                logger.debug(`Pending delete state removed for ${data.device.ieeeAddr} (device joined)`);
                delete this.pendingDeletion[data.device.ieeeAddr];
            }
        });

        this.eventBus.onDeviceLeave(this, (data) => {
            const leaveAfterSeconds = settings.get().advanced.cache_state_persist_on_leave;
            if (leaveAfterSeconds === 0) {
                logger.debug(`Delete state immediately for ${data.ieeeAddr} (device left)`);
                delete this.state[data.ieeeAddr];
                delete this.pendingDeletion[data.ieeeAddr];
            } else {
                // Delay before leaving, in case the device rejoins the network after a glitch
                this.pendingDeletion[data.ieeeAddr] = Date.now() + leaveAfterSeconds * 1000;
                logger.debug(`Pending delete state for ${data.ieeeAddr} as ${new Date(this.pendingDeletion[data.ieeeAddr])} (device left)`);
            }
        });
    }

    stop(): void {
        // Force-delete any pendingDeletion states if the system is stopped
        clearTimeout(this.deleteTimer);
        Object.keys(this.pendingDeletion).forEach((pending) => delete this.state[pending]);
        this.pendingDeletion = {};

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
        const newCache = {...toState};
        const entityDontCacheProperties = entity.options.filtered_cache || [];

        utils.filterProperties(dontCacheProperties.concat(entityDontCacheProperties), newCache);

        this.state[entity.ID] = newCache;
        delete this.pendingDeletion[entity.ID]; // The device is apparantly active again

        this.eventBus.emitStateChange({entity, from: fromState, to: toState, reason, update});
        return toState;
    }

    remove(ID: string | number): void {
        delete this.state[ID];
    }
}

export default State;
