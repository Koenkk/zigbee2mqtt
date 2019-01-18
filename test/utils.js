const logger = require('../lib/util/logger');

module.exports = {
    stubLogger: (sandbox) => {
        sandbox.stub(logger, 'info').callsFake(() => {});
        sandbox.stub(logger, 'warn').callsFake(() => {});
        sandbox.stub(logger, 'debug').callsFake(() => {});
        sandbox.stub(logger, 'error').callsFake(() => {});
    },
    zigbeeMessage: (device, cid, type, data, epId) => {
        return {data: {cid: cid, data: data}, type: type, endpoints: [{device: device, epId: epId}]};
    },
};
