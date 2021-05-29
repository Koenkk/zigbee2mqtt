const equals = require('fast-deep-equal/es6');
const humanizeDuration = require('humanize-duration');
const data = require('./data');
const vm = require('vm');
const fs = require('fs');
const path = require('path');

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
    'l9', 'l10', 'l11', 'l12', 'l13', 'l14', 'l15', 'l16',
    'button_1', 'button_2', 'button_3', 'button_4', 'button_5',
    'button_6', 'button_7', 'button_8', 'button_9', 'button_10',
    'button_11', 'button_12', 'button_13', 'button_14', 'button_15',
    'button_16', 'button_17', 'button_18', 'button_19', 'button_20',
    'button_light', 'button_fan_high', 'button_fan_med', 'button_fan_low',
    'heat', 'cool', 'water', 'meter', 'wifi',
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

async function getDependencyVersion(depend) {
    return new Promise((resolve, reject) => {
        const packageJSON = require('../../node_modules/'+depend+'/package.json');
        const version = packageJSON.version;
        resolve({version});
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
    return object && object.hasOwnProperty(key) ? object[key] : defaultValue;
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

function loadModuleFromText(moduleCode) {
    const moduleFakePath = path.join(__dirname, 'externally-loaded.js');
    const sandbox = {
        require: require,
        module: {},
        console,
        setTimeout,
        clearTimeout,
        setInterval,
        clearInterval,
        setImmediate,
        clearImmediate,
    };
    vm.runInNewContext(moduleCode, sandbox, moduleFakePath);
    return sandbox.module.exports;
}

function loadModuleFromFile(modulePath) {
    const moduleCode = fs.readFileSync(modulePath, {encoding: 'utf8'});
    return loadModuleFromText(moduleCode);
}

function* getExternalConvertersDefinitions(settings) {
    const externalConverters = settings.get().external_converters;

    for (const moduleName of externalConverters) {
        let converter;

        if (moduleName.endsWith('.js')) {
            converter = loadModuleFromFile(data.joinPath(moduleName));
        } else {
            converter = require(moduleName);
        }

        if (Array.isArray(converter)) {
            for (const item of converter) {
                yield item;
            }
        } else {
            yield converter;
        }
    }
}

function removeNullPropertiesFromObject(obj) {
    for (const key of Object.keys(obj)) {
        const value = obj[key];
        if (value == null) {
            delete obj[key];
        } else if (typeof value === 'object') {
            removeNullPropertiesFromObject(value);
        }
    }
}

function getKey(object, value, fallback, convertTo) {
    for (const key in object) {
        if (object[key]===value) {
            return convertTo ? convertTo(key) : key;
        }
    }

    return fallback;
}

function toNetworkAddressHex(value) {
    const hex = value.toString(16);
    return `0x${'0'.repeat(4 - hex.length)}${hex}`;
}

function toSnakeCase(value) {
    if (typeof value === 'object') {
        value = {...value};
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

function validateFriendlyName(name, throwFirstError=false) {
    const errors = [];
    for (const endpointName of endpointNames) {
        if (name.toLowerCase().endsWith('/' + endpointName)) {
            errors.push(`friendly_name is not allowed to end with: '/${endpointName}'`);
        }
    }

    if (name.length === 0) errors.push(`friendly_name must be at least 1 char long`);
    if (name.endsWith('/') || name.startsWith('/')) errors.push(`friendly_name is not allowed to end or start with /`);
    if (name.endsWith(String.fromCharCode(0))) errors.push(`friendly_name is not allowed to contain null char`);
    if (endpointNames.includes(name)) errors.push(`Following friendly_name are not allowed: '${endpointNames}'`);
    if (name.match(/.*\/\d*$/)) errors.push(`Friendly name cannot end with a "/DIGIT" ('${name}')`);
    if (name.includes('#') || name.includes('+')) {
        errors.push(`MQTT wildcard (+ and #) not allowed in friendly_name ('${name}')`);
    }

    if (throwFirstError && errors.length) {
        throw new Error(errors[0]);
    }

    return errors;
}
function sleep(seconds) {
    return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
}

function sanitizeImageParameter(parameter) {
    const replaceByDash = [/\?/g, /&/g, /[^a-z\d\- _./:]/gi];
    let sanitized = parameter;
    replaceByDash.forEach((r) => sanitized = sanitized.replace(r, '-'));
    return sanitized;
}

module.exports = {
    millisecondsToSeconds: (milliseconds) => milliseconds / 1000,
    secondsToMilliseconds: (seconds) => seconds * 1000,
    getZigbee2mqttVersion,
    getDependencyVersion,
    objectHasProperties,
    toSnakeCase,
    sleep,
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
    toNetworkAddressHex,
    parseJSON,
    getExternalConvertersDefinitions,
    validateFriendlyName,
    loadModuleFromFile,
    loadModuleFromText,
    getKey,
    sanitizeImageParameter,
    removeNullPropertiesFromObject,
};
