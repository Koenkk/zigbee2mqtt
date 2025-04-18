import {existsSync, readFileSync, writeFileSync} from "node:fs";

import objectAssignDeep from "object-assign-deep";

import data from "./util/data";
import logger from "./util/logger";
import * as settings from "./util/settings";
import utils from "./util/utils";

const SAVE_INTERVAL = 1000 * 60 * 5; // 5 minutes
const CACHE_IGNORE_PROPERTIES = [
    "action",
    "action_.*",
    "button",
    "button_left",
    "button_right",
    "forgotten",
    "keyerror",
    "step_size",
    "transition_time",
    "group_list",
    "group_capacity",
    "no_occupancy_since",
    "step_mode",
    "transition_time",
    "duration",
    "elapsed",
    "from_side",
    "to_side",
    "illuminance_lux", // removed in z2m 2.0.0
];

class State {
    private readonly state = new Map<string | number, KeyValue>();
    private readonly file = data.joinPath("state.json");
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
        this.timer = setInterval(() => this.save(), SAVE_INTERVAL);
    }

    stop(): void {
        // Remove any invalid states (ie when the device has left the network) when the system is stopped
        for (const [key] of this.state) {
            if (typeof key === "string" && key.startsWith("0x") && !this.zigbee.resolveEntity(key)) {
                // string key = ieeeAddr
                this.state.delete(key);
            }
        }

        clearTimeout(this.timer);
        this.save();
    }

    clear(): void {
        this.state.clear();
    }

    private load(): void {
        this.state.clear();

        if (existsSync(this.file)) {
            try {
                const stateObj = JSON.parse(readFileSync(this.file, "utf8")) as KeyValue;

                for (const key in stateObj) {
                    this.state.set(key.startsWith("0x") ? key : Number.parseInt(key, 10), stateObj[key]);
                }

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

            const json = JSON.stringify(Object.fromEntries(this.state), null, 4);

            try {
                writeFileSync(this.file, json, "utf8");
            } catch (error) {
                logger.error(`Failed to write state to '${this.file}' (${error})`);
            }
        } else {
            logger.debug("Not saving state");
        }
    }

    exists(entity: Device | Group): boolean {
        return this.state.has(entity.ID);
    }

    get(entity: Group | Device): KeyValue {
        return this.state.get(entity.ID) || {};
    }

    set(entity: Group | Device, update: KeyValue, reason?: string): KeyValue {
        const fromState = this.state.get(entity.ID) || {};
        const toState = objectAssignDeep({}, fromState, update);
        const newCache = {...toState};
        const entityDontCacheProperties = entity.options.filtered_cache || [];

        utils.filterProperties(CACHE_IGNORE_PROPERTIES.concat(entityDontCacheProperties), newCache);

        this.state.set(entity.ID, newCache);
        this.eventBus.emitStateChange({entity, from: fromState, to: toState, reason, update});
        return toState;
    }

    remove(id: string | number): boolean {
        return this.state.delete(id);
    }
}

export default State;
