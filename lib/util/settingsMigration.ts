import {copyFileSync, writeFileSync} from 'node:fs';

import data from './data';
import * as settings from './settings';
import utils from './utils';

interface SettingsMigration {
    path: string[];
    note: string;
    noteIf?: (previousValue: unknown) => boolean;
}

interface SettingsAdd extends Omit<SettingsMigration, 'noteIf'> {
    value: unknown;
}

type SettingsRemove = SettingsMigration;

interface SettingsChange extends SettingsMigration {
    previousValueAnyOf?: unknown[];
    newValue: unknown;
}

interface SettingsTransfer extends SettingsMigration {
    newPath: string[];
}

interface SettingsCustomHandler extends Omit<SettingsMigration, 'path'> {
    execute: (currentSettings: Partial<Settings>) => [validPath: boolean, previousValue: unknown, changed: boolean];
}

const SUPPORTED_VERSIONS: Settings['version'][] = [undefined, 2, 3, settings.CURRENT_VERSION];

function backupSettings(version: number): void {
    const filePath = data.joinPath('configuration.yaml');

    copyFileSync(filePath, filePath.replace('.yaml', `_backup_v${version}.yaml`));
}

/**
 * Set the given path in given settings to given value. If requested, create path.
 *
 * @param currentSettings
 * @param path
 * @param value
 * @param createPathIfNotExist
 * @returns Returns true if value was set, false if not.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function setValue(currentSettings: any, path: string[], value: unknown, createPathIfNotExist: boolean = false): boolean {
    for (let i = 0; i < path.length; i++) {
        const key = path[i];

        if (i === path.length - 1) {
            currentSettings[key] = value;
        } else {
            if (!currentSettings[key]) {
                if (createPathIfNotExist) {
                    currentSettings[key] = {};
                    /* v8 ignore start */
                } else {
                    // invalid path
                    // ignored in test since currently call is always guarded by get-validated path, so this is never reached
                    return false;
                }
                /* v8 ignore stop */
            }

            currentSettings = currentSettings[key];
        }
    }

    return true;
}

/**
 * Get the value at the given path in given settings.
 *
 * @param currentSettings
 * @param path
 * @returns
 *   - true if path was valid
 *   - the value at path
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getValue(currentSettings: any, path: string[]): [validPath: boolean, value: unknown] {
    for (let i = 0; i < path.length; i++) {
        const key = path[i];
        const value = currentSettings[key];

        if (i === path.length - 1) {
            return [value !== undefined, value];
        } else {
            if (!value) {
                // invalid path
                break;
            }

            currentSettings = value;
        }
    }

    return [false, undefined];
}

/**
 * Add a value at given path, path is created as needed.
 * @param currentSettings
 * @param addition
 */
function addValue(currentSettings: Partial<Settings>, addition: SettingsAdd): void {
    setValue(currentSettings, addition.path, addition.value, true);
}

/**
 * Remove value at given path, if path is valid.
 * Value is actually set to undefined, which triggers removal when `settings.apply` is called.
 * @param currentSettings
 * @param removal
 * @returns
 */
function removeValue(currentSettings: Partial<Settings>, removal: SettingsRemove): [validPath: boolean, previousValue: unknown] {
    const [validPath, previousValue] = getValue(currentSettings, removal.path);

    if (validPath && previousValue != undefined) {
        setValue(currentSettings, removal.path, undefined);
    }

    return [validPath, previousValue];
}

/**
 * Change value at given path, if path is valid, and value matched one of the defined values (if any).
 * @param currentSettings
 * @param change
 * @returns
 */
function changeValue(currentSettings: Partial<Settings>, change: SettingsChange): [validPath: boolean, previousValue: unknown, changed: boolean] {
    const [validPath, previousValue] = getValue(currentSettings, change.path);
    let changed: boolean = false;

    if (validPath && previousValue !== change.newValue) {
        if (!change.previousValueAnyOf || change.previousValueAnyOf.includes(previousValue)) {
            setValue(currentSettings, change.path, change.newValue);

            changed = true;
        }
    }

    return [validPath, previousValue, changed];
}

