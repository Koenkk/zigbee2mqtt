const tmp = require('tmp');
const yaml = require('../../lib/util/yaml');
const path = require('path');
const fs = require('fs');
const stringify = require('json-stable-stringify-without-jsonify');

const mockDir = tmp.dirSync().name;
const mockDirStorage = tmp.dirSync().name;
const stateFile = path.join(mockDir, 'state.json');

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
                qos: 1,
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
                friendly_name: "ikea_onoff"
            },
            '0x000b57fffec6a5b7': {
                retain: false,
                friendly_name: "bulb_2"
            },
            "0x000b57fffec6a5b3": {
                retain: false,
                friendly_name: "bulb_color"
            },
            '0x000b57fffec6a5b4': {
                retain: false,
                friendly_name: "bulb_color_2"
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
            },
            '0x0017880104e45551': {
                retain: false,
                friendly_name: 'smart vent'
            },
            '0x0017880104e45552': {
                retain: false,
                friendly_name: 'j1'
            },
            '0x0017880104e45553': {
                retain: false,
                friendly_name: 'bulb_enddevice'
            },
            '0x0017880104e45559': {
                retain: false,
                friendly_name: 'cc2530_router'
            },
            '0x0017880104e45560': {
                retain: false,
                friendly_name: 'livolo'
            },
            '0x90fd9ffffe4b64ae': {
                retain: false,
                friendly_name: 'tradfri_remote',
            },
            '0x90fd9ffffe4b64af': {
                friendly_name: 'roller_shutter',
            },
            '0x90fd9ffffe4b64ax': {
                friendly_name: 'ZNLDP12LM',
            },
            '0x90fd9ffffe4b64aa': {
                friendly_name: 'SP600_OLD',
            },
            '0x90fd9ffffe4b64ab': {
                friendly_name: 'SP600_NEW',
            },
            '0x90fd9ffffe4b64ac': {
                friendly_name: 'MKS-CM-W5',
            },
            '0x0017880104e45526': {
                friendly_name: 'GL-S-007ZS',
            },
            '0x0017880104e43559': {
                friendly_name: 'U202DST600ZB'
            },
            '0x0017880104e44559': {
                friendly_name: '3157100_thermostat',
            },
            '0x0017880104a44559': {
                friendly_name: 'J1_cover',
            },
            '0x0017882104a44559': {
                friendly_name: 'TS0601_thermostat',
            },
            '0x0017882194e45543': {
                friendly_name: 'QS-Zigbee-D02-TRIAC-2C-LN',
            },
            '0x0017880104e45724': {
                friendly_name: 'GLEDOPTO_2ID',
            },
            '0x0017880104e45561': {
                friendly_name: 'temperature_sensor',
            },
            '0x0017880104e45562': {
                friendly_name: 'heating_actuator',
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
            },
            '15071': {
                friendly_name: 'group_tradfri_remote',
                retain: false,
                devices: ['bulb_color_2', 'bulb_2']
            },
            '11': {
                friendly_name: 'group_with_tradfri',
                retain: false,
                devices: ['bulb_2']
            },
            '12': {
                friendly_name: 'thermostat_group',
                retain: false,
                devices: ['TS0601_thermostat'],
            },
            '14': {
                friendly_name: 'switch_group',
                retain: false,
                devices: ['power_plug'],
            },
            '21': {
                friendly_name: 'gledopto_group',
                devices: ['GLEDOPTO_2ID/cct'],
            },
            '9': {
                friendly_name: 'ha_discovery_group',
                devices: ['bulb_color_2', 'bulb_2', 'wall_switch_double/right']
            },
        },
        external_converters: [],
    };

    yaml.writeIfChanged(path.join(mockDir, 'configuration.yaml'), config);
}

function writeEmptyState() {
    fs.writeFileSync(stateFile, stringify({}));
}

function removeState() {
    if (stateExists()) {
        fs.unlinkSync(stateFile);
    }
}

function stateExists() {
    return fs.existsSync(stateFile);
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

    fs.writeFileSync(path.join(mockDir, 'state.json'), stringify(state));
}

jest.mock('../../lib/util/data', () => ({
    joinPath: (file) => require('path').join(mockDir, file),
    getPath: () => mockDir,
}));

writeDefaultConfiguration();
writeDefaultState();

module.exports = {
    mockDir,
    read: () => yaml.read(path.join(mockDir, 'configuration.yaml')),
    writeDefaultConfiguration,
    writeDefaultState,
    removeState,
    writeEmptyState,
    stateExists,
};
