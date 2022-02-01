import * as settings from '../util/settings';
import logger from '../util/logger';
import debounce from 'debounce';
import Extension from './extension';
import stringify from 'json-stable-stringify-without-jsonify';
import bind from 'bind-decorator';
import utils from '../util/utils';

type DebounceFunction = (() => void) & { clear(): void; } & { flush(): void; };

export default class Receive extends Extension {
    private elapsed: {[s: string]: number} = {};
    private debouncers: {[s: string]: {payload: KeyValue, publish: DebounceFunction }} = {};

    async start(): Promise<void> {
        this.eventBus.onPublishEntityState(this, this.onPublishEntityState);
        this.eventBus.onDeviceMessage(this, this.onDeviceMessage);
    }

    @bind async onPublishEntityState(data: eventdata.PublishEntityState): Promise<void> {
        /**
         * Prevent that outdated properties are being published.
         * In case that e.g. the state is currently held back by a debounce and a new state is published
         * remove it from the to be send debounced message.
         */
        if (data.entity.isDevice() && this.debouncers[data.entity.ieeeAddr] &&
            data.stateChangeReason !== 'publishDebounce' && data.stateChangeReason !== 'lastSeenChanged') {
            for (const key of Object.keys(data.payload)) {
                delete this.debouncers[data.entity.ieeeAddr].payload[key];
            }
        }
    }

    publishDebounce(device: Device, payload: KeyValue, time: number, debounceIgnore: string[]): void {
        if (!this.debouncers[device.ieeeAddr]) {
            this.debouncers[device.ieeeAddr] = {
                payload: {},
                publish: debounce(() => {
                    this.publishEntityState(device, this.debouncers[device.ieeeAddr].payload, 'publishDebounce');
                    this.debouncers[device.ieeeAddr].payload = {};
                }, time * 1000),
            };
        }

        if (this.isPayloadConflicted(payload, this.debouncers[device.ieeeAddr].payload, debounceIgnore)) {
            // publish previous payload immediately
            this.debouncers[device.ieeeAddr].publish.flush();
        }

        // extend debounced payload with current
        this.debouncers[device.ieeeAddr].payload = {...this.debouncers[device.ieeeAddr].payload, ...payload};
        this.debouncers[device.ieeeAddr].publish();
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

    shouldProcess(data: eventdata.DeviceMessage): boolean {
        if (!data.device.definition) {
            if (data.device.zh.interviewing) {
                logger.debug(`Skipping message, definition is undefined and still interviewing`);
            } else {
                logger.warn(
                    `Received message from unsupported device with Zigbee model '${data.device.zh.modelID}' ` +
                    `and manufacturer name '${data.device.zh.manufacturerName}'`);
                // eslint-disable-next-line max-len
                logger.warn(`Please see: https://www.zigbee2mqtt.io/advanced/support-new-devices/01_support_new_devices.html`);
            }

            return false;
        }

        return true;
    }

    @bind async onDeviceMessage(data: eventdata.DeviceMessage): Promise<void> {
        /* istanbul ignore next */
        if (!data.device) return;

        if (!this.shouldProcess(data)) {
            utils.publishLastSeen({device: data.device, reason: 'messageEmitted'},
                settings.get(), true, this.publishEntityState);
            return;
        }

        const converters = data.device.definition.fromZigbee.filter((c) => {
            const type = Array.isArray(c.type) ? c.type.includes(data.type) : c.type === data.type;
            return c.cluster === data.cluster && type;
        });

        // Check if there is an available converter, genOta messages are not interesting.
        const ignoreClusters: (string | number)[] = ['genOta', 'genTime', 'genBasic', 'genPollCtrl'];
        if (converters.length == 0 && !ignoreClusters.includes(data.cluster)) {
            logger.debug(`No converter available for '${data.device.definition.model}' with ` +
                `cluster '${data.cluster}' and type '${data.type}' and data '${stringify(data.data)}'`);
            utils.publishLastSeen({device: data.device, reason: 'messageEmitted'},
                settings.get(), true, this.publishEntityState);
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
            if (data.device.options.debounce) {
                this.publishDebounce(data.device, payload, data.device.options.debounce,
                    data.device.options.debounce_ignore);
            } else {
                this.publishEntityState(data.device, payload);
            }
        };

        const meta = {device: data.device.zh, logger, state: this.state.get(data.device)};
        let payload: KeyValue = {};
        for (const converter of converters) {
            try {
                const converted = await converter.convert(
                    data.device.definition, data, publish, data.device.options, meta);
                if (converted) {
                    payload = {...payload, ...converted};
                }
            } catch (error) {
                // istanbul ignore next
                logger.error(`Exception while calling fromZigbee converter: ${error.message}}`);
            }
        }

        if (Object.keys(payload).length) {
            publish(payload);
        } else {
            utils.publishLastSeen({device: data.device, reason: 'messageEmitted'},
                settings.get(), true, this.publishEntityState);
        }
    }
}
