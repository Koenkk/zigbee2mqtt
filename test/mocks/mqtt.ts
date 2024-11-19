import type {IClientPublishOptions} from 'mqtt';

import {EventHandler} from './utils';

export const events: Record<string, EventHandler> = {};

export const mockMQTT = {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    publishAsync: jest.fn(async (topic: string, message: string, opts?: IClientPublishOptions): Promise<void> => {}),
    endAsync: jest.fn(async (): Promise<void> => {}),
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    subscribeAsync: jest.fn(async (topicObject: string): Promise<void> => {}),
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    unsubscribeAsync: jest.fn(async (topic: string): Promise<void> => {}),
    reconnecting: false,
    disconnecting: false,
    disconnected: false,
    on: jest.fn((type, handler) => {
        if (type === 'connect') {
            handler();
        }

        events[type] = handler;
    }),
    stream: {setMaxListeners: jest.fn()},
};
export const mockMQTTConnectAsync = jest.fn(() => mockMQTT);

jest.mock('mqtt', () => {
    return {connectAsync: mockMQTTConnectAsync};
});
