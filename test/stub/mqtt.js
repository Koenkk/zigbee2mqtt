const events = {};

const mock = {
    publish: jest.fn().mockImplementation((topic, payload, options, cb) => {
      if (topic.includes('0x18fc2600000d7ae2')) {
        console.log('mock publish:', topic, payload, options);
      }
      cb();
    }),
    end: jest.fn(),
    subscribe: jest.fn(),
    unsubscribe: jest.fn(),
    reconnecting: false,
    on: jest.fn(),
    stream: {setMaxListeners: jest.fn()},
};

const mockConnect = jest.fn().mockReturnValue(mock);

jest.mock('mqtt', () => {
    return {connect: mockConnect};
});

const restoreOnMock = () => {
    mock.on.mockImplementation((type, handler) => {
        if (type === 'connect') {
            handler();
        }

        events[type] = handler;
    });
};

restoreOnMock();

module.exports = {
    events,
    ...mock,
    connect: mockConnect,
    mock,
    restoreOnMock,
};
