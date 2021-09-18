import * as settings from '../util/settings';
import logger from '../util/logger';
import debounce from 'debounce';
import ExtensionTS from './extensionts';
// @ts-ignore
import stringify from 'json-stable-stringify-without-jsonify';
import bind from 'bind-decorator';

class Receive extends ExtensionTS {
    private elapsed: {[s: string]: number} = {};
    // eslint-disable-next-line
    private debouncers: {[s: string]: {payload: KeyValue, publish: any}} = {}; //TODO fix type

    async start(): Promise<void> {
        this.eventBus.onPublishEntityState(this, this.onPublishEntityState);
        this.eventBus.onDeviceMessage(this, this.onDeviceMessage);
    }

    @bind async onPublishEntityState(data: EventPublishEntityState): Promise<void> {
        /**
         * Prevent that outdated properties are being published.
         * In case that e.g. the state is currently held back by a debounce and a new state is published
         * remove it from the to be send debounced message.
         */
        if (data.ieeeAddr && this.debouncers[data.ieeeAddr] && data.stateChangeReason !== 'publishDebounce') {
            for (const key of Object.keys(data.payload)) {
                delete this.debouncers[data.ieeeAddr].payload[key];
            }
        }
    }

    publishDebounce(ieeeAddr: string, payload: KeyValue, time: number, debounceIgnore: string[]): void {
        if (!this.debouncers[ieeeAddr]) {
            this.debouncers[ieeeAddr] = {
                payload: {},
                publish: debounce(() => {
                    this.publishEntityState(ieeeAddr, this.debouncers[ieeeAddr].payload, 'publishDebounce');
                    this.debouncers[ieeeAddr].payload = {};
                }, time * 1000),
            };
        }

        if (this.isPayloadConflicted(payload, this.debouncers[ieeeAddr].payload, debounceIgnore)) {
            // publish previous payload immediately
            this.debouncers[ieeeAddr].publish.flush();
        }

        // extend debounced payload with current
        this.debouncers[ieeeAddr].payload = {...this.debouncers[ieeeAddr].payload, ...payload};
        this.debouncers[ieeeAddr].publish();
    }

    // if debounce_ignore are specified (Array of strings)
    // then all newPayload values with key present in debounce_ignore
    // should equal or be undefined in oldPayload
    // otherwise payload is conflicted
    isPayloadConflicted(newPayload: KeyValue, oldPayload: KeyValue, debounceIgnore: string[] | null): boolean {
        let result = false;
        Object.keys(oldPayload)
            .filter((key) => (debounceIgnore || []).includes(key))
            .forEach((key) => {
                if (typeof newPayload[key] !== 'undefined' && newPayload[key] !== oldPayload[key]) {
                    result = true;
                }
            });

        return result;
    }

    shouldProcess(data: EventDeviceMessage): boolean {
        if (!data.device.definition) {
            if (data.device.interviewing) {
                logger.debug(`Skipping message, definition is undefined and still interviewing`);
            } else {
                logger.warn(
                    `Received message from unsupported device with Zigbee model '${data.device.modelID}' ` +
                    `and manufacturer name '${data.device.manufacturerName}'`);
                logger.warn(`Please see: https://www.zigbee2mqtt.io/how_tos/how_to_support_new_devices.html.`);
            }

            return false;
        }

        return true;
    }

    @bind onDeviceMessage(data: EventDeviceMessage): void {
        if (!data.device) return;

        /**
         * Handling of re-transmitted Xiaomi messages.
         * https://github.com/Koenkk/zigbee2mqtt/issues/1238
         * https://github.com/Koenkk/zigbee2mqtt/issues/3592
         *
         * Some Xiaomi router devices re-transmit messages from Xiaomi end devices.
         * The network address of these message is set to the one of the Xiaomi router.
         * Therefore it looks like if the message came from the Xiaomi router, while in
         * fact it came from the end device.
         * Handling these message would result in false state updates.
         * The group ID attribute of these message defines the network address of the end device.
         */
        if (data.device.isXiaomiDevice() && data.device.isRouter() && data.groupID) {
            logger.debug('Handling re-transmitted Xiaomi message');
            data = {...data, device: this.zigbee.deviceByNetworkAddress(data.groupID)};
        }

        if (!this.shouldProcess(data)) return;

        const converters = data.device.definition.fromZigbee.filter((c) => {
            const type = Array.isArray(c.type) ? c.type.includes(data.type) : c.type === data.type;
            return c.cluster === data.cluster && type;
        });

        // Check if there is an available converter, genOta messages are not interesting.
        const ignoreClusters: (string | number)[] = ['genOta', 'genTime', 'genBasic'];
        if (converters.length == 0 && !ignoreClusters.includes(data.cluster)) {
            logger.debug(`No converter available for '${data.device.definition.model}' with ` +
                `cluster '${data.cluster}' and type '${data.type}' and data '${stringify(data.data)}'`);
            return;
        }

        // Convert this Zigbee message to a MQTT message.
        // Get payload for the message.
        // - If a payload is returned publish it to the MQTT broker
        // - If NO payload is returned do nothing. This is for non-standard behaviour
        //   for e.g. click switches where we need to count number of clicks and detect long presses.
        const publish = (payload: KeyValue): void => {
            if (settings.get().advanced.elapsed) {
                const now = Date.now();
                if (this.elapsed[data.device.ieeeAddr]) {
                    payload.elapsed = now - this.elapsed[data.device.ieeeAddr];
                }

                this.elapsed[data.device.ieeeAddr] = now;
            }

            // Check if we have to debounce
            if (data.device.settings.debounce) {
                this.publishDebounce(data.device.ieeeAddr, payload, data.device.settings.debounce,
                    data.device.settings.debounce_ignore);
            } else {
                this.publishEntityState(data.device.ieeeAddr, payload);
            }
        };

        const meta = {device: data.device.zhDevice, logger, state: this.state.get(data.device.ieeeAddr)};
        let payload = {};
        converters.forEach((converter) => {
            const converted = converter.convert(data.device.definition, data, publish, data.device.settings, meta);
            if (converted) {
                payload = {...payload, ...converted};
            }
        });

        if (Object.keys(payload).length) {
            publish(payload);
        }
    }
}

module.exports = Receive;
