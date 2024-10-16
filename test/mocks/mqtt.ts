import {EventHandler} from './utils';

export const events: Record<string, EventHandler> = {};

export const mockMQTT = {
    publish: jest.fn().mockImplementation((topic, payload, options, cb) => cb()),
    end: jest.fn(),
    subscribe: jest.fn(),
    unsubscribe: jest.fn(),
    reconnecting: false,
    on: jest.fn((type, handler) => {
        if (type === 'connect') {
            handler();
        }

        events[type] = handler;
    }),
    stream: {setMaxListeners: jest.fn()},
};
export const mockMQTTConnect = jest.fn().mockReturnValue(mockMQTT);

jest.mock('mqtt', () => {
    return {connect: mockMQTTConnect};
});
