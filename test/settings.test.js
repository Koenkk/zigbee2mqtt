require('./stub/logger');
require('./stub/data');
const data = require('../lib/util/data.js');
const utils = require('../lib/util/utils.js');
const settings = require('../lib/util/settings.js');
const fs = require('fs');
const configurationFile = data.joinPath('configuration.yaml');
const devicesFile = data.joinPath('devices.yaml');
const groupsFile = data.joinPath('groups.yaml');
const secretFile = data.joinPath('secret.yaml');
const yaml = require('js-yaml');

describe('Settings', () => {
    const write = (file, json, reread=true) => {
        fs.writeFileSync(file, yaml.safeDump(json))
        if (reread) {
            settings._reRead();
        }
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
        const expected = settings._getDefaults();
        expected.devices = {};
        expected.groups = {};
        expect(s).toStrictEqual(expected);
    });

    it('Should return settings', () => {
        write(configurationFile, {permit_join: true});
        const s = settings.get();
        const expected = settings._getDefaults();
        expected.devices = {};
        expected.groups = {};
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
                network_key: '!secret network_key'
            }
        };

        const contentSecret = {
            username: 'mysecretusername',
            password: 'mysecretpassword',
            network_key: [1,2,3],
        };

        write(secretFile, contentSecret, false);
        write(configurationFile, contentConfiguration);

        const expected = {
            include_device_information: false,
            password: "mysecretpassword",
            server: "my.mqtt.server",
            user: "mysecretusername",
        };

        expect(settings.get().mqtt).toStrictEqual(expected);
        expect(settings.get().advanced.network_key).toStrictEqual([1,2,3]);

        settings._write();
        expect(read(configurationFile)).toStrictEqual(contentConfiguration);
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
            optimistic: true,
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
            optimistic: true,
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
            },
        };

        expect(read(devicesFile)).toStrictEqual(expectedDevice);

        const group = settings.getGroup('1');
        const expectedGroup = {
            optimistic: true,
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

    it('Should add groups with specific ID', () => {
        write(configurationFile, {});

        const added = settings.addGroup('test123', 123);
        const expected = {
            '123': {
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
        }).toThrow(new Error("friendly_name 'test123' is already in use"));
        const expected = {
            '1': {
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
        }).toThrow(new Error("group id '123' is already in use"));
        const expected = {
            '123': {
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
        settings.addDeviceToGroup('test123', ['0x123']);
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

        settings.removeDeviceFromGroup('test123', ['0x123']);
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

    it('Should throw error when yaml file is invalid', () => {
        fs.writeFileSync(configurationFile, `
             good: 9
             \t wrong
        `)

        let error;
        try {
            settings._reRead();
        } catch (e) {
            error = e;
        }

        expect(error.message).toContain(`Your YAML file '${configurationFile}' is invalid`);
    });

    it('Should throw error when yaml file does not exist', () => {
        let error;
        try {
            settings._reRead();
        } catch (e) {
            error = e;
        }

        expect(error.message).toContain(`no such file or directory, open`);
    });

    it('Configuration shouldnt be valid when duplicate friendly_name are used', async () => {
        write(configurationFile, {
            devices: {'0x0017880104e45519': {friendly_name: 'myname', retain: false}},
            groups: {'1': {friendly_name: 'myname', retain: false}},
        });

        settings._reRead();

        expect(() => {
            settings.validate();
        }).toThrowError(`Duplicate friendly_name 'myname' found`);
    });

    it('Configuration shouldnt be valid when friendly_name is a postfix', async () => {
        write(configurationFile, {
            devices: {'0x0017880104e45519': {friendly_name: 'left', retain: false}},
        });

        settings._reRead();

        expect(() => {
            settings.validate();
        }).toThrowError(`Following friendly_name are not allowed: '${utils.getPostfixes()}'`);
    });

    it('Configuration shouldnt be valid when duplicate friendly_name are used', async () => {
        write(configurationFile, {
            devices: {
                '0x0017880104e45519': {friendly_name: 'myname', retain: false},
                '0x0017880104e45511': {friendly_name: 'myname1', retain: false}
            },
        });

        settings._reRead();

        expect(() => {
            settings.changeFriendlyName('myname1', 'myname');
        }).toThrowError(`friendly_name 'myname' is already in use`);
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
});
