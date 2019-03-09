const assert = require('chai').assert;
const sinon = require('sinon');
const objectAssignDeep = require('object-assign-deep');

const data = require('../lib/util/data');
const settings = require('../lib/util/settings.js');
const fs = require('../lib/util/fs');

const configurationFile = data.joinPath('configuration.yaml');
const devicesFile = data.joinPath('devices.yaml');
const groupsFile = data.joinPath('groups.yaml');

describe('Settings', () => {
    const write = (file, json) => fs.writeYaml(file, json);

    const read = (file) => fs.readYaml(file);

    const files = new Map();
    // eslint-disable-next-line no-undef
    (typeof jest === 'undefined' ? before : beforeAll)(()=>{
        sinon.stub(fs, 'readYaml').callsFake((file) => {
            if (files.has(file)) return objectAssignDeep.noMutate(files.get(file));
            throw new Error(`Fake file not found: ${file}`);
        });
        sinon.stub(fs, 'readYamlIfExists').callsFake((file) => {
            if (files.has(file)) return objectAssignDeep.noMutate(files.get(file));
            return null;
        });
        sinon.stub(fs, 'writeYaml').callsFake((file, content) => {
            files.set(file, objectAssignDeep.noMutate(content));
        });
    });

    beforeEach(() => {
        settings._clear();
        files.clear();
    });

    // eslint-disable-next-line no-undef
    (typeof jest === 'undefined' ? after : afterAll)(() => {
        fs.readYaml.restore();
        fs.readYamlIfExists.restore();
        fs.writeYaml.restore();
    });

    describe('Settings', () => {
        it('Should return default settings', () => {
            write(configurationFile, {});
            const s = settings.get();
            assert.deepEqual(s, settings._getDefaults());
        });

        it('Should return settings', () => {
            write(configurationFile, {permit_join: true});
            const s = settings.get();
            const expected = settings._getDefaults();
            expected.permit_join = true;
            assert.deepEqual(s, expected);
        });

        it('Should add devices', () => {
            write(configurationFile, {});
            settings.addDevice('0x12345678');

            const actual = read(configurationFile);
            const expected = {
                devices: {
                    '0x12345678': {
                        friendly_name: '0x12345678',
                        retain: false,
                    },
                },
            };

            assert.deepEqual(actual, expected);
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
                friendly_name: '0x12345678',
                retain: false,
            };

            assert.deepEqual(device, expected);
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

            write(devicesFile, contentDevices);
            write(configurationFile, contentConfiguration);

            const device = settings.getDevice('0x12345678');
            const expected = {
                friendly_name: '0x12345678',
                retain: false,
            };

            assert.deepEqual(device, expected);
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

            write(devicesFile, contentDevices);
            write(configurationFile, contentConfiguration);

            settings.addDevice('0x1234');

            assert.deepEqual(read(configurationFile), {devices: 'devices.yaml'});

            const expected = {
                '0x12345678': {
                    friendly_name: '0x12345678',
                    retain: false,
                },
                '0x1234': {
                    friendly_name: '0x1234',
                    retain: false,
                },
            };

            assert.deepEqual(read(devicesFile), expected);
        });

        it('Should add devices to a separate file if devices.yaml doesnt exist', () => {
            const contentConfiguration = {
                devices: 'devices.yaml',
            };

            write(configurationFile, contentConfiguration);

            settings.addDevice('0x1234');

            assert.deepEqual(read(configurationFile), {devices: 'devices.yaml'});

            const expected = {
                '0x1234': {
                    friendly_name: '0x1234',
                    retain: false,
                },
            };

            assert.deepEqual(read(devicesFile), expected);
        });

        it('Should add and remove devices to a separate file if devices.yaml doesnt exist', () => {
            const contentConfiguration = {
                devices: 'devices.yaml',
            };

            write(configurationFile, contentConfiguration);

            settings.addDevice('0x1234');
            assert.deepEqual(read(configurationFile), {devices: 'devices.yaml'});

            settings.removeDevice('0x1234');
            assert.deepEqual(read(configurationFile), {devices: 'devices.yaml'});

            assert.deepEqual(read(devicesFile), {});
        });

        it('Should read groups', () => {
            const content = {
                groups: {
                    '1': {
                        friendly_name: '123',
                    },
                },
            };

            write(configurationFile, content);

            const group = settings.getGroup('1');
            const expected = {
                friendly_name: '123',
            };

            assert.deepEqual(group, expected);
        });

        it('Should read groups form a separate file', () => {
            const contentConfiguration = {
                groups: 'groups.yaml',
            };

            const contentGroups = {
                '1': {
                    friendly_name: '123',
                },
            };

            write(groupsFile, contentGroups);
            write(configurationFile, contentConfiguration);

            const group = settings.getGroup('1');
            const expected = {
                friendly_name: '123',
            };

            assert.deepEqual(group, expected);
        });

        it('Combine everything! groups and devices from separate file :)', () => {
            const contentConfiguration = {
                devices: 'devices.yaml',
                groups: 'groups.yaml',
            };

            const contentGroups = {
                '1': {
                    friendly_name: '123',
                },
            };

            write(groupsFile, contentGroups);
            write(configurationFile, contentConfiguration);

            const expectedConfiguration = {
                devices: 'devices.yaml',
                groups: 'groups.yaml',
            };

            assert.deepEqual(read(configurationFile), expectedConfiguration);

            settings.addDevice('0x1234');

            assert.deepEqual(read(configurationFile), expectedConfiguration);

            const expectedDevice = {
                '0x1234': {
                    friendly_name: '0x1234',
                    retain: false,
                },
            };

            assert.deepEqual(read(devicesFile), expectedDevice);

            const group = settings.getGroup('1');
            const expectedGroup = {
                friendly_name: '123',
            };

            assert.deepEqual(group, expectedGroup);

            assert.deepEqual(read(configurationFile), expectedConfiguration);

            const expectedDevice2 = {
                friendly_name: '0x1234',
                retain: false,
            };

            assert.deepEqual(settings.getDevice('0x1234'), expectedDevice2);
        });
    });
});
