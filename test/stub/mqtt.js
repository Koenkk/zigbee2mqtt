const events = {};

const mock = {
    publish: jest.fn().mockImplementation((topic, payload, options, cb) => cb()),
    end: jest.fn(),
    subscribe: jest.fn(),
    reconnecting: false,
    on: jest.fn(),
    stream: {setMaxListeners: jest.fn()}
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

        events[type] = handler
    });
}

restoreOnMock();

module.exports = {
    events, ...mock, connect: mockConnect, mock, restoreOnMock
};