/**
 * Transfer value at given path, to new path.
 * Given path must be valid.
 * New path must not be valid or new path value must be nullish, otherwise given path is removed only.
 * Value at given path is actually set to undefined, which triggers removal when `settings.apply` is called.
 * New path is created as needed.
 * @param currentSettings
 * @param transfer
 * @returns
 */
function transferValue(
    currentSettings: Partial<Settings>,
    transfer: SettingsTransfer,
): [validPath: boolean, previousValue: unknown, transfered: boolean] {
    const [validPath, previousValue] = getValue(currentSettings, transfer.path);
    const [destValidPath, destValue] = getValue(currentSettings, transfer.newPath);
    const transfered = validPath && previousValue != undefined && (!destValidPath || destValue == undefined || Array.isArray(destValue));

    // no point in set if already undefined
    if (validPath && previousValue != undefined) {
        setValue(currentSettings, transfer.path, undefined);
    }

    if (transfered) {
        if (Array.isArray(previousValue) && Array.isArray(destValue)) {
            setValue(currentSettings, transfer.newPath, [...previousValue, ...destValue], true);
        } else {
            setValue(currentSettings, transfer.newPath, previousValue, true);
        }
    }

    return [validPath, previousValue, transfered];
}

const noteIfWasTrue = (previousValue: unknown): boolean => previousValue === true;
const noteIfWasDefined = (previousValue: unknown): boolean => previousValue != undefined;
const noteIfWasNonEmptyArray = (previousValue: unknown): boolean => Array.isArray(previousValue) && previousValue.length > 0;

