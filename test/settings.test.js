require('./stub/logger');
require('./stub/data');
const data = require('../lib/util/data.js');
const settings = require('../lib/util/settings.js');
const fs = require('fs');
const configurationFile = data.joinPath('configuration.yaml');
const devicesFile = data.joinPath('devices.yaml');
const groupsFile = data.joinPath('groups.yaml');
const yaml = require('js-yaml');

describe('Settings', () => {
    const write = (file, json) => {
        fs.writeFileSync(file, yaml.safeDump(json))
        settings._reRead();
    };
    const read = (file) => yaml.safeLoad(fs.readFileSync(file, 'utf8'));
    const remove = (file) => {
        if (fs.existsSync(file)) fs.unlinkSync(file);
    }

    beforeEach(() => {
        remove(configurationFile);
        remove(devicesFile);
        remove(groupsFile);
    });

    it('Should return default settings', () => {
        write(configurationFile, {});
        const s = settings.get();
        expect(s).toStrictEqual(settings._getDefaults());
    });

    it('Should return settings', () => {
        write(configurationFile, {permit_join: true});
        const s = settings.get();
        const expected = settings._getDefaults();
        expected.permit_join = true;
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
                    retain: false,
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
            ID: "0x12345678",
            friendlyName: "0x12345678",
            friendly_name: '0x12345678',
            retain: false,
        };

        expect(device).toStrictEqual(expected);
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
            ID: "0x12345678",
            friendlyName: "0x12345678",
            friendly_name: '0x12345678',
            retain: false,
        };

        expect(device).toStrictEqual(expected);
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
                retain: false,
            },
        };

        expect(read(devicesFile)).toStrictEqual(expected);
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
                retain: false,
            },
        };

        expect(read(devicesFile)).toStrictEqual(expected);
    }
    );

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
    }
    );

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
            ID: 1,
            friendlyName: '123',
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
            '1': {
                friendly_name: '123',
            },
        };

        write(configurationFile, contentConfiguration);
        write(groupsFile, contentGroups);

        const group = settings.getGroup('1');
        const expected = {
            ID: 1,
            friendlyName: '123',
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
            '1': {
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
                retain: false,
            },
        };

        expect(read(devicesFile)).toStrictEqual(expectedDevice);

        const group = settings.getGroup('1');
        const expectedGroup = {
            ID: 1,
            friendlyName: '123',
            friendly_name: '123',
            devices: [],
        };

        expect(group).toStrictEqual(expectedGroup);

        expect(read(configurationFile)).toStrictEqual(expectedConfiguration);

        const expectedDevice2 = {
            ID: '0x1234',
            friendlyName: '0x1234',
            friendly_name: '0x1234',
            retain: false,
        };

        expect(settings.getDevice('0x1234')).toStrictEqual(expectedDevice2);
    });

    it('Should add groups', () => {
        write(configurationFile, {});

        const added = settings.addGroup('test123');
        const expected = {
            '1': {
                friendly_name: 'test123',
            },
        };

        expect(settings.get().groups).toStrictEqual(expected);
    });

    it('Should not add duplicate groups', () => {
        write(configurationFile, {});

        settings.addGroup('test123');
        expect(() => {
            settings.addGroup('test123');
        }).toThrow(new Error("Group 'test123' already exists"));
        const expected = {
            '1': {
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
                }
            }
        });

        settings.addGroup('test123');
        settings.addDeviceToGroup('test123', 'bulb');
        settings.addDeviceToGroup('test123', 'bulb');
        const expected = {
            '1': {
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
                }
            },
            groups: {
                '1': {
                    friendly_name: 'test123',
                    devices: ['0x123'],
                }
            }
        });

        settings.removeDeviceFromGroup('test123', 'bulb');
        settings.removeDeviceFromGroup('test123', 'bulb');
        const expected = {
            '1': {
                friendly_name: 'test123',
                devices: [],
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
                }
            },
        });

        expect(() => {
            settings.removeDeviceFromGroup('test123', 'bulb')
        }).toThrow(new Error("Group 'test123' does not exist"));
    });

    it('Should throw when adding device which already exists', () => {
        write(configurationFile, {
            devices: {
                '0x123': {
                    friendly_name: 'bulb',
                    retain: true,
                }
            },
        });

        expect(() => {
            settings.addDevice('0x123')
        }).toThrow(new Error("Device '0x123' already exists"));
    });

    it('Should ban devices', () => {
        write(configurationFile, {});
        settings.banDevice('0x123');
        expect(settings.get().ban).toStrictEqual(['0x123']);
        settings.banDevice('0x1234');
        expect(settings.get().ban).toStrictEqual(['0x123', '0x1234']);
    });
});
