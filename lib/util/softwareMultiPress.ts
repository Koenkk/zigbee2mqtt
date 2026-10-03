import Ajv from "ajv";
import {Enum, type Expose} from "zigbee-herdsman-converters";
import type {SoftwareMultiPressOptions} from "../types/api";
import logger from "./logger";
import schema from "./settings.schema.json";

const names = ["single_press", "double_press", "triple_press"];
const actions = (name: string): string[] => names.map((suffix) => `software_${name}_${suffix}`);
const validConfig = new Ajv().compile<SoftwareMultiPressOptions>(schema.definitions.device.properties.software_multi_press);

export function softwareMultiPressButtons(exposes: Expose[], config: SoftwareMultiPressOptions | undefined): SoftwareMultiPressOptions["buttons"] {
    if (!config?.enabled || !validConfig(config)) return [];
    const values = exposes.flatMap((expose) => (expose instanceof Enum && expose.property === "action" ? expose.values : []));
    // Prefer existing multi-click implementations for the entire device.
    if (values.some((value) => typeof value === "string" && /(^|_)(double|triple|quadruple|quintuple)(_|$)/.test(value))) return [];
    if (new Set(config.buttons.map((button) => button.name)).size !== config.buttons.length) return [];
    return config.buttons.filter((button) => {
        const events = [button.click, ...(button.press ? [button.press] : []), ...(button.cancel ?? [])];
        return (
            new Set(events).size === events.length &&
            events.every((event) => values.includes(event)) &&
            !actions(button.name).some((action) => values.includes(action))
        );
    });
}

export function softwareMultiPressActions(exposes: Expose[], config: SoftwareMultiPressOptions | undefined): string[] {
    return softwareMultiPressButtons(exposes, config).flatMap((button) => actions(button.name));
}

type Source = Pick<Device, "ieeeAddr" | "softwareMultiPressOptions" | "nativeExposes">;
type Queue = {
    device: Source;
    button: string;
    count: number;
    pressed: boolean;
    lastClick: number;
    publish: (device: Source, payload: KeyValue) => Promise<void>;
    timer?: ReturnType<typeof setTimeout>;
};

export default class SoftwareMultiPress {
    private queues = new Map<string, Queue>();

    clear(ieeeAddr?: string): void {
        for (const [key, queue] of this.queues) {
            if (!ieeeAddr || queue.device.ieeeAddr === ieeeAddr) {
                clearTimeout(queue.timer);
                this.queues.delete(key);
            }
        }
    }

    process(device: Source, endpoint: number, action: string, publish: Queue["publish"]): void {
        const config = device.softwareMultiPressOptions;
        const buttons = softwareMultiPressButtons(device.nativeExposes(), config);
        if (!buttons.length) {
            this.clear(device.ieeeAddr);
            return;
        }
        const timeout = config?.timeout ?? 300;
        for (const button of buttons) {
            if (button.endpoint !== undefined && button.endpoint !== endpoint) continue;
            if (action !== button.click && action !== button.press && !button.cancel?.includes(action)) continue;
            const key = `${device.ieeeAddr}/${endpoint}/${button.name}`;
            let queue = this.queues.get(key);
            if (!queue) {
                queue = {device, button: button.name, count: 0, pressed: false, lastClick: 0, publish};
                this.queues.set(key, queue);
            }
            queue.publish = publish;
            if (button.cancel?.includes(action)) {
                void this.emit(queue);
                queue.pressed = false;
            } else if (action === button.press) {
                if (queue.count && Date.now() - queue.lastClick >= timeout) void this.emit(queue);
                clearTimeout(queue.timer);
                queue.pressed = true;
            } else if (!button.press || queue.pressed) {
                if (!button.press && queue.count && Date.now() - queue.lastClick >= timeout) void this.emit(queue);
                clearTimeout(queue.timer);
                queue.pressed = false;
                queue.count++;
                queue.lastClick = Date.now();
                queue.timer = setTimeout(() => void this.emit(queue), timeout);
            }
        }
    }

    private async emit(queue: Queue): Promise<void> {
        clearTimeout(queue.timer);
        const count = queue.count;
        queue.count = 0;
        if (!count) return;
        try {
            await queue.publish(queue.device, {action: actions(queue.button)[Math.min(count, 3) - 1]});
        } catch (error) {
            logger.error(`Failed to publish software multi-press: ${error}`);
        }
    }
}
