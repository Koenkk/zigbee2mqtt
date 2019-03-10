const logger = require('../lib/util/logger');

module.exports = {
    stubLogger: (jest) => {
        jest.spyOn(logger, 'info').mockReturnValue(undefined);
        jest.spyOn(logger, 'warn').mockReturnValue(undefined);
        jest.spyOn(logger, 'debug').mockReturnValue(undefined);
        jest.spyOn(logger, 'error').mockReturnValue(undefined);
    },
    zigbeeMessage: (device, cid, type, data, epId) => {
        return {data: {cid, data}, type, endpoints: [{device, epId}]};
    },
};
