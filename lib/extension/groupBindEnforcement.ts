import bind from "bind-decorator";
import stringify from "json-stable-stringify-without-jsonify";
import Device from "../model/device";
import Group from "../model/group";
import type {Zigbee2MQTTDriftItem, Zigbee2MQTTGroupBindEnforcementStats} from "../types/api";
import logger from "../util/logger";
import * as settings from "../util/settings";
import utils from "../util/utils";
import Extension from "./extension";

// Response shape returned by the ZCL Groups cluster's getMembership command.
// Kept narrow so a future schema change in herdsman surfaces as a type error
// rather than silently returning an empty group list via a `as KeyValue` cast.
interface GetMembershipResponse {
    capacity: number;
    groupcount: number;
    grouplist: number[];
}

// Returns true if the device is mains-powered (router or explicitly mains).
// Mirrors the logic in lib/extension/availability.ts:isActiveDevice so the
// enforcement staleness gate uses the right per-class availability timeout.
function isActiveDevice(device: Device): boolean {
    return (
        (device.zh.type === "Router" && device.zh.powerSource !== "Battery") ||
        (device.zh.powerSource !== undefined && device.zh.powerSource !== "Unknown" && device.zh.powerSource !== "Battery")
    );
}

// Structural compare for an endpoint/group target. herdsman *currently* hands
// back the same JS object for the same logical target on repeated reads, so
// `b.target === target` happens to work — but that's not a guaranteed
// contract and a future SDK refactor would silently flip every binding into
// the "missing from device" path. Compare by stable identifiers instead.
function bindTargetMatches(actualTarget: zh.Endpoint | zh.Group, expectedTarget: zh.Endpoint | zh.Group): boolean {
    if (utils.isZHEndpoint(actualTarget)) {
        if (!utils.isZHEndpoint(expectedTarget)) return false;
        return actualTarget.deviceIeeeAddress === expectedTarget.deviceIeeeAddress && actualTarget.ID === expectedTarget.ID;
    }
    if (utils.isZHEndpoint(expectedTarget)) return false;
    return actualTarget.groupID === expectedTarget.groupID;
}

// Structural compare for two drift-item arrays so the
// `device.drift changed?` check doesn't depend on stable JSON.stringify
// ordering. Returns true when the arrays describe the same drift set.
function driftEquals(a: Zigbee2MQTTDriftItem[] | undefined, b: Zigbee2MQTTDriftItem[] | undefined): boolean {
    if (a === b) return true;
    if (!a || !b) return false;
    if (a.length !== b.length) return false;
    // Each item is small and has a known small set of fields; pairwise compare.
    const key = (i: Zigbee2MQTTDriftItem): string =>
        `${i.type}|${i.direction}|${i.endpoint}|${i.group_id ?? ""}|${i.cluster ?? ""}|${i.target ?? ""}|${i.target_endpoint ?? ""}`;
    const aKeys = a.map(key).sort();
    const bKeys = b.map(key).sort();
    return aKeys.every((k, i) => k === bKeys[i]);
}

export default class GroupBindEnforcement extends Extension {
    private pollTimer?: ReturnType<typeof setTimeout>;
    private stats: Zigbee2MQTTGroupBindEnforcementStats = {
        status: "idle",
        poll_interval_min: 0,
        devices_checked: 0,
        devices_skipped: 0,
        groups_validated: 0,
        binds_validated: 0,
        drift_items_found: 0,
        errors: 0,
    };

    private static readonly DEFAULT_POLL_INTERVAL = 10;

    // True when enforcement is enabled (poll loop or interview-driven sync).
    // Computed once at start(); reads .advanced settings so we only count
    // EXPLICITLY-configured strategy values, not defaults-applied values.
    private isEnabled(): boolean {
        const persisted = settings.getPersistedSettings().advanced;
        const explicitCooldown = settings.get().advanced.group_bind_cooldown;
        const hasExplicitStrategy = persisted?.group_bind_unexpected !== undefined || persisted?.group_bind_missing !== undefined;
        return (explicitCooldown !== undefined && explicitCooldown > 0) || hasExplicitStrategy;
    }

