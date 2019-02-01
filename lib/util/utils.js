const settings = require('./settings');

// Xiaomi uses 4151 and 4447 (lumi.plug) as manufacturer ID.
const xiaomiManufacturerID = [4151, 4447];
const ikeaTradfriManufacturerID = [4476];

// An entity can be either a group or a device.
function resolveEntity(ID) {
    let type = null;

    if (settings.getIeeeAddrByFriendlyName(ID)) {
        // Check if the ID is a friendly_name of a device.
        ID = settings.getIeeeAddrByFriendlyName(ID);
        type = 'device';
    } else if (settings.getGroupIDByFriendlyName(ID)) {
        // Check if the ID is a friendly_name of a group.
        ID = Number(settings.getGroupIDByFriendlyName(ID));
        type = 'group';
    } else {
        // By default it is a device with ID as ID.
        type = 'device';
    }

    return {ID: ID, type: type};
}

module.exports = {
    millisecondsToSeconds: (milliseconds) => milliseconds / 1000,
    secondsToMilliseconds: (seconds) => seconds * 1000,
    isXiaomiDevice: (device) => xiaomiManufacturerID.includes(device.manufId),
    isIkeaTradfriDevice: (device) => ikeaTradfriManufacturerID.includes(device.manufId),
    isNumeric: (string) => /^\d+$/.test(string),
    resolveEntity: (ID) => resolveEntity(ID),
};
