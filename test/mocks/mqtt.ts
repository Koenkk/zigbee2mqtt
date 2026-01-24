import type {IClientPublishOptions} from "mqtt";

import type {EventHandler} from "./utils";

// Wrapper for events that provides the necessary MQTT packet structure
const rawEvents: Record<string, EventHandler> = {};
export const events: Record<string, EventHandler> = new Proxy(rawEvents, {
    get(target, prop) {
        const handler = target[prop as string];
        if (prop === "message" && handler) {
            // Wrap message handler to provide MQTT packet structure
            // Default qos: 0 for backwards compatibility, but allow explicit undefined for testing fallback
            return (topic: string, message: string | Buffer, packet?: {qos?: number; _noQos?: boolean}) => {
                const mqttPacket = packet?._noQos ? {} : {qos: packet?.qos ?? 0};
                return handler(topic, typeof message === "string" ? Buffer.from(message) : message, mqttPacket);
            };
        }
        return handler;
    },
    set(target, prop, value) {
        target[prop as string] = value;
        return true;
    },
});

export const mockMQTTPublishAsync = vi.fn(async (_topic: string, _message: string, _opts?: IClientPublishOptions): Promise<void> => {});
export const mockMQTTEndAsync = vi.fn(async (): Promise<void> => {});
export const mockMQTTSubscribeAsync = vi.fn(async (_topicObject: string): Promise<void> => {});
export const mockMQTTUnsubscribeAsync = vi.fn(async (_topic: string): Promise<void> => {});

export const mockMQTTConnectAsync = vi.fn(() => ({
    reconnecting: false,
    disconnecting: false,
    disconnected: false,
    publishAsync: mockMQTTPublishAsync,
    endAsync: mockMQTTEndAsync,
    subscribeAsync: mockMQTTSubscribeAsync,
    unsubscribeAsync: mockMQTTUnsubscribeAsync,
    on: vi.fn(async (type, handler) => {
        if (type === "connect") {
            await handler();
        }

        events[type] = handler;
    }),
    stream: {setMaxListeners: vi.fn()},
    options: {
        protocolVersion: 5,
        protocol: "mqtt",
        host: "localhost",
        port: 1883,
    },
    queue: [],
}));

vi.mock("mqtt", () => ({
    connectAsync: mockMQTTConnectAsync,
}));
