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
    'left', 'right', 'center', 'bottom_left', 'bottom_right', 'l1', 'l2',
    'top_left', 'top_right', 'white', 'rgb', 'system', 'top', 'bottom',
];

function flatten(arr) {
    return arr.reduce((flat, toFlatten) => {
        return flat.concat(Array.isArray(toFlatten) ? flatten(toFlatten) : toFlatten);
    }, []);
}

const forceEndDevice = flatten(
    ['QBKG03LM', 'QBKG04LM']
        .map((model) => zigbeeShepherdConverters.devices.find((d) => d.model === model))
        .map((mappedModel) => mappedModel.zigbeeModel));

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

function getZigbee2mqttVersion(callback) {
    const git = require('git-last-commit');
    const packageJSON = require('../../package.json');
    const version = packageJSON.version;

    git.getLastCommit((err, commit) => {
        let commitHash = null;

        if (err) {
            try {
                commitHash = require('../.hash.json').hash;
            } catch (error) {
                commitHash = 'unknown';
            }
        } else {
            commitHash = commit.shortHash;
        }

        callback({commitHash, version});
    });
}

module.exports = {
    millisecondsToSeconds: (milliseconds) => milliseconds / 1000,
    secondsToMilliseconds: (seconds) => seconds * 1000,
    isXiaomiDevice: (device) => {
        return device.modelId !== 'lumi.router' && xiaomiManufacturerID.includes(device.manufId) &&
            (!device.manufName || !device.manufName.startsWith('Trust'));
    },
    isIkeaTradfriDevice: (device) => ikeaTradfriManufacturerID.includes(device.manufId),
    isRouter: (device) => device.type === 'Router' && !forceEndDevice.includes(device.modelId),
    isBatteryPowered: (device) => device.powerSource && device.powerSource === 'Battery',
    isNumeric: (string) => /^\d+$/.test(string),
    toLocalISOString: (dDate) => toLocalISOString(dDate),
    getPostfixes: () => postfixes,
    correctDeviceType: (device) => {
        if (device) {
            if (forceEndDevice.includes(device.modelId)) {
                return 'EndDevice';
            }
        }

        return device.type;
    },
    getEndpointByEntityID,
    getZigbee2mqttVersion,
};
