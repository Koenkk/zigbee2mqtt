import {posix} from 'node:path';

export default {
    mock: true,
    zigbeeModel: ['external_converter_device'],
    vendor: 'external',
    model: 'external_converter_device',
    description: posix.join('external', 'converter'),
    fromZigbee: [],
    toZigbee: [],
    exposes: [],
};
