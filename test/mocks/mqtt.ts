import type {IClientPublishOptions} from 'mqtt';

import {EventHandler} from './utils';

export const events: Record<string, EventHandler> = {};

export const mockMQTT = {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    publishAsync: vi.fn(async (topic: string, message: string, opts?: IClientPublishOptions): Promise<void> => {}),
    endAsync: vi.fn(async (): Promise<void> => {}),
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    subscribeAsync: vi.fn(async (topicObject: string): Promise<void> => {}),
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    unsubscribeAsync: vi.fn(async (topic: string): Promise<void> => {}),
    reconnecting: false,
    disconnecting: false,
    disconnected: false,
    on: vi.fn((type, handler) => {
        if (type === 'connect') {
            handler();
        }

        events[type] = handler;
    }),
    stream: {setMaxListeners: vi.fn()},
};
export const mockMQTTConnectAsync = vi.fn(() => mockMQTT);

vi.mock('mqtt', () => ({
    connectAsync: mockMQTTConnectAsync,
}));
