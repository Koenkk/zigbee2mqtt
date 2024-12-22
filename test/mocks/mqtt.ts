import type {IClientPublishOptions} from 'mqtt';

import {EventHandler} from './utils';

export const events: Record<string, EventHandler> = {};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const mockMQTTPublishAsync = vi.fn(async (topic: string, message: string, opts?: IClientPublishOptions): Promise<void> => {});
export const mockMQTTEndAsync = vi.fn(async (): Promise<void> => {});
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const mockMQTTSubscribeAsync = vi.fn(async (topicObject: string): Promise<void> => {});
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const mockMQTTUnsubscribeAsync = vi.fn(async (topic: string): Promise<void> => {});

export const mockMQTTConnectAsync = vi.fn(() => ({
    reconnecting: false,
    disconnecting: false,
    disconnected: false,
    publishAsync: mockMQTTPublishAsync,
    endAsync: mockMQTTEndAsync,
    subscribeAsync: mockMQTTSubscribeAsync,
    unsubscribeAsync: mockMQTTUnsubscribeAsync,
    on: vi.fn((type, handler) => {
        if (type === 'connect') {
            handler();
        }

        events[type] = handler;
    }),
    stream: {setMaxListeners: vi.fn()},
}));

vi.mock('mqtt', () => ({
    connectAsync: mockMQTTConnectAsync,
}));
