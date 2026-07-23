import type {IClientPublishOptions} from "mqtt";
import {vi} from "vitest";
import type {EventHandler} from "./utils";

export const events: Record<string, EventHandler> = {};

export const mockMQTTPublishAsync = vi.fn(async (_topic: string, _message: string, _opts?: IClientPublishOptions): Promise<void> => {});
export const mockMQTTEndAsync = vi.fn(async (): Promise<void> => {});
export const mockMQTTSubscribeAsync = vi.fn(async (_topicObject: string): Promise<void> => {});
export const mockMQTTUnsubscribeAsync = vi.fn(async (_topic: string): Promise<void> => {});

export type MockMQTTConnectionState = "connected" | "reconnecting" | "disconnecting" | "disconnected";

const mockMQTTClient = {
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
};

export const mockMQTTConnectAsync = vi.fn(() => mockMQTTClient);

export const setMockMQTTConnectionState = (state: MockMQTTConnectionState): void => {
    mockMQTTClient.reconnecting = state === "reconnecting";
    mockMQTTClient.disconnecting = state === "disconnecting";
    mockMQTTClient.disconnected = state === "disconnected";
};

vi.mock("mqtt", () => ({
    connectAsync: mockMQTTConnectAsync,
}));
