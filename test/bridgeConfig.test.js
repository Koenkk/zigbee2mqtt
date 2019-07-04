const BridgeConfig = require('../lib/extension/bridgeConfig');
const settings = require('../lib/util/settings');
const fs = require('../lib/util/fs');
const objectAssignDeep = require('object-assign-deep');
const data = require('../lib/util/data');
const configurationFile = data.joinPath('configuration.yaml');
const utils = require('./utils');

const mqtt = {
    subscribe: (topic) => {},
    log: (type, message) => {},
};

describe('BridgeConfig', () => {
    let bridgeConfig;
    const write = (file, json) => fs.writeYaml(file, json);
    const read = (file) => fs.readYaml(file);
    const files = new Map();

    beforeAll(() => {
        utils.stubLogger(jest);
        jest.spyOn(fs, 'readYaml').mockImplementation((file) => {
            if (files.has(file)) return objectAssignDeep.noMutate(files.get(file));
            throw new Error(`Fake file not found: ${file}`);
        });
        jest.spyOn(fs, 'readYamlIfExists').mockImplementation((file) => {
            if (files.has(file)) return objectAssignDeep.noMutate(files.get(file));
            return null;
        });
        jest.spyOn(fs, 'writeYaml').mockImplementation((file, content) => {
            files.set(file, objectAssignDeep.noMutate(content));
        });
    });

    beforeEach(() => {
        settings._clear();
        files.clear();
        bridgeConfig = new BridgeConfig(null, mqtt, null, null);
    });

    afterAll(() => {
        fs.readYaml.mockRestore();
        fs.readYamlIfExists.mockRestore();
        fs.writeYaml.mockRestore();
    });

    it('Setting elapsed false', async () => {
        write(configurationFile, {advanced: {elapsed: true}});
        bridgeConfig.onMQTTMessage('zigbee2mqtt/bridge/config/elapsed', 'false');
        const expected = {
            advanced: {
                elapsed: false,
            },
        };

        expect(read(configurationFile)).toStrictEqual(expected);
    });

    it('Add groups when there are none', async () => {
        write(configurationFile, {});
        bridgeConfig.onMQTTMessage('zigbee2mqtt/bridge/config/add_group', 'test123');
        const expected = {
            groups: {
                '1': {
                    friendly_name: 'test123',
                },
            },
        };

        expect(read(configurationFile)).toStrictEqual(expected);
    });

    it('Add groups when there are', async () => {
        write(configurationFile, {
            groups: {
                '1': {
                    friendly_name: 'test123',
                },
            },
        });

        bridgeConfig.onMQTTMessage('zigbee2mqtt/bridge/config/add_group', 'test1234');
        const expected = {
            groups: {
                '1': {
                    friendly_name: 'test123',
                },
                '2': {
                    friendly_name: 'test1234',
                },
            },
        };

        expect(read(configurationFile)).toStrictEqual(expected);
    });

    it('Remove group', async () => {
        write(configurationFile, {
            groups: {
                '1': {
                    friendly_name: 'test123',
                },
                '2': {
                    friendly_name: 'test1234',
                },
            },
        });

        bridgeConfig.onMQTTMessage('zigbee2mqtt/bridge/config/remove_group', 'test123');
        const expected = {
            groups: {
                '2': {
                    friendly_name: 'test1234',
                },
            },
        };

        expect(read(configurationFile)).toStrictEqual(expected);
    });

    it('Get groups', async () => {
        jest.spyOn(mqtt, 'log').mockImplementation((type, message) => {
            expect(type).toBe('groups');
            expect(Object.keys(message)).toHaveLength(2);
            expect(message['1'].friendly_name).toBe('test1');
            expect(message['4711'].friendly_name).toBe('test42');
        });

        write(configurationFile, {
            groups: {
                '1': {
                    friendly_name: 'test1',
                },
                '4711': {
                    friendly_name: 'test42',
                },
            },
        });

        bridgeConfig.onMQTTMessage('zigbee2mqtt/bridge/config/groups', 'whatever');
    });

    it('Rename device with é', async () => {
        jest.spyOn(mqtt, 'log').mockImplementation((type, message) => {
            expect(type).toBe('device_renamed');
        });

        write(configurationFile, {
            devices: {
                '0x12345678': {
                    friendly_name: 'test123',
                    retain: false,
                },
            },
        });

        const payload = {
            old: 'test123',
            new: 'tést123',
        };

        bridgeConfig.onMQTTMessage('zigbee2mqtt/bridge/config/rename', JSON.stringify(payload));
        const expected = {
            devices: {
                '0x12345678': {
                    friendly_name: 'tést123',
                    retain: false,
                },
            },
        };

        expect(read(configurationFile)).toStrictEqual(expected);
    });
});