    override async start(): Promise<void> {
        if (!this.isEnabled()) return;

        const explicitCooldown = settings.get().advanced.group_bind_cooldown;
        const interval = explicitCooldown && explicitCooldown > 0 ? explicitCooldown : GroupBindEnforcement.DEFAULT_POLL_INTERVAL;
        this.stats.poll_interval_min = interval;

        this.eventBus.onGroupMembersChanged(this, this.onGroupMembersChanged);
        this.eventBus.onDeviceInterview(this, this.onDeviceInterview);
        logger.info(`Group/Bind Enforcement: Starting poll loop (interval: ${interval} min)`);
        await this.publishStats();
        this.pollTimer = setTimeout(() => this.schedulePoll(interval), utils.minutes(1) + Math.random() * utils.minutes(1));
    }

    private async schedulePoll(intervalMinutes: number): Promise<void> {
        await this.poll();
        if (!this.zigbee.isStopping()) {
            this.pollTimer = setTimeout(() => this.schedulePoll(intervalMinutes), utils.minutes(intervalMinutes));
        }
    }

    override async stop(): Promise<void> {
        if (this.pollTimer) {
            clearTimeout(this.pollTimer);
            this.pollTimer = undefined;
        }
        await super.stop();
    }

    @bind private async onGroupMembersChanged(data: eventdata.GroupMembersChanged): Promise<void> {
        if (!this.pollTimer) return;

        const device = this.zigbee.resolveEntity(data.endpoint.getDevice().ieeeAddr);
        if (device && device instanceof Device) {
            if (data.action === "add") {
                settings.addGroupMember(device.ieeeAddr, data.group.name);
            } else if (data.action === "remove") {
                settings.removeGroupMember(device.ieeeAddr, data.group.name);
            }
        }
    }

    @bind private async onDeviceInterview(data: eventdata.DeviceInterview): Promise<void> {
        if (data.status !== "successful") return;

        // Gate on the same enable check as the poll loop. Without this, an
        // interview can trigger a syncDevice* pass with strategy=enforce
        // even when the operator has set cooldown=0 to disable enforcement.
        if (!this.isEnabled()) return;

        const device = data.device;
        if (device.options.disabled) return;

        // Only enforce if groups or binds are already configured for this device
        if (device.options.groups === undefined && device.options.binds === undefined) return;

        logger.info(`Group/Bind Enforcement: Device '${device.name}' interviewed successfully, syncing groups and bindings...`);
        await this.syncDeviceGroups(device);
        await this.syncDeviceBinds(device);
    }

    private async poll(): Promise<void> {
        if (this.zigbee.isStopping()) return;

        const pollStart = Date.now();
        this.stats.status = "polling";
        this.stats.devices_checked = 0;
        this.stats.devices_skipped = 0;
        this.stats.groups_validated = 0;
        this.stats.binds_validated = 0;
        this.stats.drift_items_found = 0;
        this.stats.errors = 0;
        await this.publishStats();

        const availabilityEnabled = settings.get().availability.enabled;
        const activeTimeoutMs = availabilityEnabled ? utils.minutes(settings.get().availability.active.timeout) : 0;
        const passiveTimeoutMs = availabilityEnabled ? utils.minutes(settings.get().availability.passive.timeout) : 0;

        logger.info("Group/Bind Enforcement: Starting poll...");
        for (const device of this.zigbee.devicesIterator(utils.deviceNotCoordinator)) {
            if (device.options.disabled || !device.interviewed) {
                this.stats.devices_skipped++;
                continue;
            }

            // Skip devices that haven't been seen within their class's
            // availability timeout. Routers / mains-powered devices get
            // the (typically shorter) active timeout; battery devices get
            // passive. Matches the per-class logic in availability.ts.
            if (availabilityEnabled && device.zh.lastSeen) {
                const timeoutMs = isActiveDevice(device) ? activeTimeoutMs : passiveTimeoutMs;
                if (timeoutMs > 0) {
                    const age = Date.now() - device.zh.lastSeen;
                    if (age > timeoutMs) {
                        logger.debug(`Group/Bind Enforcement: Skipping '${device.name}' (last seen ${Math.round(age / 60000)}m ago)`);
                        this.stats.devices_skipped++;
                        continue;
                    }
                }
            }

            const throttle = settings.get().advanced.group_bind_throttle ?? 2;
            if (throttle > 0) await utils.sleep(throttle);
            if (this.zigbee.isStopping()) return;

            this.stats.devices_checked++;
            const driftItems: Zigbee2MQTTDriftItem[] = [];
            const counts = {groups: 0, binds: 0, errors: 0};
            await this.syncDeviceGroups(device, driftItems, counts);
            await this.syncDeviceBinds(device, driftItems, counts);
            this.stats.groups_validated += counts.groups;
            this.stats.binds_validated += counts.binds;
            this.stats.errors += counts.errors;

            const oldDrift = device.drift;
            device.drift = driftItems.length > 0 ? driftItems : undefined;
            this.stats.drift_items_found += driftItems.length;

            // Structural compare; same drift item set in a different order
            // should not emit devicesChanged. Items are small so this is cheap.
            if (!driftEquals(oldDrift, device.drift)) {
                this.eventBus.emitDevicesChanged();
            }
        }

        this.stats.status = "idle";
        this.stats.last_poll_completed = new Date().toISOString();
        this.stats.last_poll_duration_sec = Math.round((Date.now() - pollStart) / 1000);
        await this.publishStats();
        logger.info("Group/Bind Enforcement: Poll finished");
    }

