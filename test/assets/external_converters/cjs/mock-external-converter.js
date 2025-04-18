const {posix} = require("node:path");

const mockDevice = {
    mock: true,
    zigbeeModel: ["external_converter_device"],
    vendor: "external",
    model: "external_converter_device",
    description: posix.join("external", "converter"),
    fromZigbee: [],
    toZigbee: [],
    exposes: [],
};

module.exports = mockDevice;
