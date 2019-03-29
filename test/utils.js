const logger = require('../lib/util/logger');

module.exports = {
    stubLogger: (jest) => {
        jest.spyOn(logger, 'info').mockReturnValue(undefined);
        jest.spyOn(logger, 'warn').mockReturnValue(undefined);
        jest.spyOn(logger, 'debug').mockReturnValue(undefined);
        jest.spyOn(logger, 'error').mockReturnValue(undefined);
    },
    zigbeeMessage: (device, cid, type, data, epId, groupid=0) => {
        return {data: {cid, data}, type, groupid, endpoints: [{device, epId}]};
    },
};
