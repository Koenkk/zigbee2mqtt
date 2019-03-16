const zigbeeShepherdConverters = require('zigbee-shepherd-converters');
const logger = require('../util/logger');

// Xiaomi uses 4151 and 4447 (lumi.plug) as manufacturer ID.
const xiaomiManufacturerID = [4151, 4447];
const ikeaTradfriManufacturerID = [4476];

// construct a local ISO8601 string (instead of UTC-based)
// Example:
//  - ISO8601 (UTC) = 2019-03-01T15:32:45.941+0000
//  - ISO8601 (local) = 2019-03-01T16:32:45.941+0100 (for timezone GMT+1)
function toLocalISOString(dDate) {
    const tzOffset = -dDate.getTimezoneOffset();
    const plusOrMinus = tzOffset >= 0 ? '+' : '-';
    const pad = function(num) {
        const norm = Math.floor(Math.abs(num));
        return (norm < 10 ? '0' : '') + norm;
    };

    return dDate.getFullYear() +
        '-' + pad(dDate.getMonth() + 1) +
        '-' + pad(dDate.getDate()) +
        'T' + pad(dDate.getHours()) +
        ':' + pad(dDate.getMinutes()) +
        ':' + pad(dDate.getSeconds()) +
        plusOrMinus + pad(tzOffset / 60) +
        ':' + pad(tzOffset % 60);
}

const postfixes = [
    'left', 'right', 'center', 'bottom_left', 'bottom_right',
    'top_left', 'top_right', 'white', 'rgb', 'system', 'top', 'bottom',
];

function getEndpointByEntityID(zigbee, entityID, epName) {
    const device = zigbee.getDevice(entityID);
    if (!device) {
        logger.error(`Failed to find device with entity ID '${entityID}'`);
        return;
    }

    const mappedDevice = zigbeeShepherdConverters.findByZigbeeModel(device.modelId);
    if (!mappedDevice) {
        logger.error(`Device with model ID ${device.modelId} is not supported`);
        return;
    }

    let epID = null;
    if (epName) {
        if (!mappedDevice.ep) {
            logger.error(`Device ${mappedDevice.model} doesn't define eps`);
            return;
        }

        epID = mappedDevice.ep(device)[epName];
        if (!epID) {
            logger.error(`Device ${mappedDevice.model} doesn't have ep named '${epName}'`);
            return;
        }
    }

    const endpoint = zigbee.getEndpoint(entityID, epID);
    if (!endpoint) {
        logger.error(`Failed to retrieve for entity ID ${entityID} and endpoint ID ${epID}`);
    }

    return endpoint;
}

module.exports = {
    millisecondsToSeconds: (milliseconds) => milliseconds / 1000,
    secondsToMilliseconds: (seconds) => seconds * 1000,
    isXiaomiDevice: (device) => xiaomiManufacturerID.includes(device.manufId),
    isIkeaTradfriDevice: (device) => ikeaTradfriManufacturerID.includes(device.manufId),
    isNumeric: (string) => /^\d+$/.test(string),
    toLocalISOString: (dDate) => toLocalISOString(dDate),
    getPostfixes: () => postfixes,
    getEndpointByEntityID,
};
