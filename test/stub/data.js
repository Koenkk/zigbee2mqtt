const tmp = require('tmp');
const yaml = require('../../lib/util/yaml');
const path = require('path');
const fs = require('fs');

const mockDir = tmp.dirSync().name;
const mockDirStorage = tmp.dirSync().name;

function writeDefaultConfiguration() {
    const config = {
        homeassistant: false,
        permit_join: true,
        mqtt: {
            base_topic: "zigbee2mqtt",
            server: "mqtt://localhost",
        },
        serial: {
            "port": "/dev/dummy",
        },
        devices: {
            "0x000b57fffec6a5b2": {
                retain: true,
                friendly_name: "bulb"
            },
            "0x0017880104e45517": {
                retain: true,
                friendly_name: "remote"
            },
            "0x0017880104e45520": {
                retain: false,
                friendly_name: "button"
            }
        }
    };

    yaml.write(path.join(mockDir, 'configuration.yaml'), config);
}

function writeEmptyState() {
    yaml.write(path.join(mockDir, 'state.json'), JSON.stringify({}));
}

function writeDefaultState() {
    const state = {
        "0x000b57fffec6a5b2": {
            "state": "ON",
            "brightness": 50,
            "color_temp": 370,
            "linkquality": 99,
        },
        "0x0017880104e45517": {
            "brightness": 255
        },
    }

    fs.writeFileSync(path.join(mockDir, 'state.json'), JSON.stringify(state));
}

jest.mock('../../lib/util/data', () => ({
    joinPath: (file) => require('path').join(mockDir, file),
    joinPathStorage: (file) => require('path').join(mockDirStorage, file),
    getPath: () => mockDir,
}));

writeDefaultConfiguration();
writeDefaultState();

module.exports = {
    mockDir,
    writeDefaultConfiguration,
    writeDefaultState,
    writeEmptyState,
};