function migrateToTwo(
    currentSettings: Partial<Settings>,
    transfers: SettingsTransfer[],
    changes: SettingsChange[],
    additions: SettingsAdd[],
    removals: SettingsRemove[],
    customHandlers: SettingsCustomHandler[],
): void {
    transfers.push(
        {
            path: ['advanced', 'homeassistant_discovery_topic'],
            note: `HA discovery_topic was moved from advanced.homeassistant_discovery_topic to homeassistant.discovery_topic.`,
            noteIf: noteIfWasDefined,
            newPath: ['homeassistant', 'discovery_topic'],
        },
        {
            path: ['advanced', 'homeassistant_status_topic'],
            note: `HA status_topic was moved from advanced.homeassistant_status_topic to homeassistant.status_topic.`,
            noteIf: noteIfWasDefined,
            newPath: ['homeassistant', 'status_topic'],
        },
        {
            path: ['advanced', 'baudrate'],
            note: `Baudrate was moved from advanced.baudrate to serial.baudrate.`,
            noteIf: noteIfWasDefined,
            newPath: ['serial', 'baudrate'],
        },
        {
            path: ['advanced', 'rtscts'],
            note: `RTSCTS was moved from advanced.rtscts to serial.rtscts.`,
            noteIf: noteIfWasDefined,
            newPath: ['serial', 'rtscts'],
        },
        {
            path: ['experimental', 'transmit_power'],
            note: `Transmit power was moved from experimental.transmit_power to advanced.transmit_power.`,
            noteIf: noteIfWasDefined,
            newPath: ['advanced', 'transmit_power'],
        },
        {
            path: ['experimental', 'output'],
            note: `Output was moved from experimental.output to advanced.output.`,
            noteIf: noteIfWasDefined,
            newPath: ['advanced', 'output'],
        },
        {
            path: ['ban'],
            note: `ban was renamed to passlist.`,
            noteIf: noteIfWasDefined,
            newPath: ['blocklist'],
        },
        {
            path: ['whitelist'],
            note: `whitelist was renamed to passlist.`,
            noteIf: noteIfWasDefined,
            newPath: ['passlist'],
        },
    );

    changes.push({
        path: ['advanced', 'log_level'],
        note: `Log level 'warn' has been renamed to 'warning'.`,
        noteIf: (previousValue): boolean => previousValue === 'warn',
        previousValueAnyOf: ['warn'],
        newValue: 'warning',
    });

    additions.push({
        path: ['version'],
        note: `Migrated settings to version 2`,
        value: 2,
    });

    const haLegacyTriggers: SettingsRemove = {
        path: ['homeassistant', 'legacy_triggers'],
        note: `Action and click sensors have been removed (homeassistant.legacy_triggers setting). This means all sensor.*_action and sensor.*_click entities are removed. Use the MQTT device trigger instead.`,
        noteIf: noteIfWasTrue,
    };
    const haLegacyEntityAttrs: SettingsRemove = {
        path: ['homeassistant', 'legacy_entity_attributes'],
        note: `Entity attributes (homeassistant.legacy_entity_attributes setting) has been removed. This means that entities discovered by Zigbee2MQTT will no longer have entity attributes (Home Assistant entity attributes are accessed via e.g. states.binary_sensor.my_sensor.attributes).`,
        noteIf: noteIfWasTrue,
    };
    const otaIkeaUseTestUrl: SettingsRemove = {
        path: ['ota', 'ikea_ota_use_test_url'],
        note: `Due to the OTA rework, the ota.ikea_ota_use_test_url option has been removed.`,
        noteIf: noteIfWasTrue,
    };

    removals.push(
        haLegacyTriggers,
        haLegacyEntityAttrs,
        {
            path: ['advanced', 'homeassistant_legacy_triggers'],
            note: haLegacyTriggers.note,
            noteIf: haLegacyTriggers.noteIf,
        },
        {
            path: ['advanced', 'homeassistant_legacy_entity_attributes'],
            note: haLegacyEntityAttrs.note,
            noteIf: haLegacyEntityAttrs.noteIf,
        },
        {
            path: ['permit_join'],
            note: `The permit_join setting has been removed, use the frontend or MQTT to permit joining.`,
            noteIf: noteIfWasTrue,
        },
        otaIkeaUseTestUrl,
        {
            path: ['advanced', 'ikea_ota_use_test_url'],
            note: otaIkeaUseTestUrl.note,
            noteIf: otaIkeaUseTestUrl.noteIf,
        },
        {
            path: ['advanced', 'legacy_api'],
            note: `The MQTT legacy API has been removed (advanced.legacy_api setting). See link below for affected topics.`,
            noteIf: noteIfWasTrue,
        },
        {
            path: ['advanced', 'legacy_availability_payload'],
            note: `Due to the removal of advanced.legacy_availability_payload, zigbee2mqtt/bridge/state will now always be a JSON object ({"state":"online"} or {"state":"offline"})`,
            noteIf: noteIfWasTrue,
        },
        {
            path: ['advanced', 'soft_reset_timeout'],
            note: `Removed deprecated: Soft reset feature (advanced.soft_reset_timeout setting)`,
            noteIf: noteIfWasDefined,
        },
        {
            path: ['advanced', 'report'],
            note: `Removed deprecated: Report feature (advanced.report setting)`,
            noteIf: noteIfWasTrue,
        },
        {
            path: ['advanced', 'availability_timeout'],
            note: `Removed deprecated: advanced.availability_timeout availability settings`,
            noteIf: noteIfWasDefined,
        },
        {
            path: ['advanced', 'availability_blocklist'],
            note: `Removed deprecated: advanced.availability_blocklist availability settings`,
            noteIf: noteIfWasNonEmptyArray,
        },
        {
            path: ['advanced', 'availability_passlist'],
            note: `Removed deprecated: advanced.availability_passlist availability settings`,
            noteIf: noteIfWasNonEmptyArray,
        },
        {
            path: ['advanced', 'availability_blacklist'],
            note: `Removed deprecated: advanced.availability_blacklist availability settings`,
            noteIf: noteIfWasNonEmptyArray,
        },
        {
            path: ['advanced', 'availability_whitelist'],
            note: `Removed deprecated: advanced.availability_whitelist availability settings`,
            noteIf: noteIfWasNonEmptyArray,
        },
        {
            path: ['device_options', 'legacy'],
            note: `Removed everything that was enabled through device_options.legacy. See link below for affected devices.`,
            noteIf: noteIfWasTrue,
        },
        {
            path: ['experimental'],
            note: `The entire experimental section was removed.`,
            noteIf: noteIfWasDefined,
        },
        {
            path: ['external_converters'],
            note: `External converters are now automatically loaded from the 'data/external_converters' directory without requiring settings to be set. Make sure your external converters are still needed (might be supported out-of-the-box now), and if so, move them to that directory.`,
            noteIf: noteIfWasNonEmptyArray,
        },
    );

    // note only once
    const noteEntityOptionsRetrieveState = `Retrieve state option ((devices|groups).xyz.retrieve_state setting)`;

    for (const deviceKey in currentSettings.devices) {
        removals.push({
            path: ['devices', deviceKey, 'retrieve_state'],
            note: noteEntityOptionsRetrieveState,
            noteIf: noteIfWasTrue,
        });
    }

    for (const groupKey in currentSettings.groups) {
        removals.push({
            path: ['groups', groupKey, 'retrieve_state'],
            note: noteEntityOptionsRetrieveState,
            noteIf: noteIfWasTrue,
        });
        removals.push({
            path: ['groups', groupKey, 'devices'],
            note: `Removed configuring group members through configuration.yaml (groups.xyz.devices setting). This will not impact current group members; however, you will no longer be able to add or remove devices from a group through the configuration.yaml.`,
            noteIf: noteIfWasDefined,
        });
    }

    customHandlers.push();
}

