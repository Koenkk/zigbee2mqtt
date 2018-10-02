// Xiaomi uses 4151 and 4447 (lumi.plug) as manufacturer ID.
const xiaomiManufacturerID = [4151, 4447];

module.exports = {
    millisecondsToSeconds: (milliseconds) => milliseconds / 1000,
    secondsToMilliseconds: (seconds) => seconds * 1000,
    isXiaomiDevice: (device) => xiaomiManufacturerID.includes(device.manufId),
};