    private async publishStats(): Promise<void> {
        await this.mqtt.publish("bridge/group_bind_enforcement", stringify(this.stats), {clientOptions: {retain: true}, skipLog: true});
    }

    private async syncDeviceGroups(device: Device, driftItems?: Zigbee2MQTTDriftItem[], counts?: {groups: number; binds: number; errors: number}): Promise<void> {
        const unexpectedStrategy = settings.get().advanced.group_bind_unexpected ?? "report";
        const missingStrategy = settings.get().advanced.group_bind_missing ?? "report";

        for (const endpoint of device.zh.endpoints) {
            // Skip endpoints that don't support the Groups cluster (e.g. GreenPower endpoint 242)
            if (!endpoint.supportsInputCluster("genGroups")) {
                continue;
            }

            try {
                // Query actual group membership from the device via ZCL Groups cluster.
                // herdsman doesn't expose a typed helper for this; the raw ZCL command
                // returns {capacity, groupcount, grouplist}. Cast to a narrow interface
                // (rather than KeyValue) so a future schema change shows up as a TS
                // error, and runtime-validate the field so a silent shape break can't
                // produce a false-empty group list.
                const result = (await endpoint.command("genGroups", "getMembership", {groupcount: 0, grouplist: []})) as GetMembershipResponse;
                const actualGroupIDs: number[] = Array.isArray(result?.grouplist) ? result.grouplist : [];

                if (device.options.groups === undefined) {
                    // Batch all ingestion writes for this endpoint into one
                    // file write rather than one per group.
                    settings.mutateBatched(() => {
                        for (const groupID of actualGroupIDs) {
                            const group = this.zigbee.groupByID(groupID);
                            const groupKey = group ? group.name : groupID;
                            logger.info(`Group/Bind Enforcement: First run for '${device.name}', ingesting group '${groupKey}' into config`);
                            settings.addGroupMember(device.ieeeAddr, groupKey);
                        }
                    });
                    continue;
                }

                const expectedGroups = device.options.groups || [];
                const expectedGroupIDs = expectedGroups
                    .map((g) => {
                        const entity = this.zigbee.resolveEntity(g.toString());
                        return entity instanceof Group ? entity.ID : Number(g);
                    })
                    .filter((id) => !Number.isNaN(id));

                if (counts) {
                    counts.groups += new Set([...expectedGroupIDs, ...actualGroupIDs]).size;
                }

                // Handle missing groups (in config but not on device)
                for (const groupID of expectedGroupIDs) {
                    if (!actualGroupIDs.includes(groupID)) {
                        if (missingStrategy === "enforce") {
                            logger.warning(
                                `Group/Bind Enforcement: Device '${device.name}' (endpoint ${endpoint.ID}) missing from group ${groupID}, adding...`,
                            );
                            const group = this.zigbee.groupByID(groupID);
                            if (group) {
                                await endpoint.addToGroup(group.zh);
                            }
                        } else if (missingStrategy === "accept") {
                            const group = this.zigbee.groupByID(groupID);
                            const groupKey = group ? group.name : groupID;
                            logger.info(
                                `Group/Bind Enforcement: Device '${device.name}' (endpoint ${endpoint.ID}) missing from group ${groupID}, removing from config`,
                            );
                            settings.removeGroupMember(device.ieeeAddr, groupKey);
                        } else {
                            // report
                            const group = this.zigbee.groupByID(groupID);
                            logger.info(
                                `Group/Bind Enforcement: Device '${device.name}' (endpoint ${endpoint.ID}) missing from group ${groupID}, reporting as drift`,
                            );
                            driftItems?.push({
                                type: "group",
                                direction: "missing_from_device",
                                endpoint: endpoint.ID,
                                group_id: groupID,
                                group_name: group?.name,
                            });
                        }
                    }
                }

                // Handle unexpected groups (on device but not in config)
                for (const groupID of actualGroupIDs) {
                    if (!expectedGroupIDs.includes(groupID)) {
                        if (unexpectedStrategy === "enforce") {
                            logger.warning(
                                `Group/Bind Enforcement: Device '${device.name}' (endpoint ${endpoint.ID}) in unexpected group ${groupID}, removing...`,
                            );
                            const group = this.zigbee.groupByID(groupID);
                            if (group) await endpoint.removeFromGroup(group.zh);
                        } else if (unexpectedStrategy === "accept") {
                            const group = this.zigbee.groupByID(groupID);
                            const groupKey = group ? group.name : groupID;
                            logger.info(
                                `Group/Bind Enforcement: Device '${device.name}' (endpoint ${endpoint.ID}) in unexpected group ${groupID}, adding to config`,
                            );
                            settings.addGroupMember(device.ieeeAddr, groupKey);
                        } else {
                            // report
                            const group = this.zigbee.groupByID(groupID);
                            logger.info(
                                `Group/Bind Enforcement: Device '${device.name}' (endpoint ${endpoint.ID}) in unexpected group ${groupID}, reporting as drift`,
                            );
                            driftItems?.push({
                                type: "group",
                                direction: "unexpected_on_device",
                                endpoint: endpoint.ID,
                                group_id: groupID,
                                group_name: group?.name,
                            });
                        }
                    }
                }
            } catch (error) {
                if (counts) counts.errors++;
                logger.debug(
                    `Group/Bind Enforcement: Failed to sync groups for '${device.name}' endpoint ${endpoint.ID} (${(error as Error).message})`,
                );
            }
        }
    }

