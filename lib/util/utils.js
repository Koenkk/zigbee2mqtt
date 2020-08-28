const equals = require('fast-deep-equal/es6');
const humanizeDuration = require('humanize-duration');
const data = require('./data');

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
    'top_left', 'top_right', 'white', 'rgb', 'cct', 'system', 'top', 'bottom', 'center_left', 'center_right',
    'ep1', 'ep2', 'row_1', 'row_2', 'row_3', 'row_4', 'relay',
    'l1', 'l2', 'l3', 'l4', 'l5', 'l6', 'l7', 'l8',
    'button_1', 'button_2', 'button_3', 'button_4', 'button_5',
    'button_6', 'button_7', 'button_8', 'button_9', 'button_10',
    'button_11', 'button_12', 'button_13', 'button_14', 'button_15',
    'button_16', 'button_17', 'button_18', 'button_19', 'button_20',
];

function capitalize(s) {
    return s[0].toUpperCase() + s.slice(1);
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
    case 'relative':
        // https://github.com/EvanHahn/HumanizeDuration.js#options
        result = humanizeDuration(Date.now() - date, {language: 'en', largest: 2, round: true}) + ' ago';
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

function getObjectProperty(object, key, defaultValue) {
    return object.hasOwnProperty(key) ? object[key] : defaultValue;
}

function getResponse(request, data, error) {
    const response = {data, status: error ? 'error' : 'ok'};
    if (error) response.error = error;
    if (typeof request === 'object' && request.hasOwnProperty('transaction')) {
        response.transaction = request.transaction;
    }
    return response;
}

function parseJSON(value, failedReturnValue) {
    try {
        return JSON.parse(value);
    } catch (e) {
        return failedReturnValue;
    }
}

function* getExternalConvertersDefinitions(settings) {
    const externalConverters = settings.get().external_converters;

    for (const moduleName of externalConverters) {
        let converterModule = moduleName;

        if (moduleName.endsWith('.js')) {
            converterModule = data.joinPath(moduleName.split('.')[0]);
        }

        const converter = require(converterModule);
        if (Array.isArray(converter)) {
            for (const item of converter) {
                yield item;
            }
        } else {
            yield converter;
        }
    }
}

function toSnakeCase(value) {
    if (typeof value === 'object') {
        for (const key of Object.keys(value)) {
            const keySnakeCase = toSnakeCase(key);
            if (key !== keySnakeCase) {
                value[keySnakeCase] = value[key];
                delete value[key];
            }
        }
        return value;
    } else {
        return value.replace(/\.?([A-Z])/g, (x, y) => '_' + y.toLowerCase()).replace(/^_/, '').replace('_i_d', '_id');
    }
}

module.exports = {
    millisecondsToSeconds: (milliseconds) => milliseconds / 1000,
    secondsToMilliseconds: (seconds) => seconds * 1000,
    getZigbee2mqttVersion,
    objectHasProperties,
    toSnakeCase,
    getObjectProperty,
    getEndpointNames: () => endpointNames,
    isXiaomiDevice: (device) => {
        return device.modelID !== 'lumi.router' && xiaomiManufacturerID.includes(device.manufacturerID) &&
            (!device.manufacturerName || !device.manufacturerName.startsWith('Trust'));
    },
    isIkeaTradfriDevice: (device) => ikeaTradfriManufacturerID.includes(device.manufacturerID),
    formatDate: (date, type) => formatDate(date, type),
    equalsPartial,
    getResponse,
    capitalize,
    parseJSON,
    getExternalConvertersDefinitions,
};