function migrateToThree(
    currentSettings: Partial<Settings>,
    transfers: SettingsTransfer[],
    changes: SettingsChange[],
    additions: SettingsAdd[],
    removals: SettingsRemove[],
    customHandlers: SettingsCustomHandler[],
): void {
    transfers.push();
    changes.push({
        path: ['version'],
        note: `Migrated settings to version 3`,
        newValue: 3,
    });
    additions.push();
    removals.push();

    const changeToObject = (currentSettings: Partial<Settings>, path: string[]): ReturnType<SettingsCustomHandler['execute']> => {
        const [validPath, previousValue] = getValue(currentSettings, path);

        if (validPath) {
            if (typeof previousValue === 'boolean') {
                setValue(currentSettings, path, {enabled: previousValue});
            } else {
                setValue(currentSettings, path, {enabled: true, ...(previousValue as object)});
            }
        }

        return [validPath, previousValue, validPath];
    };

    customHandlers.push(
        {
            note: `Property 'homeassistant' is now always an object.`,
            noteIf: () => true,
            execute: (currentSettings) => changeToObject(currentSettings, ['homeassistant']),
        },
        {
            note: `Property 'frontend' is now always an object.`,
            noteIf: () => true,
            execute: (currentSettings) => changeToObject(currentSettings, ['frontend']),
        },
        {
            note: `Property 'availability' is now always an object.`,
            noteIf: () => true,
            execute: (currentSettings) => changeToObject(currentSettings, ['availability']),
        },
    );
}

function migrateToFour(
    currentSettings: Partial<Settings>,
    transfers: SettingsTransfer[],
    changes: SettingsChange[],
    additions: SettingsAdd[],
    removals: SettingsRemove[],
    customHandlers: SettingsCustomHandler[],
): void {
    transfers.push();
    changes.push({
        path: ['version'],
        note: `Migrated settings to version 4`,
        newValue: 4,
    });
    additions.push();
    removals.push();

    const saveBase64DeviceIconsAsImage = (currentSettings: Partial<Settings>): ReturnType<SettingsCustomHandler['execute']> => {
        const [validPath, previousValue] = getValue(currentSettings, ['devices']);
        let changed = false;

        if (validPath) {
            for (const deviceKey in currentSettings.devices) {
                const base64Match = utils.matchBase64File(currentSettings.devices[deviceKey].icon);
                if (base64Match) {
                    changed = true;
                    currentSettings.devices[deviceKey].icon = utils.saveBase64DeviceIcon(base64Match);
                }
            }
        }

        return [validPath, previousValue, changed];
    };

    customHandlers.push({
        note: `Device icons are now saved as images.`,
        noteIf: () => true,
        execute: (currentSettings) => saveBase64DeviceIconsAsImage(currentSettings),
    });
}

