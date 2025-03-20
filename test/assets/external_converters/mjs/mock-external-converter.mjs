import {posix} from 'node:path';

import {identify} from 'zigbee-herdsman-converters/lib/modernExtend';

export default {
    mock: true,
    zigbeeModel: ['external_converter_device'],
    vendor: 'external',
    model: 'external_converter_device',
    description: posix.join('external', 'converter'),
    extend: [identify()],
};
