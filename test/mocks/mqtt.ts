import type {IClientPublishOptions} from "mqtt";

import type {EventHandler} from "./utils";

export const events: Record<string, EventHandler> = {};

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
