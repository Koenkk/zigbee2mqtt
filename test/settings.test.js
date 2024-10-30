require('./stub/logger');
require('./stub/data');
const data = require('../lib/util/data');
const utils = require('../lib/util/utils').default;
const settings = require('../lib/util/settings.ts');
const fs = require('fs');
const configurationFile = data.joinPath('configuration.yaml');
const devicesFile = data.joinPath('devices.yaml');
const devicesFile2 = data.joinPath('devices2.yaml');
const groupsFile = data.joinPath('groups.yaml');
const secretFile = data.joinPath('secret.yaml');
const yaml = require('js-yaml');
const objectAssignDeep = require(`object-assign-deep`);

const minimalConfig = {
    permit_join: true,
    homeassistant: true,
    mqtt: {base_topic: 'zigbee2mqtt', server: 'localhost'},
};

describe('Settings', () => {
    const write = (file, json, reread = true) => {
        fs.writeFileSync(file, yaml.dump(json));
        if (reread) {
            settings.reRead();
        }
    };
    const read = (file) => yaml.load(fs.readFileSync(file, 'utf8'));
    const remove = (file) => {
        if (fs.existsSync(file)) fs.unlinkSync(file);
    };
    const clearEnvironmentVariables = () => {
        Object.keys(process.env).forEach((key) => {
            if (key.indexOf('ZIGBEE2MQTT_CONFIG_') >= 0) {
                delete process.env[key];
            }
        });
    };

    beforeEach(() => {
        remove(configurationFile);
        remove(secretFile);
        remove(devicesFile);
        remove(groupsFile);
        clearEnvironmentVariables();
    });

    it('Should return default settings', () => {
        write(configurationFile, {});
        const s = settings.get();
        const expected = objectAssignDeep.noMutate({}, settings.testing.defaults);
        expected.devices = {};
        expected.groups = {};
        expect(s).toStrictEqual(expected);
    });

    it('Should return settings', () => {
        write(configurationFile, {permit_join: true});
        const s = settings.get();
        const expected = objectAssignDeep.noMutate({}, settings.testing.defaults);
        expected.devices = {};
        expected.groups = {};
        expected.permit_join = true;
        expect(s).toStrictEqual(expected);
    });

    it('Should apply environment variables', () => {
        process.env['ZIGBEE2MQTT_CONFIG_SERIAL_DISABLE_LED'] = 'true';
        process.env['ZIGBEE2MQTT_CONFIG_ADVANCED_SOFT_RESET_TIMEOUT'] = 1;
        process.env['ZIGBEE2MQTT_CONFIG_ADVANCED_OUTPUT'] = 'attribute_and_json';
        process.env['ZIGBEE2MQTT_CONFIG_ADVANCED_LOG_OUTPUT'] = '["console"]';
        process.env['ZIGBEE2MQTT_CONFIG_MAP_OPTIONS_GRAPHVIZ_COLORS_FILL'] =
            '{"enddevice": "#ff0000", "coordinator": "#00ff00", "router": "#0000ff"}';
        process.env['ZIGBEE2MQTT_CONFIG_MQTT_BASE_TOPIC'] = 'testtopic';
        process.env['ZIGBEE2MQTT_CONFIG_MQTT_SERVER'] = 'testserver';
        process.env['ZIGBEE2MQTT_CONFIG_ADVANCED_NETWORK_KEY'] = 'GENERATE';
        process.env['ZIGBEE2MQTT_CONFIG_DEVICES'] = 'devices.yaml';

        const contentDevices = {
            '0x00158d00018255df': {
                friendly_name: '0x00158d00018255df',
                retain: false,
            },
        };

        write(configurationFile, {});
        write(devicesFile, contentDevices);
        expect(settings.validate()).toStrictEqual([]);

        const s = settings.get();
        const expected = objectAssignDeep.noMutate({}, settings.testing.defaults);
        expected.devices = {
            '0x00158d00018255df': {
                friendly_name: '0x00158d00018255df',
                retain: false,
            },
        };
        expected.groups = {};
        expected.serial.disable_led = true;
        expected.advanced.soft_reset_timeout = 1;
        expected.advanced.log_output = ['console'];
        expected.advanced.output = 'attribute_and_json';
        expected.map_options.graphviz.colors.fill = {enddevice: '#ff0000', coordinator: '#00ff00', router: '#0000ff'};
        expected.mqtt.base_topic = 'testtopic';
        expected.mqtt.server = 'testserver';
        expected.advanced.network_key = 'GENERATE';

        expect(s).toStrictEqual(expected);
    });

    it('Should add devices', () => {
        write(configurationFile, {});
        settings.addDevice('0x12345678');

        const actual = read(configurationFile);
        const expected = {
            devices: {
                '0x12345678': {
                    friendly_name: '0x12345678',
                },
            },
        };

        expect(actual).toStrictEqual(expected);
    });

    it('Should add devices even when devices exist empty', () => {
        write(configurationFile, {devices: []});
        settings.addDevice('0x12345678');

        const actual = read(configurationFile);
        const expected = {
            devices: {
                '0x12345678': {
                    friendly_name: '0x12345678',
                },
            },
        };

        expect(actual).toStrictEqual(expected);
    });

    it('Should read devices', () => {
        const content = {
            devices: {
                '0x12345678': {
                    friendly_name: '0x12345678',
                    retain: false,
                },
            },
        };

        write(configurationFile, content);

        const device = settings.getDevice('0x12345678');
        const expected = {
            ID: '0x12345678',
            friendly_name: '0x12345678',
            retain: false,
        };

        expect(device).toStrictEqual(expected);
    });

    it('Should not throw error when devices is null', () => {
        const content = {devices: null};
        write(configurationFile, content);
        settings.getDevice('0x12345678');
    });

    it('Should read MQTT username and password form a separate file', () => {
        const contentConfiguration = {
            mqtt: {
                server: 'my.mqtt.server',
                user: '!secret username',
                password: '!secret password',
            },
            advanced: {
                network_key: '!secret network_key',
            },
        };

        const contentSecret = {
            username: 'mysecretusername',
            password: 'mysecretpassword',
            network_key: [1, 2, 3],
        };

        write(secretFile, contentSecret, false);
        write(configurationFile, contentConfiguration);

        const expected = {
            base_topic: 'zigbee2mqtt',
            include_device_information: false,
            force_disable_retain: false,
            password: 'mysecretpassword',
            server: 'my.mqtt.server',
            user: 'mysecretusername',
        };

        expect(settings.get().mqtt).toStrictEqual(expected);
        expect(settings.get().advanced.network_key).toStrictEqual([1, 2, 3]);

        settings.testing.write();
        expect(read(configurationFile)).toStrictEqual(contentConfiguration);
        expect(read(secretFile)).toStrictEqual(contentSecret);

        settings.set(['mqtt', 'user'], 'test123');
        settings.set(['advanced', 'network_key'], [1, 2, 3, 4]);
        expect(read(configurationFile)).toStrictEqual(contentConfiguration);
        expect(read(secretFile)).toStrictEqual({...contentSecret, username: 'test123', network_key: [1, 2, 3, 4]});
    });

    it('Should read ALL secrets form a separate file', () => {
        const contentConfiguration = {
            mqtt: {
                server: '!secret server',
                user: '!secret username',
                password: '!secret.yaml password',
            },
            advanced: {
                network_key: '!secret network_key',
            },
        };

        const contentSecret = {
            server: 'my.mqtt.server',
            username: 'mysecretusername',
            password: 'mysecretpassword',
            network_key: [1, 2, 3],
        };

        write(secretFile, contentSecret, false);
        write(configurationFile, contentConfiguration);

        const expected = {
            base_topic: 'zigbee2mqtt',
            include_device_information: false,
            force_disable_retain: false,
            password: 'mysecretpassword',
            server: 'my.mqtt.server',
            user: 'mysecretusername',
        };

        expect(settings.get().mqtt).toStrictEqual(expected);
        expect(settings.get().advanced.network_key).toStrictEqual([1, 2, 3]);

        settings.testing.write();
        expect(read(configurationFile)).toStrictEqual(contentConfiguration);
        expect(read(secretFile)).toStrictEqual(contentSecret);

        settings.set(['mqtt', 'server'], 'not.secret.server');
        expect(read(configurationFile)).toStrictEqual(contentConfiguration);
        expect(read(secretFile)).toStrictEqual({...contentSecret, server: 'not.secret.server'});
    });

    it('Should read devices form a separate file', () => {
        const contentConfiguration = {
            devices: 'devices.yaml',
        };

        const contentDevices = {
            '0x12345678': {
                friendly_name: '0x12345678',
                retain: false,
            },
        };

        write(configurationFile, contentConfiguration);
        write(devicesFile, contentDevices);
        const device = settings.getDevice('0x12345678');
        const expected = {
            ID: '0x12345678',
            friendly_name: '0x12345678',
            retain: false,
        };

        expect(device).toStrictEqual(expected);
    });

    it('Should read devices form 2 separate files', () => {
        const contentConfiguration = {
            devices: ['devices.yaml', 'devices2.yaml'],
        };

        const contentDevices = {
            '0x12345678': {
                friendly_name: '0x12345678',
                retain: false,
            },
        };

        const contentDevices2 = {
            '0x87654321': {
                friendly_name: '0x87654321',
                retain: false,
            },
        };

        write(configurationFile, contentConfiguration);
        write(devicesFile, contentDevices);
        write(devicesFile2, contentDevices2);
        expect(settings.getDevice('0x12345678').friendly_name).toStrictEqual('0x12345678');
        expect(settings.getDevice('0x87654321').friendly_name).toStrictEqual('0x87654321');
    });

    it('Should add devices to a separate file', () => {
        const contentConfiguration = {
            devices: 'devices.yaml',
        };

        const contentDevices = {
            '0x12345678': {
                friendly_name: '0x12345678',
                retain: false,
            },
        };

        write(configurationFile, contentConfiguration);
        write(devicesFile, contentDevices);

        settings.addDevice('0x1234');

        expect(read(configurationFile)).toStrictEqual({devices: 'devices.yaml'});

        const expected = {
            '0x12345678': {
                friendly_name: '0x12345678',
                retain: false,
            },
            '0x1234': {
                friendly_name: '0x1234',
            },
        };

        expect(read(devicesFile)).toStrictEqual(expected);
    });

    function extractFromMultipleDeviceConfigs(contentDevices2) {
        const contentConfiguration = {
            devices: ['devices.yaml', 'devices2.yaml'],
        };

        const contentDevices = {
            '0x12345678': {
                friendly_name: '0x12345678',
                retain: false,
            },
        };

        write(configurationFile, contentConfiguration);
        write(devicesFile, contentDevices);
        write(devicesFile2, contentDevices2);

        settings.addDevice('0x1234');

        expect(read(configurationFile)).toStrictEqual({devices: ['devices.yaml', 'devices2.yaml']});

        const expected = {
            '0x12345678': {
                friendly_name: '0x12345678',
                retain: false,
            },
            '0x1234': {
                friendly_name: '0x1234',
            },
        };

        expect(read(devicesFile)).toStrictEqual(expected);
        expect(read(devicesFile2)).toStrictEqual(contentDevices2);
    }

    it('Should add devices for first file when using 2 separates file', () => {
        extractFromMultipleDeviceConfigs({
            '0x87654321': {
                friendly_name: '0x87654321',
                retain: false,
            },
        });
    });

    it('Should add devices for first file when using 2 separates file and the second file is empty', () => {
        extractFromMultipleDeviceConfigs(null);
    });

    it('Should add devices to a separate file if devices.yaml doesnt exist', () => {
        const contentConfiguration = {
            devices: 'devices.yaml',
        };

        write(configurationFile, contentConfiguration);

        settings.addDevice('0x1234');

        expect(read(configurationFile)).toStrictEqual({devices: 'devices.yaml'});

        const expected = {
            '0x1234': {
                friendly_name: '0x1234',
            },
        };

        expect(read(devicesFile)).toStrictEqual(expected);
    });

    it('Should add and remove devices to a separate file if devices.yaml doesnt exist', () => {
        const contentConfiguration = {
            devices: 'devices.yaml',
        };

        write(configurationFile, contentConfiguration);

        settings.addDevice('0x1234');
        expect(read(configurationFile)).toStrictEqual({devices: 'devices.yaml'});

        settings.removeDevice('0x1234');
        expect(read(configurationFile)).toStrictEqual({devices: 'devices.yaml'});

        expect(read(devicesFile)).toStrictEqual({});
    });

    it('Should read groups', () => {
        const content = {
            groups: {
                1: {
                    friendly_name: '123',
                },
            },
        };

        write(configurationFile, content);

        const group = settings.getGroup('1');
        const expected = {
            ID: 1,
            friendly_name: '123',
            devices: [],
        };

        expect(group).toStrictEqual(expected);
    });

    it('Should read groups from a separate file', () => {
        const contentConfiguration = {
            groups: 'groups.yaml',
        };

        const contentGroups = {
            1: {
                friendly_name: '123',
            },
        };

        write(configurationFile, contentConfiguration);
        write(groupsFile, contentGroups);

        const group = settings.getGroup('1');
        const expected = {
            ID: 1,
            friendly_name: '123',
            devices: [],
        };

        expect(group).toStrictEqual(expected);
    });

    it('Combine everything! groups and devices from separate file :)', () => {
        const contentConfiguration = {
            devices: 'devices.yaml',
            groups: 'groups.yaml',
        };

        const contentGroups = {
            1: {
                friendly_name: '123',
                devices: [],
            },
        };
        write(configurationFile, contentConfiguration);
        write(groupsFile, contentGroups);

        const expectedConfiguration = {
            devices: 'devices.yaml',
            groups: 'groups.yaml',
        };

        expect(read(configurationFile)).toStrictEqual(expectedConfiguration);

        settings.addDevice('0x1234');

        expect(read(configurationFile)).toStrictEqual(expectedConfiguration);

        const expectedDevice = {
            '0x1234': {
                friendly_name: '0x1234',
            },
        };

        expect(read(devicesFile)).toStrictEqual(expectedDevice);

        const group = settings.getGroup('1');
        const expectedGroup = {
            ID: 1,
            friendly_name: '123',
            devices: [],
        };

        expect(group).toStrictEqual(expectedGroup);

        expect(read(configurationFile)).toStrictEqual(expectedConfiguration);

        const expectedDevice2 = {
            ID: '0x1234',
            friendly_name: '0x1234',
        };

        expect(settings.getDevice('0x1234')).toStrictEqual(expectedDevice2);
    });

    it('Should add groups', () => {
        write(configurationFile, {});

        const added = settings.addGroup('test123');
        const expected = {
            1: {
                friendly_name: 'test123',
            },
        };

        expect(settings.get().groups).toStrictEqual(expected);
    });

    it('Should add groups with specific ID', () => {
        write(configurationFile, {});

        const added = settings.addGroup('test123', 123);
        const expected = {
            123: {
                friendly_name: 'test123',
            },
        };

        expect(settings.get().groups).toStrictEqual(expected);
    });

    it('Should throw error when changing entity options of non-existing device', () => {
        write(configurationFile, {});

        expect(() => {
            settings.changeEntityOptions('not_existing_123', {});
        }).toThrow(new Error("Device or group 'not_existing_123' does not exist"));
    });

    it('Should not add duplicate groups', () => {
        write(configurationFile, {});

        settings.addGroup('test123');
        expect(() => {
            settings.addGroup('test123');
        }).toThrow(new Error("friendly_name 'test123' is already in use"));
        const expected = {
            1: {
                friendly_name: 'test123',
            },
        };

        expect(settings.get().groups).toStrictEqual(expected);
    });

    it('Should not add duplicate groups with specific ID', () => {
        write(configurationFile, {});

        settings.addGroup('test123', 123);
        expect(() => {
            settings.addGroup('test_id_123', 123);
        }).toThrow(new Error("Group ID '123' is already in use"));
        const expected = {
            123: {
                friendly_name: 'test123',
            },
        };

        expect(settings.get().groups).toStrictEqual(expected);
    });

    it('Should add devices to groups', () => {
        write(configurationFile, {
            devices: {
                '0x123': {
                    friendly_name: 'bulb',
                    retain: true,
                },
            },
        });

        settings.addGroup('test123');
        settings.addDeviceToGroup('test123', ['0x123']);
        const expected = {
            1: {
                friendly_name: 'test123',
                devices: ['0x123'],
            },
        };

        expect(settings.get().groups).toStrictEqual(expected);
    });

    it('Should remove devices from groups', () => {
        write(configurationFile, {
            devices: {
                '0x123': {
                    friendly_name: 'bulb',
                    retain: true,
                },
            },
            groups: {
                1: {
                    friendly_name: 'test123',
                    devices: ['0x123'],
                },
            },
        });

        settings.removeDeviceFromGroup('test123', ['0x123']);
        const expected = {
            1: {
                friendly_name: 'test123',
                devices: [],
            },
        };

        expect(settings.get().groups).toStrictEqual(expected);
    });

    it('Shouldnt crash when removing device from group when group has no devices', () => {
        write(configurationFile, {
            devices: {
                '0x123': {
                    friendly_name: 'bulb',
                    retain: true,
                },
            },
            groups: {
                1: {
                    friendly_name: 'test123',
                },
            },
        });

        settings.removeDeviceFromGroup('test123', ['0x123']);
        const expected = {
            1: {
                friendly_name: 'test123',
            },
        };

        expect(settings.get().groups).toStrictEqual(expected);
    });

    it('Should throw when adding device to non-existing group', () => {
        write(configurationFile, {
            devices: {
                '0x123': {
                    friendly_name: 'bulb',
                    retain: true,
                },
            },
        });

        expect(() => {
            settings.removeDeviceFromGroup('test123', 'bulb');
        }).toThrow(new Error("Group 'test123' does not exist"));
    });

    it('Should throw when adding device which already exists', () => {
        write(configurationFile, {
            devices: {
                '0x123': {
                    friendly_name: 'bulb',
                    retain: true,
                },
            },
        });

        expect(() => {
            settings.addDevice('0x123');
        }).toThrow(new Error("Device '0x123' already exists"));
    });

    it('Should not allow any string values for ext_pan_id', () => {
        write(configurationFile, {
            ...minimalConfig,
            advanced: {ext_pan_id: 'NOT_GENERATE'},
        });

        settings.reRead();

        const error = `advanced.ext_pan_id: should be array or 'GENERATE' (is 'NOT_GENERATE')`;
        expect(settings.validate()).toEqual(expect.arrayContaining([error]));
    });

    it('Should not allow any string values for network_key', () => {
        write(configurationFile, {
            ...minimalConfig,
            advanced: {network_key: 'NOT_GENERATE'},
        });

        settings.reRead();

        const error = `advanced.network_key: should be array or 'GENERATE' (is 'NOT_GENERATE')`;
        expect(settings.validate()).toEqual(expect.arrayContaining([error]));
    });

    it('Should not allow any string values for pan_id', () => {
        write(configurationFile, {
            ...minimalConfig,
            advanced: {pan_id: 'NOT_GENERATE'},
        });

        settings.reRead();

        const error = `advanced.pan_id: should be number or 'GENERATE' (is 'NOT_GENERATE')`;
        expect(settings.validate()).toEqual(expect.arrayContaining([error]));
    });

    it('Should allow retention configuration with MQTT v5', () => {
        write(configurationFile, {
            ...minimalConfig,
            mqtt: {base_topic: 'zigbee2mqtt', server: 'localhost', version: 5},
            devices: {'0x0017880104e45519': {friendly_name: 'tain', retention: 900}},
        });

        settings.reRead();
        expect(settings.validate()).toEqual([]);
    });

    it('Should not allow retention configuration without MQTT v5', () => {
        write(configurationFile, {
            ...minimalConfig,
            devices: {'0x0017880104e45519': {friendly_name: 'tain', retention: 900}},
        });

        settings.reRead();

        const error = 'MQTT retention requires protocol version 5';
        expect(settings.validate()).toEqual(expect.arrayContaining([error]));
    });

    it('Should not allow non-existing entities in availability_blocklist', () => {
        write(configurationFile, {
            ...minimalConfig,
            devices: {'0x0017880104e45519': {friendly_name: 'tain'}},
            advanced: {availability_blocklist: ['0x0017880104e45519', 'non_existing']},
        });

        settings.reRead();

        const error = `Non-existing entity 'non_existing' specified in 'availability_blocklist'`;
        expect(settings.validate()).toEqual(expect.arrayContaining([error]));
    });

    it('Should validate if settings do not conform to scheme', () => {
        write(configurationFile, {
            ...minimalConfig,
            advanced: null,
        });

        settings.reRead();

        const error = `advanced must be object`;
        expect(settings.validate()).toEqual(expect.arrayContaining([error]));
    });

    it('Should add devices to blocklist', () => {
        write(configurationFile, {});
        settings.blockDevice('0x123');
        expect(settings.get().blocklist).toStrictEqual(['0x123']);
        settings.blockDevice('0x1234');
        expect(settings.get().blocklist).toStrictEqual(['0x123', '0x1234']);
    });

    it('Should throw error when yaml file is invalid', () => {
        fs.writeFileSync(
            configurationFile,
            `
             good: 9
             \t wrong
        `,
        );

        settings.testing.clear();
        const error = `Your YAML file: '${configurationFile}' is invalid (use https://jsonformatter.org/yaml-validator to find and fix the issue)`;
        expect(settings.validate()).toEqual(expect.arrayContaining([error]));
    });

    it('Should throw error when yaml file does not exist', () => {
        settings.testing.clear();
        expect(settings.validate()[0]).toContain(`ENOENT: no such file or directory, open `);
    });

    it('Configuration shouldnt be valid when invalid QOS value is used', async () => {
        write(configurationFile, {
            ...minimalConfig,
            devices: {'0x0017880104e45519': {friendly_name: 'myname', retain: false, qos: 3}},
        });

        settings.reRead();

        const error = `QOS for 'myname' not valid, should be 0, 1 or 2 got 3`;
        expect(settings.validate()).toEqual(expect.arrayContaining([error]));
    });

    it('Configuration shouldnt be valid when duplicate friendly_name are used', async () => {
        write(configurationFile, {
            ...minimalConfig,
            devices: {'0x0017880104e45519': {friendly_name: 'myname', retain: false}},
            groups: {1: {friendly_name: 'myname', retain: false}},
        });

        settings.reRead();

        const error = `Duplicate friendly_name 'myname' found`;
        expect(settings.validate()).toEqual(expect.arrayContaining([error]));
    });

    it('Configuration friendly name cannot be empty', async () => {
        write(configurationFile, {
            ...minimalConfig,
            devices: {'0x0017880104e45519': {friendly_name: '', retain: false}},
        });

        settings.reRead();

        const error = `friendly_name must be at least 1 char long`;
        expect(settings.validate()).toEqual(expect.arrayContaining([error]));
    });

    it('Configuration friendly name cannot end with /', async () => {
        write(configurationFile, {
            ...minimalConfig,
            devices: {'0x0017880104e45519': {friendly_name: 'blaa/', retain: false}},
        });

        settings.reRead();

        const error = `friendly_name is not allowed to end or start with /`;
        expect(settings.validate()).toEqual(expect.arrayContaining([error]));
    });

    it('Configuration friendly name cannot contain control char', async () => {
        write(configurationFile, {
            ...minimalConfig,
            devices: {'0x0017880104e45519': {friendly_name: 'blaa/blaa\u009f', retain: false}},
        });

        settings.reRead();

        const error = `friendly_name is not allowed to contain control char`;
        expect(settings.validate()).toEqual(expect.arrayContaining([error]));
    });

    it('Configuration shouldnt be valid when friendly_name ends with /DIGIT', async () => {
        write(configurationFile, {
            ...minimalConfig,
            devices: {'0x0017880104e45519': {friendly_name: 'myname/123', retain: false}},
        });

        settings.reRead();

        const error = `Friendly name cannot end with a "/DIGIT" ('myname/123')`;
        expect(settings.validate()).toEqual(expect.arrayContaining([error]));
    });

    it('Configuration shouldnt be valid when friendly_name contains a MQTT wildcard', async () => {
        write(configurationFile, {
            ...minimalConfig,
            devices: {'0x0017880104e45519': {friendly_name: 'myname#', retain: false}},
        });

        settings.reRead();

        const error = `MQTT wildcard (+ and #) not allowed in friendly_name ('myname#')`;
        expect(settings.validate()).toEqual(expect.arrayContaining([error]));
    });

    it('Configuration shouldnt be valid when duplicate friendly_name are used', async () => {
        write(configurationFile, {
            devices: {
                '0x0017880104e45519': {friendly_name: 'myname', retain: false},
                '0x0017880104e45511': {friendly_name: 'myname1', retain: false},
            },
        });

        settings.reRead();

        expect(() => {
            settings.changeFriendlyName('myname1', 'myname');
        }).toThrowError(`friendly_name 'myname' is already in use`);
    });

    it('Should throw when removing device which doesnt exist', async () => {
        write(configurationFile, {
            devices: {
                '0x0017880104e45519': {friendly_name: 'myname', retain: false},
                '0x0017880104e45511': {friendly_name: 'myname1', retain: false},
            },
        });

        settings.reRead();

        expect(() => {
            settings.removeDevice('myname33');
        }).toThrowError(`Device 'myname33' does not exist`);
    });

    it('Shouldnt write to configuration.yaml when there are no changes in it', () => {
        const contentConfiguration = {devices: 'devices.yaml'};
        const contentDevices = {};
        write(configurationFile, contentConfiguration);
        const before = fs.statSync(configurationFile).mtimeMs;
        write(devicesFile, contentDevices);
        settings.addDevice('0x1234');
        const after = fs.statSync(configurationFile).mtimeMs;
        expect(before).toBe(after);
    });

    it('Should keep homeassistant null property on device setting change', () => {
        write(configurationFile, {
            devices: {
                '0x12345678': {
                    friendly_name: 'custom discovery',
                    homeassistant: {
                        entityXYZ: {
                            entity_category: null,
                        },
                    },
                },
            },
        });
        settings.changeEntityOptions('0x12345678', {disabled: true});

        const actual = read(configurationFile);
        const expected = {
            devices: {
                '0x12345678': {
                    friendly_name: 'custom discovery',
                    disabled: true,
                    homeassistant: {
                        entityXYZ: {
                            entity_category: null,
                        },
                    },
                },
            },
        };
        expect(actual).toStrictEqual(expected);
    });

    it('Should keep homeassistant null properties on apply', async () => {
        write(configurationFile, {
            device_options: {
                homeassistant: {temperature: null},
            },
            devices: {
                '0x1234567812345678': {
                    friendly_name: 'custom discovery',
                    homeassistant: {humidity: null},
                },
            },
        });
        settings.reRead();
        settings.apply({permit_join: false});
        expect(settings.get().device_options.homeassistant).toStrictEqual({temperature: null});
        expect(settings.get().devices['0x1234567812345678'].homeassistant).toStrictEqual({humidity: null});
    });

    it('Frontend config', () => {
        write(configurationFile, {...minimalConfig, frontend: true});

        settings.reRead();
        expect(settings.get().frontend).toStrictEqual({port: 8080, auth_token: null, base_url: '/'});
    });

    it('Baudrate config', () => {
        write(configurationFile, {...minimalConfig, advanced: {baudrate: 20}});

        settings.reRead();
        expect(settings.get().serial.baudrate).toStrictEqual(20);
    });

    it('ikea_ota_use_test_url config', () => {
        write(configurationFile, {...minimalConfig, advanced: {ikea_ota_use_test_url: true}});

        settings.reRead();
        expect(settings.get().ota.ikea_ota_use_test_url).toStrictEqual(true);
    });

    it('transmit_power config', () => {
        write(configurationFile, {...minimalConfig, experimental: {transmit_power: 1337}});

        settings.reRead();
        expect(settings.get().advanced.transmit_power).toStrictEqual(1337);
    });

    it('output config', () => {
        write(configurationFile, {...minimalConfig, experimental: {output: 'json'}});

        settings.reRead();
        expect(settings.get().advanced.output).toStrictEqual('json');
    });

    it('Baudrartsctste config', () => {
        write(configurationFile, {...minimalConfig, advanced: {rtscts: true}});

        settings.reRead();
        expect(settings.get().serial.rtscts).toStrictEqual(true);
    });

    it('Deprecated: Home Assistant config', () => {
        write(configurationFile, {
            ...minimalConfig,
            homeassistant: {discovery_topic: 'new'},
            advanced: {homeassistant_discovery_topic: 'old', homeassistant_status_topic: 'olds'},
        });

        settings.reRead();
        expect(settings.get().homeassistant).toStrictEqual({
            discovery_topic: 'new',
            legacy_entity_attributes: true,
            legacy_triggers: true,
            status_topic: 'olds',
        });
    });

    it('Deprecated: ban/whitelist config', () => {
        write(configurationFile, {...minimalConfig, ban: ['ban'], whitelist: ['whitelist'], passlist: ['passlist'], blocklist: ['blocklist']});

        settings.reRead();
        expect(settings.get().blocklist).toStrictEqual(['blocklist', 'ban']);
        expect(settings.get().passlist).toStrictEqual(['passlist', 'whitelist']);
    });

    it('Deprecated: warn log level', () => {
        write(configurationFile, {...minimalConfig, advanced: {log_level: 'warn'}});

        settings.reRead();

        expect(settings.get().advanced.log_level).toStrictEqual('warning');
    });
});