    private isCoordinatorTarget(target: zh.Endpoint | zh.Group): boolean {
        return utils.isZHEndpoint(target) && target.getDevice().type === "Coordinator";
    }

    // For each expected bind that has no from_endpoint (legacy config from
    // before the field existed), scan all device endpoints for a unique
    // match and write from_endpoint back to disk if found. After this pass
    // the per-endpoint "missing" check correctly scopes each bind to one
    // endpoint regardless of iteration order.
    private backfillLegacyFromEndpoints(device: Device): void {
        const expected = device.options.binds;
        if (!expected) return;
        const legacy = expected.filter((b) => b.from_endpoint === undefined);
        if (legacy.length === 0) return;

        // Batch any writes — there can be several legacy entries on a device.
        settings.mutateBatched(() => {
            for (const exp of legacy) {
                const targetEntity = this.zigbee.resolveEntity(exp.to.toString());
                if (!targetEntity) continue;
                const target = targetEntity instanceof Device ? targetEntity.endpoint(exp.to_endpoint) : targetEntity.zh;
                if (!target) continue;

                // Find every endpoint that has this exact bind.
                const matches = device.zh.endpoints.filter((ep) =>
                    ep.binds
                        .filter((b) => !this.isCoordinatorTarget(b.target))
                        .some((b) => b.cluster.name === exp.cluster && bindTargetMatches(b.target, target)),
                );

                if (matches.length === 1) {
                    // Unambiguous: backfill so future polls scope correctly.
                    settings.setBindingFromEndpoint(device.ieeeAddr, exp.cluster, exp.to, exp.to_endpoint, matches[0].ID);
                    logger.info(
                        `Group/Bind Enforcement: Backfilled from_endpoint=${matches[0].ID} for '${device.name}' bind '${exp.cluster}' → '${exp.to}'`,
                    );
                } else if (matches.length > 1) {
                    // Ambiguous: bind exists on multiple endpoints. We can't
                    // pick one for the user; leave as-is and report each
                    // endpoint missing it as drift (caller's existing logic).
                    logger.warning(
                        `Group/Bind Enforcement: Legacy bind '${exp.cluster}' → '${exp.to}' on '${device.name}' is present on multiple endpoints (${matches
                            .map((m) => m.ID)
                            .join(", ")}); cannot auto-disambiguate from_endpoint`,
                    );
                }
                // matches.length === 0 → bind doesn't actually exist
                // on-device. Drop through and let the per-endpoint loop
                // surface it as missing/drift on every endpoint, the way
                // the user would have seen it pre-fix.
            }
        });
    }

