const tmp = require('tmp');
const yaml = require('../../lib/util/yaml');
const path = require('path');

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
        }
    };

    yaml.write(path.join(mockDir, 'configuration.yaml'), config);
}

jest.mock('../../lib/util/data', () => ({
    joinPath: (file) => require('path').join(mockDir, file),
    joinPathStorage: (file) => require('path').join(mockDirStorage, file),
    getPath: () => mockDir,
}));

writeDefaultConfiguration();

module.exports = {};