/**
 * Order of execution:
 * - Transfer
 * - Change
 * - Add
 * - Remove
 *
 * Should allow the most flexibility whenever combination of migrations is necessary (e.g. Transfer + Change)
 */
export function migrateIfNecessary(): void {
    let currentSettings = settings.getPersistedSettings();

    if (!SUPPORTED_VERSIONS.includes(currentSettings.version)) {
        throw new Error(
            `Your configuration.yaml has an unsupported version ${currentSettings.version}, expected one of ${SUPPORTED_VERSIONS.map((v) => String(v)).join(',')}.`,
        );
    }

    /* v8 ignore next */
    const finalVersion = process.env.VITEST_WORKER_ID ? settings.testing.CURRENT_VERSION : settings.CURRENT_VERSION;

    // when same version as current, nothing left to do
    while (currentSettings.version !== finalVersion) {
        let migrationNotesFileName: string | undefined;
        // don't duplicate outputs
        const migrationNotes: Set<string> = new Set();
        const transfers: SettingsTransfer[] = [];
        const changes: SettingsChange[] = [];
        const additions: SettingsAdd[] = [];
        const removals: SettingsRemove[] = [];
        const customHandlers: SettingsCustomHandler[] = [];

        backupSettings(currentSettings.version || 1);

        // each version should only bump to the next version so as to gradually migrate if necessary
        if (currentSettings.version == undefined) {
            // migrating from 1 (`version` did not exist) to 2
            migrationNotesFileName = 'migration-1-to-2.log';

            migrateToTwo(currentSettings, transfers, changes, additions, removals, customHandlers);
        } else if (currentSettings.version === 2) {
            migrationNotesFileName = 'migration-2-to-3.log';

            migrateToThree(currentSettings, transfers, changes, additions, removals, customHandlers);
        } else if (currentSettings.version === 3) {
            migrationNotesFileName = 'migration-3-to-4.log';

            migrateToFour(currentSettings, transfers, changes, additions, removals, customHandlers);
        }

        for (const transfer of transfers) {
            const [validPath, previousValue, transfered] = transferValue(currentSettings, transfer);

            if (validPath && (!transfer.noteIf || transfer.noteIf(previousValue))) {
                migrationNotes.add(`[${transfered ? 'TRANSFER' : 'REMOVAL'}] ${transfer.note}`);
            }
        }

        for (const change of changes) {
            const [validPath, previousValue, changed] = changeValue(currentSettings, change);

            if (validPath && changed && (!change.noteIf || change.noteIf(previousValue))) {
                migrationNotes.add(`[CHANGE] ${change.note}`);
            }
        }

        for (const addition of additions) {
            addValue(currentSettings, addition);

            migrationNotes.add(`[ADDITION] ${addition.note}`);
        }

        for (const removal of removals) {
            const [validPath, previousValue] = removeValue(currentSettings, removal);

            if (validPath && (!removal.noteIf || removal.noteIf(previousValue))) {
                migrationNotes.add(`[REMOVAL] ${removal.note}`);
            }
        }

        for (const customHandler of customHandlers) {
            const [validPath, previousValue, changed] = customHandler.execute(currentSettings);

            if (validPath && changed && (!customHandler.noteIf || customHandler.noteIf(previousValue))) {
                migrationNotes.add(`[SPECIAL] ${customHandler.note}`);
            }
        }

        if (migrationNotesFileName && migrationNotes.size > 0) {
            migrationNotes.add(`For more details, see https://github.com/Koenkk/zigbee2mqtt/discussions/24198`);
            const migrationNotesFilePath = data.joinPath(migrationNotesFileName);

            writeFileSync(migrationNotesFilePath, Array.from(migrationNotes).join(`\r\n\r\n`), 'utf8');

            console.log(`Migration notes written in ${migrationNotesFilePath}`);
        }

        // don't throw to allow stepping through versions (validates against current schema)
        settings.apply(currentSettings as unknown as Record<string, unknown>, false);
        settings.reRead();
        currentSettings = settings.getPersistedSettings();
    }
}