    private async syncDeviceBinds(device: Device, driftItems?: Zigbee2MQTTDriftItem[], counts?: {groups: number; binds: number; errors: number}): Promise<void> {
        const unexpectedStrategy = settings.get().advanced.group_bind_unexpected ?? "report";
        const missingStrategy = settings.get().advanced.group_bind_missing ?? "report";

        // Refresh binding table from device - this updates endpoint.binds in-memory cache
        try {
            await device.zh.bindingTable();
        } catch (error) {
            if (counts) counts.errors++;
            logger.debug(`Group/Bind Enforcement: Failed to read binding table for '${device.name}' (${(error as Error).message})`);
            return;
        }

        // Legacy migration pre-pass: any expected bind without from_endpoint
        // gets disambiguated by finding which (if any) endpoint actually
        // hosts it on-device, before the per-endpoint "missing" check runs.
        // Otherwise we'd report the bind missing on every endpoint it
        // doesn't live on, then backfill it on the one that does.
        if (device.options.binds !== undefined) {
            this.backfillLegacyFromEndpoints(device);
        }

        for (const endpoint of device.zh.endpoints) {
            const actualBinds = endpoint.binds;

            // Filter out Coordinator-target bindings — those are managed by the configure extension
            const userBinds = actualBinds.filter((b) => !this.isCoordinatorTarget(b.target));

            if (device.options.binds === undefined) {
                // Batch all first-run binds ingestion for this endpoint into
                // a single YAML write. For a 145-device network this cuts
                // hundreds of disk writes per poll down to a few.
                settings.mutateBatched(() => {
                    for (const bind of userBinds) {
                        const target = utils.isZHEndpoint(bind.target)
                            ? this.zigbee.resolveEntity(bind.target.deviceIeeeAddress)?.name || bind.target.deviceIeeeAddress
                            : this.zigbee.groupByID(bind.target.groupID)?.name || bind.target.groupID;

                        const targetEndpoint = utils.isZHEndpoint(bind.target) ? bind.target.ID : undefined;

                        logger.info(
                            `Group/Bind Enforcement: First run for '${device.name}' (endpoint ${endpoint.ID}), ingesting bind '${bind.cluster.name}' to '${target}' into config`,
                        );
                        settings.addBinding(device.ieeeAddr, bind.cluster.name, target, targetEndpoint, endpoint.ID);
                    }
                });
                continue;
            }

            const expectedBinds = device.options.binds || [];

            if (counts) {
                counts.binds += expectedBinds.length + userBinds.length;
            }

            // Handle missing bindings (in config but not on device)
            for (const expected of expectedBinds) {
                if (expected.from_endpoint !== undefined && expected.from_endpoint !== endpoint.ID) {
                    continue;
                }

                const targetEntity = this.zigbee.resolveEntity(expected.to.toString());
                if (!targetEntity) continue;

                const target = targetEntity instanceof Device ? targetEntity.endpoint(expected.to_endpoint) : targetEntity.zh;

                if (!target) continue;

                const isBound = userBinds.some((b) => b.cluster.name === expected.cluster && bindTargetMatches(b.target, target));

                if (!isBound) {
                    if (missingStrategy === "enforce") {
                        logger.warning(
                            `Group/Bind Enforcement: Device '${device.name}' (endpoint ${endpoint.ID}) missing binding for cluster '${expected.cluster}' to '${expected.to}', adding...`,
                        );
                        try {
                            await endpoint.bind(expected.cluster, target);
                        } catch (error) {
                            logger.error(`Group/Bind Enforcement: Failed to bind '${device.name}' (${(error as Error).message})`);
                        }
                    } else if (missingStrategy === "accept") {
                        logger.info(
                            `Group/Bind Enforcement: Device '${device.name}' (endpoint ${endpoint.ID}) missing binding for cluster '${expected.cluster}' to '${expected.to}', removing from config`,
                        );
                        settings.removeBinding(device.ieeeAddr, expected.cluster, expected.to, expected.to_endpoint);
                    } else {
                        // report
                        const targetName = targetEntity.name;
                        const targetEp = targetEntity instanceof Device ? expected.to_endpoint : undefined;
                        logger.info(
                            `Group/Bind Enforcement: Device '${device.name}' (endpoint ${endpoint.ID}) missing binding for cluster '${expected.cluster}' to '${expected.to}', reporting as drift`,
                        );
                        driftItems?.push({
                            type: "bind",
                            direction: "missing_from_device",
                            endpoint: endpoint.ID,
                            cluster: expected.cluster,
                            target: targetName,
                            target_endpoint: targetEp,
                        });
                    }
                }
            }

            // Handle unexpected bindings (on device but not in config)
            for (const actual of userBinds) {
                const isExpected = expectedBinds.some((expected) => {
                    if (expected.from_endpoint !== undefined && expected.from_endpoint !== endpoint.ID) {
                        return false;
                    }

                    const targetEntity = this.zigbee.resolveEntity(expected.to.toString());
                    if (!targetEntity) return false;

                    const target = targetEntity instanceof Device ? targetEntity.endpoint(expected.to_endpoint) : targetEntity.zh;
                    if (!target) return false;

                    return actual.cluster.name === expected.cluster && bindTargetMatches(actual.target, target);
                });

                if (!isExpected) {
                    if (unexpectedStrategy === "enforce") {
                        logger.warning(
                            `Group/Bind Enforcement: Device '${device.name}' (endpoint ${endpoint.ID}) has unexpected binding for cluster '${actual.cluster.name}', removing...`,
                        );
                        try {
                            await endpoint.unbind(actual.cluster.name, actual.target);
                        } catch (error) {
                            logger.error(`Group/Bind Enforcement: Failed to unbind '${device.name}' (${(error as Error).message})`);
                        }
                    } else if (unexpectedStrategy === "accept") {
                        const target = utils.isZHEndpoint(actual.target)
                            ? this.zigbee.resolveEntity(actual.target.deviceIeeeAddress)?.name || actual.target.deviceIeeeAddress
                            : this.zigbee.groupByID(actual.target.groupID)?.name || actual.target.groupID;
                        const targetEndpoint = utils.isZHEndpoint(actual.target) ? actual.target.ID : undefined;
                        logger.info(
                            `Group/Bind Enforcement: Device '${device.name}' (endpoint ${endpoint.ID}) has unexpected binding for cluster '${actual.cluster.name}' to '${target}', adding to config`,
                        );
                        settings.addBinding(device.ieeeAddr, actual.cluster.name, target, targetEndpoint, endpoint.ID);
                    } else {
                        // report
                        const target = utils.isZHEndpoint(actual.target)
                            ? this.zigbee.resolveEntity(actual.target.deviceIeeeAddress)?.name || actual.target.deviceIeeeAddress
                            : this.zigbee.groupByID(actual.target.groupID)?.name || actual.target.groupID;
                        const targetEndpoint = utils.isZHEndpoint(actual.target) ? actual.target.ID : undefined;
                        logger.info(
                            `Group/Bind Enforcement: Device '${device.name}' (endpoint ${endpoint.ID}) has unexpected binding for cluster '${actual.cluster.name}' to '${target}', reporting as drift`,
                        );
                        driftItems?.push({
                            type: "bind",
                            direction: "unexpected_on_device",
                            endpoint: endpoint.ID,
                            cluster: actual.cluster.name,
                            target,
                            target_endpoint: targetEndpoint,
                        });
                    }
                }
            }
        }
    }
}
