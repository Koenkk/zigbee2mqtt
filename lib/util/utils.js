const zigbeeHerdsmanConverters = require('zigbee-herdsman-converters');
const equals = require('fast-deep-equal');

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

const endpointNames = [
    'left', 'right', 'center', 'bottom_left', 'bottom_right', 'default',
    'top_left', 'top_right', 'white', 'rgb', 'system', 'top', 'bottom', 'center_left', 'center_right',
    'ep1', 'ep2', 'row_1', 'row_2', 'row_3', 'row_4', 'relay',
    'l1', 'l2', 'l3', 'l4', 'l5', 'l6', 'l7', 'l8',
];

function flatten(arr) {
    return arr.reduce((flat, toFlatten) => {
        return flat.concat(Array.isArray(toFlatten) ? flatten(toFlatten) : toFlatten);
    }, []);
}

const forceEndDevice = flatten(
    ['QBKG03LM', 'QBKG04LM', 'ZNMS13LM', 'ZNMS12LM']
        .map((model) => zigbeeHerdsmanConverters.devices.find((d) => d.model === model))
        .filter((definition) => definition.hasOwnProperty('zigbeeModel'))
        .map((definition) => definition.zigbeeModel));

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

function formatDate(date, type) {
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
        throw new Error(`Unsupported type '${type}'`);
    }

    return result;
}

function objectHasProperties(object, properties) {
    for (const property of properties) {
        if (!object.hasOwnProperty(property)) {
            return false;
        }
    }

    return true;
}

function equalsPartial(object, expected) {
    for (const [key, value] of Object.entries(expected)) {
        if (!equals(object[key], value)) {
            return false;
        }
    }

    return true;
}

function getObjectsProperty(objects, key, defaultValue) {
    for (const object of objects) {
        if (object.hasOwnProperty(key)) {
            return object[key];
        }
    }

    return defaultValue;
}

module.exports = {
    millisecondsToSeconds: (milliseconds) => milliseconds / 1000,
    secondsToMilliseconds: (seconds) => seconds * 1000,
    getZigbee2mqttVersion,
    objectHasProperties,
    getObjectsProperty,
    getEndpointNames: () => endpointNames,
    isXiaomiDevice: (device) => {
        return device.modelID !== 'lumi.router' && xiaomiManufacturerID.includes(device.manufacturerID) &&
            (!device.manufacturerName || !device.manufacturerName.startsWith('Trust'));
    },
    isIkeaTradfriDevice: (device) => ikeaTradfriManufacturerID.includes(device.manufacturerID),
    isRouter: (device) => device.type === 'Router' && !forceEndDevice.includes(device.modelID),
    isBatteryPowered: (device) => device.powerSource && device.powerSource === 'Battery',
    formatDate: (date, type) => formatDate(date, type),
    equalsPartial,
};
