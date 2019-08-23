const zigbeeShepherdConverters = require('zigbee-shepherd-converters');
const logger = require('../util/logger');
const settings = require('./settings');

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
    'top_left', 'top_right', 'white', 'rgb', 'system', 'top', 'bottom', 'center_left', 'center_right',
];

function flatten(arr) {
    return arr.reduce((flat, toFlatten) => {
        return flat.concat(Array.isArray(toFlatten) ? flatten(toFlatten) : toFlatten);
    }, []);
}

const forceEndDevice = flatten(
    ['QBKG03LM', 'QBKG04LM', 'ZNMS13LM', 'ZNMS12LM']
        .map((model) => zigbeeShepherdConverters.devices.find((d) => d.model === model))
        .map((mappedModel) => mappedModel.zigbeeModel));

async function getEndpointByEntityID(zigbee, entityID, epName) {
    const device = await zigbee.getDevice(entityID);
    if (!device) {
        logger.error(`Failed to find device with entity ID '${entityID}'`);
        return;
    }

    const mappedDevice = zigbeeShepherdConverters.findByZigbeeModel(device.modelID);
    if (!mappedDevice) {
        logger.error(`Device with model ID ${device.modelID} is not supported`);
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
    } else if (mappedDevice.hasOwnProperty('ep')) {
        const eps = mappedDevice.ep(device);
        epID = eps[''] || null;
    }

    const endpoint = zigbee.getEndpoint(entityID, epID);
    if (!endpoint) {
        logger.error(`Failed to retrieve for entity ID ${entityID} and endpoint ID ${epID}`);
    }

    return endpoint;
}

async function getZigbee2mqttVersion() {
    return new Promise((resolve, reject) => {
        const git = require('git-last-commit');
        const packageJSON = require('../../package.json');
        const version = packageJSON.version;

        git.getLastCommit((err, commit) => {
            let commitHash = null;

            if (err) {
                try {
                    commitHash = require('../../.hash.json').hash;
                } catch (error) {
                    commitHash = 'unknown';
                }
            } else {
                commitHash = commit.shortHash;
            }

            resolve({commitHash, version});
        });
    });
}

function correctDeviceType(device) {
    if (device) {
        if (forceEndDevice.includes(device.modelID)) {
            return 'EndDevice';
        }
    }

    return device.type;
}

function getDeviceStartupLogMessage(device) {
    const mappedModel = zigbeeShepherdConverters.findByZigbeeModel(device.modelID);
    const settingsDevice = settings.getDevice(device.ieeeAddr);

    const friendlyName = settingsDevice ? settingsDevice.friendly_name : 'unknown';
    const type = device.type ? correctDeviceType(device.type) : 'unknown';
    const model = mappedModel ? mappedModel.model: 'unknown';
    const description = mappedModel ? mappedModel.description : 'unknown';
    const vendor = mappedModel ? mappedModel.vendor : 'unknown';

    return `${friendlyName} (${device.ieeeAddr}): ${model} - ${vendor} ${description} (${type})`;
}

function formatDate(date, type, _default) {
    let result;

    switch (type) {
    case 'ISO_8601':
        result = new Date(date).toISOString();
        break;
    case 'ISO_8601_local':
        result = toLocalISOString(new Date(date));
        break;
    case 'epoch':
        result = date;
        break;
    default:
        result = _default;
        break;
    }

    return result;
}

module.exports = {
    millisecondsToSeconds: (milliseconds) => milliseconds / 1000,
    secondsToMilliseconds: (seconds) => seconds * 1000,
    isXiaomiDevice: (device) => {
        return device.modelID !== 'lumi.router' && xiaomiManufacturerID.includes(device.manufacturerID) &&
            (!device.manufacturerName || !device.manufacturerName.startsWith('Trust'));
    },
    isIkeaTradfriDevice: (device) => ikeaTradfriManufacturerID.includes(device.manufacturerID),
    isRouter: (device) => device.type === 'Router' && !forceEndDevice.includes(device.modelID),
    isBatteryPowered: (device) => device.powerSource && device.powerSource === 'Battery',
    isNumeric: (string) => /^\d+$/.test(string),
    toLocalISOString: (dDate) => toLocalISOString(dDate),
    getPostfixes: () => postfixes,
    formatDate: (date, type, _default=null) => formatDate(date, type, _default),
    correctDeviceType: (device) => {
        if (device) {
            if (forceEndDevice.includes(device.modelID)) {
                return 'EndDevice';
            }
        }

        return device.type;
    },
    getEndpointByEntityID,
    getZigbee2mqttVersion,
    getDeviceStartupLogMessage,
};
