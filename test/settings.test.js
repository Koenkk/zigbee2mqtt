const chai = require('chai');
const sinon = require('sinon');
const data = require('../lib/util/data');
const proxyquire = require('proxyquire').noPreserveCache();
const settingsProxy = () => proxyquire('../lib/util/settings.js', {});
const tmp = require('tmp');
const path = require('path');
const fs = require('fs');
const yaml = require('js-yaml');
const rimraf = require('rimraf');

describe('Settings', () => {
    let dir = null;
    let settings = null;
    let configurationFile = null;

    const write = (file, json) => {
        fs.writeFileSync(file, yaml.safeDump(json));
    };

    const read = (file) => {
        return yaml.safeLoad(fs.readFileSync(file, 'utf8'));
    };

    const setup = (configuration) => {
        configurationFile = path.join(dir.name, 'configuration.yaml');
        write(configurationFile, configuration);
        settings = settingsProxy();
    };

    beforeEach(() => {
        dir = tmp.dirSync();
        sinon.stub(data, 'joinPath').callsFake((file) => {
            return path.join(dir.name, file);
        });
    });

    afterEach(() => {
        rimraf.sync(dir.name);
        sinon.restore();
    });

    describe('Settings', () => {
        it('Should return default settings', () => {
            setup({});
            const s = settings.get();
            chai.assert.deepEqual(s, settings._getDefaults());
        });

        it('Should return settings', () => {
            setup({permit_join: true});
            const s = settings.get();
            const expected = settings._getDefaults();
            expected.permit_join = true;
            chai.assert.deepEqual(s, expected);
        });

        it('Should add devices', () => {
            setup({});
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

            chai.assert.deepEqual(actual, expected);
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

            setup(content);

            const device = settings.getDevice('0x12345678');
            const expected = {
                friendly_name: '0x12345678',
                retain: false,
            };

            chai.assert.deepEqual(device, expected);
        });

        it('Should read devices form a seperate file', () => {
            const contentConfiguration = {
                devices: 'devices.yaml',
            };

            const contentDevices = {
                '0x12345678': {
                    friendly_name: '0x12345678',
                    retain: false,
                },
            };

            write(path.join(dir.name, 'devices.yaml'), contentDevices);
            setup(contentConfiguration);

            const device = settings.getDevice('0x12345678');
            const expected = {
                friendly_name: '0x12345678',
                retain: false,
            };

            chai.assert.deepEqual(device, expected);
        });

        it('Should add devices to a seperate file', () => {
            const contentConfiguration = {
                devices: 'devices.yaml',
            };

            const contentDevices = {
                '0x12345678': {
                    friendly_name: '0x12345678',
                    retain: false,
                },
            };

            const devicesFile = path.join(dir.name, 'devices.yaml');
            write(devicesFile, contentDevices);
            setup(contentConfiguration);

            settings.addDevice('0x1234');

            chai.assert.deepEqual(read(configurationFile), {devices: 'devices.yaml'});

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

            chai.assert.deepEqual(read(devicesFile), expected);
        });

        it('Should add devices to a seperate file if devices.yaml doesnt exist', () => {
            const contentConfiguration = {
                devices: 'devices.yaml',
            };

            const devicesFile = path.join(dir.name, 'devices.yaml');
            setup(contentConfiguration);

            settings.addDevice('0x1234');

            chai.assert.deepEqual(read(configurationFile), {devices: 'devices.yaml'});

            const expected = {
                '0x1234': {
                    friendly_name: '0x1234',
                    retain: false,
                },
            };

            chai.assert.deepEqual(read(devicesFile), expected);
        });

        it('Should add and remove devices to a seperate file if devices.yaml doesnt exist', () => {
            const contentConfiguration = {
                devices: 'devices.yaml',
            };

            const devicesFile = path.join(dir.name, 'devices.yaml');
            setup(contentConfiguration);

            settings.addDevice('0x1234');
            chai.assert.deepEqual(read(configurationFile), {devices: 'devices.yaml'});

            settings.removeDevice('0x1234');
            chai.assert.deepEqual(read(configurationFile), {devices: 'devices.yaml'});

            chai.assert.deepEqual(read(devicesFile), {});
        });

        it('Should read groups', () => {
            const content = {
                groups: {
                    '1': {
                        friendly_name: '123',
                    },
                },
            };

            setup(content);

            const group = settings.getGroup('1');
            const expected = {
                friendly_name: '123',
            };

            chai.assert.deepEqual(group, expected);
        });

        it('Should read groups form a seperate file', () => {
            const contentConfiguration = {
                groups: 'groups.yaml',
            };

            const contentGroups = {
                '1': {
                    friendly_name: '123',
                },
            };

            write(path.join(dir.name, 'groups.yaml'), contentGroups);
            setup(contentConfiguration);

            const group = settings.getGroup('1');
            const expected = {
                friendly_name: '123',
            };

            chai.assert.deepEqual(group, expected);
        });

        it('Combine everything! groups and devices from separte file :)', () => {
            const contentConfiguration = {
                devices: 'devices.yaml',
                groups: 'groups.yaml',
            };

            const contentGroups = {
                '1': {
                    friendly_name: '123',
                },
            };

            write(path.join(dir.name, 'groups.yaml'), contentGroups);
            setup(contentConfiguration);

            const devicesFile = path.join(dir.name, 'devices.yaml');
            setup(contentConfiguration);

            const expectedConfiguration = {
                devices: 'devices.yaml',
                groups: 'groups.yaml',
            };

            chai.assert.deepEqual(read(configurationFile), expectedConfiguration);

            settings.addDevice('0x1234');

            chai.assert.deepEqual(read(configurationFile), expectedConfiguration);

            const expectedDevice = {
                '0x1234': {
                    friendly_name: '0x1234',
                    retain: false,
                },
            };

            chai.assert.deepEqual(read(devicesFile), expectedDevice);

            const group = settings.getGroup('1');
            const expectedGroup = {
                friendly_name: '123',
            };

            chai.assert.deepEqual(group, expectedGroup);

            chai.assert.deepEqual(read(configurationFile), expectedConfiguration);

            const expectedDevice2 = {
                friendly_name: '0x1234',
                retain: false,
            };

            chai.assert.deepEqual(settings.getDevice('0x1234'), expectedDevice2);
        });
    });
});
