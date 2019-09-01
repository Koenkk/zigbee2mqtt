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
            },
            "0x0017880104e45521": {
                retain: false,
                friendly_name: "button_double_key"
            },
            "0x0017880104e45522": {
                retain: false,
                friendly_name: "weather_sensor"
            },
            "0x0017880104e45523": {
                retain: false,
                friendly_name: "occupancy_sensor"
            },
            "0x0017880104e45524": {
                retain: false,
                friendly_name: "power_plug"
            },
            "0x0017880104e45530": {
                retain: false,
                friendly_name: "button_double_key_interviewing"
            },
            "0x0017880104e45540": {
                retain: false,
                friendly_name: "ikea_onoff"
            },
            "0x000b57fffec6a5b3": {
                retain: false,
                friendly_name: "bulb_color"
            },
            "0x0017880104e45541": {
                retain: false,
                friendly_name: "wall_switch"
            },
            "0x0017880104e45542": {
                retain: false,
                friendly_name: "wall_switch_double"
            },
            "0x0017880104e45543": {
                retain: false,
                friendly_name: "led_controller_1"
            },
            "0x0017880104e45544": {
                retain: false,
                friendly_name: "led_controller_2"
            },
            '0x0017880104e45545': {
                retain: false,
                friendly_name: "dimmer_wall_switch"
            },
            '0x0017880104e45547': {
                retain: false,
                friendly_name: "curtain"
            },
            '0x0017880104e45548': {
                retain: false,
                friendly_name: 'fan'
            },
            '0x0017880104e45549': {
                retain: false,
                friendly_name: 'siren'
            },
            '0x0017880104e45529': {
                retain: false,
                friendly_name: 'unsupported2'
            },
            '0x0017880104e45550': {
                retain: false,
                friendly_name: 'thermostat'
            }
        },
        groups: {
            '1': {
                friendly_name: 'group_1',
                retain: false,
            },
            '2': {
                friendly_name: 'group_2',
                retain: false,
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
