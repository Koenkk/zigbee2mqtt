const logger = require('../lib/util/logger');

module.exports = {
    stubLogger: (jest) => {
        jest.spyOn(logger, 'info').mockImplementation(() => {});
        jest.spyOn(logger, 'warn').mockImplementation(() => {});
        jest.spyOn(logger, 'debug').mockImplementation(() => {});
        jest.spyOn(logger, 'error').mockImplementation(() => {});
    },
    zigbeeMessage: (device, cid, type, data, epId) => {
        return {data: {cid, data}, type, endpoints: [{device, epId}]};
    },
};
