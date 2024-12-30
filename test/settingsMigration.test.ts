// side-effect ensures using mock paths
import * as data from './mocks/data';

import {existsSync, readFileSync, rmSync} from 'node:fs';

import objectAssignDeep from 'object-assign-deep';

import mockedData from '../lib/util/data';
import * as settings from '../lib/util/settings';
import * as settingsMigration from '../lib/util/settingsMigration';

describe('Settings Migration', () => {
    beforeAll(() => {});

    afterAll(() => {
        rmSync(data.mockDir, {recursive: true, force: true});
    });

    beforeEach(() => {
        data.writeDefaultConfiguration();
        settings.reRead();
    });

    afterEach(() => {
        settings.testing.CURRENT_VERSION = settings.CURRENT_VERSION;

        if (settings.get().version === settings.CURRENT_VERSION) {
            // always validate after each test when up to current version (matching current schema)
            expect(settings.validate()).toStrictEqual([]);
        }
    });

    it('Fails on unsupported version', () => {
        settings.set(['version'], 0);

        expect(() => settingsMigration.migrateIfNecessary()).toThrow(
            `Your configuration.yaml has an unsupported version 0, expected one of undefined,2`,
        );

        settings.set(['version'], 99999);

        expect(() => settingsMigration.migrateIfNecessary()).toThrow(
            `Your configuration.yaml has an unsupported version 99999, expected one of undefined,2`,
        );
    });

    describe('Migrates v1 to v2', () => {
        const BASE_CONFIG = {
            homeassistant: false,
            mqtt: {
                base_topic: 'zigbee2mqtt',
                server: 'mqtt://localhost',
            },
            serial: {
                port: '/dev/dummy',
            },
            devices: {
                '0x18fc2600000d7ae2': {
                    friendly_name: 'bosch_radiator',
                },
                '0x000b57fffec6a5b2': {
                    retain: true,
                    friendly_name: 'bulb',
                    description: 'this is my bulb',
                },
                '0x0017880104e45517': {
                    retain: true,
                    friendly_name: 'remote',
                },
                '0x0017880104e45520': {
                    retain: false,
                    friendly_name: 'button',
                },
                '0x0017880104e45521': {
                    retain: false,
                    friendly_name: 'button_double_key',
                },
                '0x0017880104e45522': {
                    qos: 1,
                    retain: false,
                    friendly_name: 'weather_sensor',
                },
                '0x0017880104e45523': {
                    retain: false,
                    friendly_name: 'occupancy_sensor',
                },
                '0x0017880104e45524': {
                    retain: false,
                    friendly_name: 'power_plug',
                },
                '0x0017880104e45530': {
                    retain: false,
                    friendly_name: 'button_double_key_interviewing',
                },
                '0x0017880104e45540': {
                    friendly_name: 'ikea_onoff',
                },
                '0x000b57fffec6a5b7': {
                    retain: false,
                    friendly_name: 'bulb_2',
                },
                '0x000b57fffec6a5b3': {
                    retain: false,
                    friendly_name: 'bulb_color',
                },
                '0x000b57fffec6a5b4': {
                    retain: false,
                    friendly_name: 'bulb_color_2',
                },
                '0x0017880104e45541': {
                    retain: false,
                    friendly_name: 'wall_switch',
                },
                '0x0017880104e45542': {
                    retain: false,
                    friendly_name: 'wall_switch_double',
                },
                '0x0017880104e45543': {
                    retain: false,
                    friendly_name: 'led_controller_1',
                },
                '0x0017880104e45544': {
                    retain: false,
                    friendly_name: 'led_controller_2',
                },
                '0x0017880104e45545': {
                    retain: false,
                    friendly_name: 'dimmer_wall_switch',
                },
                '0x0017880104e45547': {
                    retain: false,
                    friendly_name: 'curtain',
                },
                '0x0017880104e45548': {
                    retain: false,
                    friendly_name: 'fan',
                },
                '0x0017880104e45549': {
                    retain: false,
                    friendly_name: 'siren',
                },
                '0x0017880104e45529': {
                    retain: false,
                    friendly_name: 'unsupported2',
                },
                '0x0017880104e45550': {
                    retain: false,
                    friendly_name: 'thermostat',
                },
                '0x0017880104e45551': {
                    retain: false,
                    friendly_name: 'smart vent',
                },
                '0x0017880104e45552': {
                    retain: false,
                    friendly_name: 'j1',
                },
                '0x0017880104e45553': {
                    retain: false,
                    friendly_name: 'bulb_enddevice',
                },
                '0x0017880104e45559': {
                    retain: false,
                    friendly_name: 'cc2530_router',
                },
                '0x0017880104e45560': {
                    retain: false,
                    friendly_name: 'livolo',
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
                    friendly_name: 'U202DST600ZB',
                },
                '0xf4ce368a38be56a1': {
                    retain: false,
                    friendly_name: 'zigfred_plus',
                    front_surface_enabled: 'true',
                    dimmer_1_enabled: 'true',
                    dimmer_1_dimming_enabled: 'true',
                    dimmer_2_enabled: 'true',
                    dimmer_2_dimming_enabled: 'true',
                    dimmer_3_enabled: 'true',
                    dimmer_3_dimming_enabled: 'true',
                    dimmer_4_enabled: 'true',
                    dimmer_4_dimming_enabled: 'true',
                    cover_1_enabled: 'true',
                    cover_1_tilt_enabled: 'true',
                    cover_2_enabled: 'true',
                    cover_2_tilt_enabled: 'true',
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
                '0x0017882104a44560': {
                    friendly_name: 'TS0601_switch',
                },
                '0x0017882104a44562': {
                    friendly_name: 'TS0601_cover_switch',
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
                },
            },
            groups: {
                1: {
                    friendly_name: 'group_1',
                    retain: false,
                },
                2: {
                    friendly_name: 'group_2',
                    retain: false,
                },
                15071: {
                    friendly_name: 'group_tradfri_remote',
                    retain: false,
                },
                11: {
                    friendly_name: 'group_with_tradfri',
                    retain: false,
                },
                12: {
                    friendly_name: 'thermostat_group',
                    retain: false,
                },
                14: {
                    friendly_name: 'switch_group',
                    retain: false,
                },
                21: {
                    friendly_name: 'gledopto_group',
                },
                9: {
                    friendly_name: 'ha_discovery_group',
                },
            },
        };

        beforeEach(() => {
            settings.testing.CURRENT_VERSION = 2; // stop update after this version
            data.writeDefaultConfiguration(BASE_CONFIG);
            settings.reRead();
        });

        it('no change needed - only add version', () => {
            // @ts-expect-error workaround
            const afterSettings = objectAssignDeep.noMutate({}, settings.getPersistedSettings());
            afterSettings.version = 2;

            settingsMigration.migrateIfNecessary();

            const migratedSettings = settings.getPersistedSettings();

            expect(migratedSettings).toStrictEqual(afterSettings);
        });

        it('remove all', () => {
            // @ts-expect-error workaround
            const beforeSettings = objectAssignDeep.noMutate({}, settings.getPersistedSettings());
            // @ts-expect-error workaround
            const afterSettings = objectAssignDeep.noMutate({}, settings.getPersistedSettings());
            afterSettings.version = 2;

            settings.set(['homeassistant', 'legacy_triggers'], true);
            settings.set(['homeassistant', 'legacy_entity_attributes'], true);
            settings.set(['ota', 'ikea_ota_use_test_url'], true);
            settings.set(['advanced', 'homeassistant_legacy_triggers'], true);
            settings.set(['advanced', 'homeassistant_legacy_entity_attributes'], true);
            settings.set(['permit_join'], true);
            settings.set(['advanced', 'ikea_ota_use_test_url'], true);
            settings.set(['advanced', 'legacy_api'], true);
            settings.set(['advanced', 'legacy_availability_payload'], true);
            settings.set(['advanced', 'soft_reset_timeout'], 12);
            settings.set(['advanced', 'report'], true);
            settings.set(['advanced', 'availability_timeout'], 65);
            settings.set(['advanced', 'availability_blocklist'], ['abcd', 'efgh']);
            settings.set(['advanced', 'availability_passlist'], ['abcd']);
            settings.set(['advanced', 'availability_blacklist'], ['abcd', 'efgh']);
            settings.set(['advanced', 'availability_whitelist'], ['abcd', 'efgh']);
            settings.set(['device_options', 'legacy'], true);
            settings.set(['devices', '0x18fc2600000d7ae2', 'retrieve_state'], true);
            settings.set(['devices', '0x000b57fffec6a5b2', 'retrieve_state'], true);
            settings.set(['groups', '15071', 'retrieve_state'], true);
            settings.set(['groups', '12', 'devices'], ['0x0017880104e45521', '0x0017880104e45524']);
            settings.set(['external_converters'], ['zyx.js']);

            expect(settings.getPersistedSettings()).toStrictEqual(
                // @ts-expect-error workaround
                objectAssignDeep.noMutate(beforeSettings, {
                    permit_join: true,
                    homeassistant: {
                        legacy_triggers: true,
                        legacy_entity_attributes: true,
                    },
                    ota: {ikea_ota_use_test_url: true},
                    advanced: {
                        homeassistant_legacy_triggers: true,
                        homeassistant_legacy_entity_attributes: true,
                        ikea_ota_use_test_url: true,
                        legacy_api: true,
                        legacy_availability_payload: true,
                        soft_reset_timeout: 12,
                        report: true,
                        availability_timeout: 65,
                        availability_blocklist: ['abcd', 'efgh'],
                        availability_passlist: ['abcd'],
                        availability_blacklist: ['abcd', 'efgh'],
                        availability_whitelist: ['abcd', 'efgh'],
                    },
                    device_options: {legacy: true},
                    devices: {
                        '0x18fc2600000d7ae2': {retrieve_state: true},
                        '0x000b57fffec6a5b2': {retrieve_state: true},
                    },
                    groups: {
                        15071: {retrieve_state: true},
                        12: {devices: ['0x0017880104e45521', '0x0017880104e45524']},
                    },
                    external_converters: ['zyx.js'],
                }),
            );

            settingsMigration.migrateIfNecessary();

            const migratedSettings = settings.getPersistedSettings();

            expect(migratedSettings.advanced).toStrictEqual({});
            expect(migratedSettings.device_options).toStrictEqual({});
            expect(migratedSettings.ota).toStrictEqual({});
            expect(migratedSettings.homeassistant).toStrictEqual({});

            // defaults added automatically when pushing to these keys, remove to match against default (verified by above expects)
            migratedSettings.homeassistant = false;
            delete migratedSettings.advanced;
            delete migratedSettings.device_options;
            delete migratedSettings.ota;

            expect(migratedSettings).toStrictEqual(afterSettings);
            expect(existsSync(mockedData.joinPath('configuration_backup_v1.yaml'))).toStrictEqual(true);
            const migrationNotes = mockedData.joinPath('migration-1-to-2.log');
            expect(existsSync(migrationNotes)).toStrictEqual(true);
            const migrationNotesContent = readFileSync(migrationNotes, 'utf8');
            expect(migrationNotesContent).toContain('homeassistant.legacy_triggers');
            expect(migrationNotesContent).toContain('homeassistant.legacy_entity_attributes');
            expect(migrationNotesContent).toContain('ota.ikea_ota_use_test_url');
            expect(migrationNotesContent).toContain('permit_join');
            expect(migrationNotesContent).toContain('advanced.legacy_api');
            expect(migrationNotesContent).toContain('advanced.legacy_availability_payload');
            expect(migrationNotesContent).toContain('advanced.soft_reset_timeout');
            expect(migrationNotesContent).toContain('advanced.report');
            expect(migrationNotesContent).toContain('advanced.availability_timeout');
            expect(migrationNotesContent).toContain('advanced.availability_blocklist');
            expect(migrationNotesContent).toContain('advanced.availability_passlist');
            expect(migrationNotesContent).toContain('advanced.availability_blacklist');
            expect(migrationNotesContent).toContain('advanced.availability_whitelist');
            expect(migrationNotesContent).toContain('device_options.legacy');
            expect(migrationNotesContent).toContain('(devices|groups).xyz.retrieve_state');
            expect(migrationNotesContent).toContain('groups.xyz.devices');
            expect(migrationNotesContent).toContain('External converters are now automatically loaded');
        });

        it('remove partial', () => {
            // @ts-expect-error workaround
            const beforeSettings = objectAssignDeep.noMutate({}, settings.getPersistedSettings());
            // @ts-expect-error workaround
            const afterSettings = objectAssignDeep.noMutate({}, settings.getPersistedSettings());
            afterSettings.version = 2;

            settings.set(['advanced', 'homeassistant_legacy_triggers'], true);
            settings.set(['advanced', 'homeassistant_legacy_entity_attributes'], true);
            settings.set(['permit_join'], true);
            settings.set(['advanced', 'ikea_ota_use_test_url'], true);
            settings.set(['advanced', 'legacy_api'], true);
            settings.set(['advanced', 'legacy_availability_payload'], false);
            settings.set(['advanced', 'soft_reset_timeout'], 16);
            settings.set(['advanced', 'report'], true);
            settings.set(['advanced', 'availability_timeout'], 64);
            settings.set(['advanced', 'availability_passlist'], []);
            settings.set(['device_options', 'legacy'], true);
            settings.set(['groups', '12', 'devices'], ['0x0017880104e45521', '0x0017880104e45524']);

            // console.log(JSON.stringify(settings.getWrittenSettings(), undefined, 2));

            expect(settings.getPersistedSettings()).toStrictEqual(
                // @ts-expect-error workaround
                objectAssignDeep.noMutate(beforeSettings, {
                    permit_join: true,
                    advanced: {
                        homeassistant_legacy_triggers: true,
                        homeassistant_legacy_entity_attributes: true,
                        ikea_ota_use_test_url: true,
                        legacy_api: true,
                        legacy_availability_payload: false,
                        soft_reset_timeout: 16,
                        report: true,
                        availability_timeout: 64,
                        availability_passlist: [],
                    },
                    device_options: {legacy: true},
                    groups: {12: {devices: ['0x0017880104e45521', '0x0017880104e45524']}},
                }),
            );

            settingsMigration.migrateIfNecessary();

            const migratedSettings = settings.getPersistedSettings();

            expect(migratedSettings.advanced).toStrictEqual({});
            expect(migratedSettings.device_options).toStrictEqual({});

            // defaults added automatically when pushing to these keys, remove to match against default (verified by above expects)
            migratedSettings.homeassistant = false;
            delete migratedSettings.advanced;
            delete migratedSettings.device_options;

            expect(migratedSettings).toStrictEqual(afterSettings);
            expect(existsSync(mockedData.joinPath('configuration_backup_v1.yaml'))).toStrictEqual(true);
            const migrationNotes = mockedData.joinPath('migration-1-to-2.log');
            expect(existsSync(migrationNotes)).toStrictEqual(true);
            const migrationNotesContent = readFileSync(migrationNotes, 'utf8');
            expect(migrationNotesContent).toContain('homeassistant.legacy_triggers');
            expect(migrationNotesContent).toContain('homeassistant.legacy_entity_attributes');
            expect(migrationNotesContent).toContain('ota.ikea_ota_use_test_url');
            expect(migrationNotesContent).toContain('permit_join');
            expect(migrationNotesContent).toContain('advanced.legacy_api');
            expect(migrationNotesContent).not.toContain('advanced.legacy_availability_payload'); // was false, no impact
            expect(migrationNotesContent).toContain('advanced.soft_reset_timeout');
            expect(migrationNotesContent).toContain('advanced.report');
            expect(migrationNotesContent).toContain('advanced.availability_timeout');
            expect(migrationNotesContent).not.toContain('advanced.availability_blocklist');
            expect(migrationNotesContent).not.toContain('advanced.availability_passlist'); // empty array
            expect(migrationNotesContent).not.toContain('advanced.availability_blacklist');
            expect(migrationNotesContent).not.toContain('advanced.availability_whitelist');
            expect(migrationNotesContent).toContain('device_options.legacy');
            expect(migrationNotesContent).not.toContain('(devices|groups).xyz.retrieve_state');
            expect(migrationNotesContent).toContain('groups.xyz.devices');
        });

        it('changes log_level', () => {
            // @ts-expect-error workaround
            const beforeSettings = objectAssignDeep.noMutate({}, settings.getPersistedSettings());
            // @ts-expect-error workaround
            const afterSettings = objectAssignDeep.noMutate({}, settings.getPersistedSettings());
            afterSettings.version = 2;
            afterSettings.advanced = {log_level: 'warning'};

            settings.set(['advanced', 'log_level'], 'warn');

            // console.log(JSON.stringify(settings.getWrittenSettings(), undefined, 2));

            expect(settings.getPersistedSettings()).toStrictEqual(
                // @ts-expect-error workaround
                objectAssignDeep.noMutate(beforeSettings, {
                    advanced: {
                        log_level: 'warn',
                    },
                }),
            );

            settingsMigration.migrateIfNecessary();

            const migratedSettings = settings.getPersistedSettings();

            expect(migratedSettings).toStrictEqual(afterSettings);
            expect(existsSync(mockedData.joinPath('configuration_backup_v1.yaml'))).toStrictEqual(true);
            const migrationNotes = mockedData.joinPath('migration-1-to-2.log');
            expect(existsSync(migrationNotes)).toStrictEqual(true);
            const migrationNotesContent = readFileSync(migrationNotes, 'utf8');
            expect(migrationNotesContent).toContain(`Log level 'warn' has been renamed to 'warning'.`);
        });

        it('does not changes already migrated log_level', () => {
            // @ts-expect-error workaround
            const beforeSettings = objectAssignDeep.noMutate({}, settings.getPersistedSettings());
            // @ts-expect-error workaround
            const afterSettings = objectAssignDeep.noMutate({}, settings.getPersistedSettings());
            afterSettings.version = 2;
            afterSettings.advanced = {log_level: 'warning'};

            settings.set(['advanced', 'log_level'], 'warning');

            // console.log(JSON.stringify(settings.getWrittenSettings(), undefined, 2));

            expect(settings.getPersistedSettings()).toStrictEqual(
                // @ts-expect-error workaround
                objectAssignDeep.noMutate(beforeSettings, {
                    advanced: {
                        log_level: 'warning',
                    },
                }),
            );

            settingsMigration.migrateIfNecessary();

            const migratedSettings = settings.getPersistedSettings();

            expect(migratedSettings).toStrictEqual(afterSettings);
            expect(existsSync(mockedData.joinPath('configuration_backup_v1.yaml'))).toStrictEqual(true);
            const migrationNotes = mockedData.joinPath('migration-1-to-2.log');
            expect(existsSync(migrationNotes)).toStrictEqual(true);
            const migrationNotesContent = readFileSync(migrationNotes, 'utf8');
            expect(migrationNotesContent).not.toContain(`Log level 'warn' has been renamed to 'warning'.`);
        });

        it('does not changes other log_level', () => {
            // @ts-expect-error workaround
            const beforeSettings = objectAssignDeep.noMutate({}, settings.getPersistedSettings());
            // @ts-expect-error workaround
            const afterSettings = objectAssignDeep.noMutate({}, settings.getPersistedSettings());
            afterSettings.version = 2;
            afterSettings.advanced = {log_level: 'info'};

            settings.set(['advanced', 'log_level'], 'info');

            // console.log(JSON.stringify(settings.getWrittenSettings(), undefined, 2));

            expect(settings.getPersistedSettings()).toStrictEqual(
                // @ts-expect-error workaround
                objectAssignDeep.noMutate(beforeSettings, {
                    advanced: {
                        log_level: 'info',
                    },
                }),
            );

            settingsMigration.migrateIfNecessary();

            const migratedSettings = settings.getPersistedSettings();

            expect(migratedSettings).toStrictEqual(afterSettings);
            expect(existsSync(mockedData.joinPath('configuration_backup_v1.yaml'))).toStrictEqual(true);
            const migrationNotes = mockedData.joinPath('migration-1-to-2.log');
            expect(existsSync(migrationNotes)).toStrictEqual(true);
            const migrationNotesContent = readFileSync(migrationNotes, 'utf8');
            expect(migrationNotesContent).not.toContain(`Log level 'warn' has been renamed to 'warning'.`);
        });

        it('transfer all', () => {
            // @ts-expect-error workaround
            const beforeSettings = objectAssignDeep.noMutate({}, settings.getPersistedSettings());
            // @ts-expect-error workaround
            const afterSettings = objectAssignDeep.noMutate({}, settings.getPersistedSettings());
            afterSettings.version = 2;
            afterSettings.advanced = {
                transmit_power: 12,
                output: 'attribute',
            };
            afterSettings.serial.baudrate = 115200;
            afterSettings.serial.rtscts = true;
            afterSettings.blocklist = ['abcd'];
            afterSettings.passlist = ['efgh'];
            afterSettings.homeassistant = {
                discovery_topic: 'ha_disc',
                status_topic: 'ha_stat',
            };
            // Here, the `experimental` section is also explicitly removed after the transfer, so the empty object is gone
            // afterSettings.experimental = {}; // caused by pushing to key and removing all

            settings.set(['advanced', 'homeassistant_discovery_topic'], 'ha_disc');
            settings.set(['advanced', 'homeassistant_status_topic'], 'ha_stat');
            settings.set(['advanced', 'baudrate'], 115200);
            settings.set(['advanced', 'rtscts'], true); // only deleted since also below
            settings.set(['serial', 'rtscts'], true);
            settings.set(['experimental', 'transmit_power'], 12);
            settings.set(['experimental', 'output'], 'attribute');
            settings.set(['ban'], ['abcd']);
            settings.set(['whitelist'], ['efgh']);

            // console.log(JSON.stringify(settings.getWrittenSettings(), undefined, 2));

            expect(settings.getPersistedSettings()).toStrictEqual(
                // @ts-expect-error workaround
                objectAssignDeep.noMutate(beforeSettings, {
                    advanced: {
                        homeassistant_discovery_topic: 'ha_disc',
                        homeassistant_status_topic: 'ha_stat',
                        baudrate: 115200,
                        rtscts: true,
                    },
                    serial: {
                        rtscts: true,
                    },
                    experimental: {
                        transmit_power: 12,
                        output: 'attribute',
                    },
                    ban: ['abcd'],
                    whitelist: ['efgh'],
                }),
            );

            settingsMigration.migrateIfNecessary();

            const migratedSettings = settings.getPersistedSettings();

            expect(migratedSettings).toStrictEqual(afterSettings);
            expect(existsSync(mockedData.joinPath('configuration_backup_v1.yaml'))).toStrictEqual(true);
            const migrationNotes = mockedData.joinPath('migration-1-to-2.log');
            expect(existsSync(migrationNotes)).toStrictEqual(true);
            const migrationNotesContent = readFileSync(migrationNotes, 'utf8');
            expect(migrationNotesContent).toContain(
                `HA discovery_topic was moved from advanced.homeassistant_discovery_topic to homeassistant.discovery_topic.`,
            );
            expect(migrationNotesContent).toContain(
                `HA status_topic was moved from advanced.homeassistant_status_topic to homeassistant.status_topic.`,
            );
            expect(migrationNotesContent).toContain(`Baudrate was moved from advanced.baudrate to serial.baudrate.`);
            expect(migrationNotesContent).toContain(`RTSCTS was moved from advanced.rtscts to serial.rtscts.`);
            expect(migrationNotesContent).toContain(`Transmit power was moved from experimental.transmit_power to advanced.transmit_power.`);
            expect(migrationNotesContent).toContain(`Output was moved from experimental.output to advanced.output.`);
            expect(migrationNotesContent).toContain(`ban was renamed to passlist.`);
            expect(migrationNotesContent).toContain(`whitelist was renamed to passlist.`);
            expect(migrationNotesContent).toContain(`The entire experimental section was removed.`);
        });

        it('transfer partial', () => {
            // @ts-expect-error workaround
            const beforeSettings = objectAssignDeep.noMutate({}, settings.getPersistedSettings());
            // @ts-expect-error workaround
            const afterSettings = objectAssignDeep.noMutate({}, settings.getPersistedSettings());
            afterSettings.version = 2;
            afterSettings.advanced = {}; // caused by pushing to key and removing all
            afterSettings.serial.baudrate = 115200;
            afterSettings.serial.rtscts = true;
            afterSettings.blocklist = ['abcd', 'efgh'];
            afterSettings.homeassistant = {
                discovery_topic: 'ha_disc_newer', // keeps the newer value, just removes the old path
            };

            settings.set(['homeassistant', 'discovery_topic'], 'ha_disc_newer');
            settings.set(['advanced', 'homeassistant_discovery_topic'], 'ha_disc');
            settings.set(['advanced', 'baudrate'], 115200);
            settings.set(['advanced', 'rtscts'], true); // only deleted since also below
            settings.set(['serial', 'rtscts'], true);
            settings.set(['ban'], ['abcd']);
            settings.set(['blocklist'], ['efgh']);

            // console.log(JSON.stringify(settings.getWrittenSettings(), undefined, 2));

            expect(settings.getPersistedSettings()).toStrictEqual(
                // @ts-expect-error workaround
                objectAssignDeep.noMutate(beforeSettings, {
                    homeassistant: {discovery_topic: 'ha_disc_newer'},
                    advanced: {
                        homeassistant_discovery_topic: 'ha_disc',
                        baudrate: 115200,
                        rtscts: true,
                    },
                    serial: {
                        rtscts: true,
                    },
                    ban: ['abcd'],
                    blocklist: ['efgh'],
                }),
            );

            settingsMigration.migrateIfNecessary();

            const migratedSettings = settings.getPersistedSettings();

            expect(migratedSettings).toStrictEqual(afterSettings);
            expect(existsSync(mockedData.joinPath('configuration_backup_v1.yaml'))).toStrictEqual(true);
            const migrationNotes = mockedData.joinPath('migration-1-to-2.log');
            expect(existsSync(migrationNotes)).toStrictEqual(true);
            const migrationNotesContent = readFileSync(migrationNotes, 'utf8');
            expect(migrationNotesContent).toContain(`[TRANSFER] Baudrate was moved from advanced.baudrate to serial.baudrate.`);
            expect(migrationNotesContent).toContain(`[REMOVAL] RTSCTS was moved from advanced.rtscts to serial.rtscts.`);
            expect(migrationNotesContent).toContain(`[TRANSFER] ban was renamed to passlist.`);
        });
    });

    describe('Migrates v1 to v3', () => {
        const BASE_CONFIG = {
            mqtt: {
                server: 'mqtt://localhost',
            },
        };

        beforeEach(() => {
            settings.testing.CURRENT_VERSION = 3; // stop update after this version
            data.writeDefaultConfiguration(BASE_CONFIG);
            settings.reRead();
        });

        it('Update', () => {
            // @ts-expect-error workaround
            const beforeSettings = objectAssignDeep.noMutate({}, settings.getPersistedSettings());
            // @ts-expect-error workaround
            const afterSettings = objectAssignDeep.noMutate({}, settings.getPersistedSettings());
            afterSettings.version = 3;
            afterSettings.homeassistant = {enabled: false};
            afterSettings.frontend = {enabled: true};
            afterSettings.availability = {enabled: true, active: {timeout: 15}};
            afterSettings.advanced = {
                log_level: 'warning',
                transmit_power: 12,
            };

            settings.set(['homeassistant'], false);
            settings.set(['frontend'], true);
            settings.set(['availability'], {active: {timeout: 15}});
            settings.set(['permit_join'], true);
            settings.set(['advanced', 'log_level'], 'warn');
            settings.set(['experimental', 'transmit_power'], 12);

            expect(settings.getPersistedSettings()).toStrictEqual(
                // @ts-expect-error workaround
                objectAssignDeep.noMutate(beforeSettings, {
                    homeassistant: false,
                    frontend: true,
                    availability: {active: {timeout: 15}},
                    permit_join: true,
                    advanced: {log_level: 'warn'},
                    experimental: {transmit_power: 12},
                }),
            );

            settingsMigration.migrateIfNecessary();

            const migratedSettings = settings.getPersistedSettings();

            expect(migratedSettings).toStrictEqual(afterSettings);
        });
    });

    describe('Migrates v2 to v3', () => {
        const BASE_CONFIG = {
            version: 2,
            mqtt: {
                server: 'mqtt://localhost',
            },
        };

        beforeEach(() => {
            settings.testing.CURRENT_VERSION = 3; // stop update after this version
            data.writeDefaultConfiguration(BASE_CONFIG);
            settings.reRead();
        });

        it('Update', () => {
            // @ts-expect-error workaround
            const beforeSettings = objectAssignDeep.noMutate({}, settings.getPersistedSettings());
            // @ts-expect-error workaround
            const afterSettings = objectAssignDeep.noMutate({}, settings.getPersistedSettings());
            afterSettings.version = 3;
            afterSettings.homeassistant = {enabled: false};
            afterSettings.frontend = {enabled: true};
            afterSettings.availability = {enabled: true, active: {timeout: 15}};

            settings.set(['homeassistant'], false);
            settings.set(['frontend'], true);
            settings.set(['availability'], {active: {timeout: 15}});

            expect(settings.getPersistedSettings()).toStrictEqual(
                // @ts-expect-error workaround
                objectAssignDeep.noMutate(beforeSettings, {
                    homeassistant: false,
                    frontend: true,
                    availability: {active: {timeout: 15}},
                }),
            );

            settingsMigration.migrateIfNecessary();

            const migratedSettings = settings.getPersistedSettings();

            expect(migratedSettings).toStrictEqual(afterSettings);
            const migrationNotes = mockedData.joinPath('migration-2-to-3.log');
            expect(existsSync(migrationNotes)).toStrictEqual(true);
            const migrationNotesContent = readFileSync(migrationNotes, 'utf8');
            expect(migrationNotesContent).toContain(`[SPECIAL] Property 'homeassistant' is now always an object.`);
            expect(migrationNotesContent).toContain(`[SPECIAL] Property 'frontend' is now always an object.`);
            expect(migrationNotesContent).toContain(`[SPECIAL] Property 'availability' is now always an object.`);
        });

        it('Update when not set, tests that frontend/availability is not added when not set', () => {
            // @ts-expect-error workaround
            const beforeSettings = objectAssignDeep.noMutate({}, settings.getPersistedSettings());
            // @ts-expect-error workaround
            const afterSettings = objectAssignDeep.noMutate({}, settings.getPersistedSettings());
            afterSettings.version = 3;
            afterSettings.homeassistant = {enabled: false};

            settings.set(['homeassistant'], false);

            expect(settings.getPersistedSettings()).toStrictEqual(
                // @ts-expect-error workaround
                objectAssignDeep.noMutate(beforeSettings, {
                    homeassistant: false,
                }),
            );

            settingsMigration.migrateIfNecessary();

            const migratedSettings = settings.getPersistedSettings();

            expect(migratedSettings).toStrictEqual(afterSettings);
            const migrationNotes = mockedData.joinPath('migration-2-to-3.log');
            expect(existsSync(migrationNotes)).toStrictEqual(true);
            const migrationNotesContent = readFileSync(migrationNotes, 'utf8');
            expect(migrationNotesContent).toContain(`[SPECIAL] Property 'homeassistant' is now always an object.`);
            expect(migrationNotesContent).not.toContain(`[SPECIAL] Property 'frontend' is now always an object.`);
            expect(migrationNotesContent).not.toContain(`[SPECIAL] Property 'availability' is now always an object.`);
        });
    });

    describe('Migrates v3 to v4', () => {
        const BASE_CONFIG = {
            version: 3,
            mqtt: {
                server: 'mqtt://localhost',
            },
        };

        beforeEach(() => {
            settings.testing.CURRENT_VERSION = 4; // stop update after this version
            data.writeDefaultConfiguration(BASE_CONFIG);
            settings.reRead();
        });

        it('Update', () => {
            // @ts-expect-error workaround
            const beforeSettings = objectAssignDeep.noMutate({}, settings.getPersistedSettings());
            // @ts-expect-error workaround
            const afterSettings = objectAssignDeep.noMutate({}, settings.getPersistedSettings());
            afterSettings.version = 4;
            afterSettings.devices = {
                '0x123127fffe8d96bc': {
                    friendly_name: '0x847127fffe8d96bc',
                    icon: 'device_icons/08a9016bbc0657cf5f581ae9c19c31a5.png',
                },
                '0x223127fffe8d96bc': {
                    friendly_name: '0x223127fffe8d96bc',
                    icon: 'device_icons/effcad234beeb56ea7c457cf2d36d10b.png',
                },
                '0x323127fffe8d96bc': {
                    friendly_name: '0x323127fffe8d96bc',
                },
            };

            settings.set(['devices'], {
                '0x123127fffe8d96bc': {
                    friendly_name: '0x847127fffe8d96bc',
                    icon: 'device_icons/08a9016bbc0657cf5f581ae9c19c31a5.png',
                },
                '0x223127fffe8d96bc': {
                    friendly_name: '0x223127fffe8d96bc',
                    icon: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAJ',
                },
                '0x323127fffe8d96bc': {
                    friendly_name: '0x323127fffe8d96bc',
                },
            });

            expect(settings.getPersistedSettings()).toStrictEqual(
                // @ts-expect-error workaround
                objectAssignDeep.noMutate(beforeSettings, {
                    devices: {
                        '0x123127fffe8d96bc': {
                            friendly_name: '0x847127fffe8d96bc',
                            icon: 'device_icons/08a9016bbc0657cf5f581ae9c19c31a5.png',
                        },
                        '0x223127fffe8d96bc': {
                            friendly_name: '0x223127fffe8d96bc',
                            icon: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAJ',
                        },
                        '0x323127fffe8d96bc': {
                            friendly_name: '0x323127fffe8d96bc',
                        },
                    },
                }),
            );

            settingsMigration.migrateIfNecessary();

            const migratedSettings = settings.getPersistedSettings();

            expect(migratedSettings).toStrictEqual(afterSettings);
            const migrationNotes = mockedData.joinPath('migration-3-to-4.log');
            expect(existsSync(migrationNotes)).toStrictEqual(true);
            const migrationNotesContent = readFileSync(migrationNotes, 'utf8');
            expect(migrationNotesContent).toContain(`[SPECIAL] Device icons are now saved as images.`);
        });
    });
});
