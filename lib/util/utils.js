const settings = require('./settings');

// Xiaomi uses 4151 and 4447 (lumi.plug) as manufacturer ID.
const xiaomiManufacturerID = [4151, 4447];
const ikeaTradfriManufacturerID = [4476];

// An entity can be either a group or a device.
function resolveEntity(ID) {
    let type = null;
    let friendlyName = null;

    if (settings.getIeeeAddrByFriendlyName(ID)) {
        // Check if the ID is a friendly_name of a device.
        friendlyName = ID;
        ID = settings.getIeeeAddrByFriendlyName(ID);
        type = 'device';
    } else if (settings.getGroupIDByFriendlyName(ID)) {
        // Check if the ID is a friendly_name of a group.
        friendlyName = ID;
        ID = Number(settings.getGroupIDByFriendlyName(ID));
        type = 'group';
    } else if (settings.getGroup(ID)) {
        friendlyName = settings.getGroup(ID).friendly_name;
        ID = Number(ID);
        type = 'group';
    } else {
        // By default it is a device with ID as ID.
        type = 'device';
        const device = settings.getDevice(ID);
        friendlyName = device ? device.friendly_name : ID;
    }

    return {ID: ID, type: type, friendlyName: friendlyName};
}

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

module.exports = {
    millisecondsToSeconds: (milliseconds) => milliseconds / 1000,
    secondsToMilliseconds: (seconds) => seconds * 1000,
    isXiaomiDevice: (device) => xiaomiManufacturerID.includes(device.manufId),
    isIkeaTradfriDevice: (device) => ikeaTradfriManufacturerID.includes(device.manufId),
    isNumeric: (string) => /^\d+$/.test(string),
    resolveEntity: (ID) => resolveEntity(ID),
    toLocalISOString: (dDate) => toLocalISOString(dDate),
};
