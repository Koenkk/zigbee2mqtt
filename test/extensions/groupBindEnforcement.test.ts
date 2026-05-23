// biome-ignore assist/source/organizeImports: import mocks first
import {afterAll, beforeAll, beforeEach, describe, expect, it, vi} from "vitest";
import * as data from "../mocks/data";
import {mockLogger} from "../mocks/logger";
import {flushPromises} from "../mocks/utils";
import {devices, groups, resetGroupMembers, returnDevices} from "../mocks/zigbeeHerdsman";

import {Controller} from "../../lib/controller";
import type Device from "../../lib/model/device";
import * as settings from "../../lib/util/settings";
import utils from "../../lib/util/utils";

returnDevices.push(devices.coordinator.ieeeAddr, devices.bulb_color.ieeeAddr, devices.bulb.ieeeAddr);

describe("Extension: GroupBindEnforcement", () => {
    let controller: Controller;

    beforeAll(async () => {
        vi.spyOn(utils, "sleep").mockImplementation(vi.fn());
        vi.useFakeTimers();
        controller = new Controller(vi.fn(), vi.fn());
        await controller.start();
        await flushPromises();
    });

    afterAll(async () => {
        await controller?.stop();
        await flushPromises();
        vi.useRealTimers();
    });

    beforeEach(() => {
        resetGroupMembers();
        data.writeDefaultConfiguration();
        settings.reRead();
        mockLogger.info.mockClear();
        mockLogger.warning.mockClear();
        vi.clearAllMocks();

        // Ensure all devices have empty binding tables and binds
        for (const device of Object.values(devices)) {
            device.bindingTable.mockResolvedValue([]);
        }
        // Clear endpoint binds
        for (const device of Object.values(devices)) {
            for (const endpoint of device.endpoints.values()) {
                endpoint.binds = [];
            }
        }
        // Clear drift state
        for (const device of controller.zigbee.devicesIterator()) {
            device.drift = undefined;
        }
    });

    it("Should start the poll loop when cooldown is configured", async () => {
        settings.set(["advanced", "group_bind_cooldown"], 10);

        const ext = Array.from(controller.extensions).find((e) => e.constructor.name.includes("GroupBindEnforcement")) as any;
        await ext.stop();
        await ext.start();

        expect(mockLogger.info).toHaveBeenCalledWith("Group/Bind Enforcement: Starting poll loop (interval: 10 min)");
    });

    it("Should start the poll loop with default interval when a strategy is set", async () => {
        settings.set(["advanced", "group_bind_unexpected"], "report");

        const ext = Array.from(controller.extensions).find((e) => e.constructor.name.includes("GroupBindEnforcement")) as any;
        await ext.stop();
        await ext.start();

        expect(mockLogger.info).toHaveBeenCalledWith("Group/Bind Enforcement: Starting poll loop (interval: 10 min)");
    });

    it("Should not start the poll loop when nothing is configured", async () => {
        const ext = Array.from(controller.extensions).find((e) => e.constructor.name.includes("GroupBindEnforcement")) as any;
        await ext.stop();
        await ext.start();

        expect(mockLogger.info).not.toHaveBeenCalledWith(expect.stringContaining("Starting poll loop"));
    });

    it("Should ingest groups on first run (Capture strategy)", async () => {
        const device = devices.bulb_color;
        const group = groups.group_1;
        group.members.push(device.getEndpoint(1)!);

        settings.set(["advanced", "group_bind_cooldown"], 10);
        const deviceConfig = settings.getDevice(device.ieeeAddr)!;
        delete (deviceConfig as any).groups;

        const ext = Array.from(controller.extensions).find((e) => e.constructor.name.includes("GroupBindEnforcement")) as any;
        await ext.poll();
        await flushPromises();

        expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining("ingesting group 'group_1' into config"));
        expect(settings.getDevice(device.ieeeAddr)!.groups).toContain("group_1");
    });

    it("Should ingest bindings on first run (Capture strategy)", async () => {
        const device = devices.bulb;
        const target = devices.bulb_color;
        const targetEndpoint = target.getEndpoint(1)!;
        const binding = {
            cluster: {name: "genOnOff"},
            target: targetEndpoint,
        };
        // bindingTable() refreshes endpoint.binds; mock both
        device.bindingTable.mockResolvedValue([]);
        device.getEndpoint(1)!.binds = [binding as any];

        settings.set(["advanced", "group_bind_cooldown"], 10);
        const deviceConfig = settings.getDevice(device.ieeeAddr)!;
        delete (deviceConfig as any).binds;

        const ext = Array.from(controller.extensions).find((e) => e.constructor.name.includes("GroupBindEnforcement")) as any;
        await ext.poll();
        await flushPromises();

        expect(device.bindingTable).toHaveBeenCalled();
        expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining("ingesting bind 'genOnOff' to 'bulb_color' into config"));
        expect(settings.getDevice(device.ieeeAddr)!.binds).toContainEqual({
            cluster: "genOnOff",
            to: "bulb_color",
            to_endpoint: 1,
            from_endpoint: 1,
        });
    });

    // --- group_bind_missing tests ---

    it("Should add missing groups during poll (missing=enforce)", async () => {
        const device = devices.bulb_color;
        settings.set(["advanced", "group_bind_cooldown"], 10);
        settings.set(["advanced", "group_bind_missing"], "enforce");
        settings.set(["devices", device.ieeeAddr, "groups"], ["group_1"]);

        const group = groups.group_1;
        expect(group.members).not.toContain(device.getEndpoint(1));

        const ext = Array.from(controller.extensions).find((e) => e.constructor.name.includes("GroupBindEnforcement")) as any;
        await ext.poll();
        await flushPromises();

        expect(mockLogger.warning).toHaveBeenCalledWith(expect.stringContaining("missing from group 1, adding..."));
        expect(group.members).toContain(device.getEndpoint(1));
    });

    it("Should remove missing groups from config (missing=accept)", async () => {
        const device = devices.bulb_color;
        settings.set(["advanced", "group_bind_cooldown"], 10);
        settings.set(["advanced", "group_bind_missing"], "accept");
        settings.set(["devices", device.ieeeAddr, "groups"], ["group_1"]);

        const ext = Array.from(controller.extensions).find((e) => e.constructor.name.includes("GroupBindEnforcement")) as any;
        await ext.poll();
        await flushPromises();

        expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining("missing from group 1, removing from config"));
        // group_1 should have been removed from config
        const deviceConfig = settings.getDevice(device.ieeeAddr)!;
        expect(deviceConfig.groups ?? []).not.toContain("group_1");
    });

    it("Should report missing groups as drift (missing=report)", async () => {
        const device = devices.bulb_color;
        settings.set(["advanced", "group_bind_cooldown"], 10);
        settings.set(["advanced", "group_bind_missing"], "report");
        settings.set(["devices", device.ieeeAddr, "groups"], ["group_1"]);

        const ext = Array.from(controller.extensions).find((e) => e.constructor.name.includes("GroupBindEnforcement")) as any;
        await ext.poll();
        await flushPromises();

        expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining("missing from group 1, reporting as drift"));
        const modelDevice = controller.zigbee.resolveEntity(device.ieeeAddr) as Device;
        expect(modelDevice.drift).toBeDefined();
        expect(modelDevice.drift).toContainEqual(
            expect.objectContaining({type: "group", direction: "missing_from_device", group_id: 1}),
        );
    });

    // --- group_bind_unexpected tests ---

    it("Should remove unexpected groups when configured (unexpected=enforce)", async () => {
        const device = devices.bulb_color;
        const endpoint = device.getEndpoint(1)!;
        const group = groups.group_1;
        group.members.push(endpoint);

        settings.set(["advanced", "group_bind_cooldown"], 10);
        settings.set(["advanced", "group_bind_unexpected"], "enforce");
        settings.set(["devices", device.ieeeAddr, "groups"], []);

        const ext = Array.from(controller.extensions).find((e) => e.constructor.name.includes("GroupBindEnforcement")) as any;
        await ext.poll();
        await flushPromises();

        expect(mockLogger.warning).toHaveBeenCalledWith(expect.stringContaining("in unexpected group 1, removing..."));
        expect(group.members).not.toContain(endpoint);
    });

    it("Should add unexpected groups to config (unexpected=accept)", async () => {
        const device = devices.bulb_color;
        const endpoint = device.getEndpoint(1)!;
        const group = groups.group_1;
        group.members.push(endpoint);

        settings.set(["advanced", "group_bind_cooldown"], 10);
        settings.set(["advanced", "group_bind_unexpected"], "accept");
        settings.set(["devices", device.ieeeAddr, "groups"], []);

        const ext = Array.from(controller.extensions).find((e) => e.constructor.name.includes("GroupBindEnforcement")) as any;
        await ext.poll();
        await flushPromises();

        expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining("in unexpected group 1, adding to config"));
        expect(group.members).toContain(endpoint);
        expect(settings.getDevice(device.ieeeAddr)!.groups).toContain("group_1");
    });

    it("Should report unexpected groups as drift (unexpected=report)", async () => {
        const device = devices.bulb_color;
        const endpoint = device.getEndpoint(1)!;
        const group = groups.group_1;
        group.members.push(endpoint);

        settings.set(["advanced", "group_bind_cooldown"], 10);
        settings.set(["advanced", "group_bind_unexpected"], "report");
        settings.set(["devices", device.ieeeAddr, "groups"], []);

        const ext = Array.from(controller.extensions).find((e) => e.constructor.name.includes("GroupBindEnforcement")) as any;
        await ext.poll();
        await flushPromises();

        expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining("in unexpected group 1, reporting as drift"));
        const modelDevice = controller.zigbee.resolveEntity(device.ieeeAddr) as Device;
        expect(modelDevice.drift).toBeDefined();
        expect(modelDevice.drift).toContainEqual(
            expect.objectContaining({type: "group", direction: "unexpected_on_device", group_id: 1}),
        );
    });

    // --- bind missing tests ---

    it("Should add missing bindings during poll (missing=enforce)", async () => {
        const device = devices.bulb;
        const target = devices.bulb_color;

        settings.set(["advanced", "group_bind_cooldown"], 10);
        settings.set(["advanced", "group_bind_missing"], "enforce");
        settings.set(["devices", device.ieeeAddr, "binds"], [{cluster: "genOnOff", to: "bulb_color", to_endpoint: 1, from_endpoint: 1}]);

        // Device has no binds (simulating a reset)
        device.bindingTable.mockResolvedValue([]);
        device.getEndpoint(1)!.binds = [];

        const ext = Array.from(controller.extensions).find((e) => e.constructor.name.includes("GroupBindEnforcement")) as any;
        await ext.poll();
        await flushPromises();

        expect(device.bindingTable).toHaveBeenCalled();
        expect(mockLogger.warning).toHaveBeenCalledWith(expect.stringContaining("missing binding for cluster 'genOnOff' to 'bulb_color', adding..."));
        expect(device.getEndpoint(1)!.bind).toHaveBeenCalledWith("genOnOff", target.getEndpoint(1));
    });

    it("Should remove missing bindings from config (missing=accept)", async () => {
        const device = devices.bulb;

        settings.set(["advanced", "group_bind_cooldown"], 10);
        settings.set(["advanced", "group_bind_missing"], "accept");
        settings.set(["devices", device.ieeeAddr, "binds"], [{cluster: "genOnOff", to: "bulb_color", to_endpoint: 1, from_endpoint: 1}]);

        device.bindingTable.mockResolvedValue([]);
        device.getEndpoint(1)!.binds = [];

        const ext = Array.from(controller.extensions).find((e) => e.constructor.name.includes("GroupBindEnforcement")) as any;
        await ext.poll();
        await flushPromises();

        expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining("missing binding for cluster 'genOnOff' to 'bulb_color', removing from config"));
        const deviceConfig = settings.getDevice(device.ieeeAddr)!;
        expect(deviceConfig.binds ?? []).not.toContainEqual(
            expect.objectContaining({cluster: "genOnOff", to: "bulb_color"}),
        );
    });

    it("Should report missing bindings as drift (missing=report)", async () => {
        const device = devices.bulb;

        settings.set(["advanced", "group_bind_cooldown"], 10);
        settings.set(["advanced", "group_bind_missing"], "report");
        settings.set(["devices", device.ieeeAddr, "binds"], [{cluster: "genOnOff", to: "bulb_color", to_endpoint: 1, from_endpoint: 1}]);

        device.bindingTable.mockResolvedValue([]);
        device.getEndpoint(1)!.binds = [];

        const ext = Array.from(controller.extensions).find((e) => e.constructor.name.includes("GroupBindEnforcement")) as any;
        await ext.poll();
        await flushPromises();

        expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining("missing binding for cluster 'genOnOff' to 'bulb_color', reporting as drift"));
        const modelDevice = controller.zigbee.resolveEntity(device.ieeeAddr) as Device;
        expect(modelDevice.drift).toBeDefined();
        expect(modelDevice.drift).toContainEqual(
            expect.objectContaining({type: "bind", direction: "missing_from_device", cluster: "genOnOff"}),
        );
    });

    // --- bind unexpected tests ---

    it("Should remove unexpected bindings when configured (unexpected=enforce)", async () => {
        const device = devices.bulb;
        const target = devices.bulb_color;
        const targetEndpoint = target.getEndpoint(1)!;
        const binding = {
            cluster: {name: "genOnOff"},
            target: targetEndpoint,
        };
        device.bindingTable.mockResolvedValue([]);
        device.getEndpoint(1)!.binds = [binding as any];

        settings.set(["advanced", "group_bind_cooldown"], 10);
        settings.set(["advanced", "group_bind_unexpected"], "enforce");
        settings.set(["devices", device.ieeeAddr, "binds"], []);

        const ext = Array.from(controller.extensions).find((e) => e.constructor.name.includes("GroupBindEnforcement")) as any;
        await ext.poll();
        await flushPromises();

        expect(device.bindingTable).toHaveBeenCalled();
        expect(mockLogger.warning).toHaveBeenCalledWith(expect.stringContaining("has unexpected binding for cluster 'genOnOff', removing..."));
        expect(device.getEndpoint(1)!.unbind).toHaveBeenCalledWith("genOnOff", targetEndpoint);
    });

    it("Should add unexpected bindings to config (unexpected=accept)", async () => {
        const device = devices.bulb;
        const target = devices.bulb_color;
        const targetEndpoint = target.getEndpoint(1)!;
        const binding = {
            cluster: {name: "genOnOff"},
            target: targetEndpoint,
        };
        device.bindingTable.mockResolvedValue([]);
        device.getEndpoint(1)!.binds = [binding as any];

        settings.set(["advanced", "group_bind_cooldown"], 10);
        settings.set(["advanced", "group_bind_unexpected"], "accept");
        settings.set(["devices", device.ieeeAddr, "binds"], []);

        const ext = Array.from(controller.extensions).find((e) => e.constructor.name.includes("GroupBindEnforcement")) as any;
        await ext.poll();
        await flushPromises();

        expect(mockLogger.info).toHaveBeenCalledWith(
            expect.stringContaining("has unexpected binding for cluster 'genOnOff' to 'bulb_color', adding to config"),
        );
        expect(settings.getDevice(device.ieeeAddr)!.binds).toContainEqual({
            cluster: "genOnOff",
            to: "bulb_color",
            to_endpoint: 1,
            from_endpoint: 1,
        });
    });

    it("Should report unexpected bindings as drift (unexpected=report)", async () => {
        const device = devices.bulb;
        const target = devices.bulb_color;
        const targetEndpoint = target.getEndpoint(1)!;
        const binding = {
            cluster: {name: "genOnOff"},
            target: targetEndpoint,
        };
        device.bindingTable.mockResolvedValue([]);
        device.getEndpoint(1)!.binds = [binding as any];

        settings.set(["advanced", "group_bind_cooldown"], 10);
        settings.set(["advanced", "group_bind_unexpected"], "report");
        settings.set(["devices", device.ieeeAddr, "binds"], []);

        const ext = Array.from(controller.extensions).find((e) => e.constructor.name.includes("GroupBindEnforcement")) as any;
        await ext.poll();
        await flushPromises();

        expect(mockLogger.info).toHaveBeenCalledWith(
            expect.stringContaining("has unexpected binding for cluster 'genOnOff' to 'bulb_color', reporting as drift"),
        );
        const modelDevice = controller.zigbee.resolveEntity(device.ieeeAddr) as Device;
        expect(modelDevice.drift).toBeDefined();
        expect(modelDevice.drift).toContainEqual(
            expect.objectContaining({type: "bind", direction: "unexpected_on_device", cluster: "genOnOff", target: "bulb_color"}),
        );
    });

    // --- drift emission tests ---

    it("Should emit devicesChanged when drift state changes", async () => {
        const device = devices.bulb_color;
        const endpoint = device.getEndpoint(1)!;
        const group = groups.group_1;
        group.members.push(endpoint);

        settings.set(["advanced", "group_bind_cooldown"], 10);
        settings.set(["advanced", "group_bind_unexpected"], "report");
        settings.set(["devices", device.ieeeAddr, "groups"], []);

        const emitSpy = vi.spyOn(controller.eventBus, "emitDevicesChanged");

        const ext = Array.from(controller.extensions).find((e) => e.constructor.name.includes("GroupBindEnforcement")) as any;
        await ext.poll();
        await flushPromises();

        expect(emitSpy).toHaveBeenCalled();
    });

    it("Should clear drift when no discrepancies remain", async () => {
        const device = devices.bulb_color;

        // Set initial drift on the model device
        const modelDevice = controller.zigbee.resolveEntity(device.ieeeAddr) as Device;
        modelDevice.drift = [{type: "group", direction: "unexpected_on_device", endpoint: 1, group_id: 1}];

        settings.set(["advanced", "group_bind_cooldown"], 10);
        settings.set(["devices", device.ieeeAddr, "groups"], []);

        // Device has no actual groups (no discrepancy)
        const ext = Array.from(controller.extensions).find((e) => e.constructor.name.includes("GroupBindEnforcement")) as any;
        await ext.poll();
        await flushPromises();

        expect(modelDevice.drift).toBeUndefined();
    });

    // --- interview tests ---

    it("Should sync groups and bindings when a device interview completes successfully", async () => {
        const device = devices.bulb_color;
        const target = devices.bulb;
        const targetEndpoint = target.getEndpoint(1)!;

        settings.set(["advanced", "group_bind_cooldown"], 10);
        settings.set(["advanced", "group_bind_missing"], "enforce");
        settings.set(["devices", device.ieeeAddr, "groups"], ["group_1"]);
        settings.set(["devices", device.ieeeAddr, "binds"], [{cluster: "genOnOff", to: "bulb", to_endpoint: 1, from_endpoint: 1}]);

        // Device has no groups or binds (simulating a rejoin after factory reset)
        device.bindingTable.mockResolvedValue([]);
        device.getEndpoint(1)!.binds = [];

        const ext = Array.from(controller.extensions).find((e) => e.constructor.name.includes("GroupBindEnforcement")) as any;
        // Restart to register the event listener
        await ext.stop();
        await ext.start();

        const modelDevice = controller.zigbee.resolveEntity(device.ieeeAddr) as Device;
        await ext.onDeviceInterview({device: modelDevice, status: "successful"});
        await flushPromises();

        expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining("interviewed successfully, syncing groups and bindings..."));
        expect(groups.group_1.members).toContain(device.getEndpoint(1));
        expect(device.getEndpoint(1)!.bind).toHaveBeenCalledWith("genOnOff", targetEndpoint);
    });

    it("Should NOT sync when device interview status is not successful", async () => {
        const device = devices.bulb_color;

        settings.set(["advanced", "group_bind_cooldown"], 10);
        settings.set(["devices", device.ieeeAddr, "groups"], ["group_1"]);

        const ext = Array.from(controller.extensions).find((e) => e.constructor.name.includes("GroupBindEnforcement")) as any;
        await ext.stop();
        await ext.start();

        const modelDevice = controller.zigbee.resolveEntity(device.ieeeAddr) as Device;
        await ext.onDeviceInterview({device: modelDevice, status: "started"});
        await ext.onDeviceInterview({device: modelDevice, status: "failed"});
        await flushPromises();

        expect(mockLogger.info).not.toHaveBeenCalledWith(expect.stringContaining("interviewed successfully"));
    });

    it("Should NOT sync on interview if device has no configured groups or binds", async () => {
        const device = devices.bulb_color;

        settings.set(["advanced", "group_bind_cooldown"], 10);
        const deviceConfig = settings.getDevice(device.ieeeAddr)!;
        delete (deviceConfig as any).groups;
        delete (deviceConfig as any).binds;

        const ext = Array.from(controller.extensions).find((e) => e.constructor.name.includes("GroupBindEnforcement")) as any;
        await ext.stop();
        await ext.start();

        const modelDevice = controller.zigbee.resolveEntity(device.ieeeAddr) as Device;
        await ext.onDeviceInterview({device: modelDevice, status: "successful"});
        await flushPromises();

        expect(mockLogger.info).not.toHaveBeenCalledWith(expect.stringContaining("interviewed successfully"));
    });

    // --- settings migration tests ---

    it("Should migrate group_bind_remove_unexpected: true to group_bind_unexpected: enforce", () => {
        settings.set(["advanced", "group_bind_remove_unexpected"], true);
        settings.reRead();
        const s = settings.get();
        expect(s.advanced.group_bind_unexpected).toBe("enforce");
        expect((s.advanced as any).group_bind_remove_unexpected).toBeUndefined();
    });

    it("Should migrate group_bind_remove_unexpected: false to group_bind_unexpected: accept", () => {
        settings.set(["advanced", "group_bind_remove_unexpected"], false);
        settings.reRead();
        const s = settings.get();
        expect(s.advanced.group_bind_unexpected).toBe("accept");
        expect((s.advanced as any).group_bind_remove_unexpected).toBeUndefined();
    });

    // --- bug-fix tests: legacy from_endpoint backfill ---

    it("Should backfill from_endpoint on legacy binds that match exactly one endpoint", async () => {
        // Legacy config: bind has no from_endpoint. The device has the bind
        // on endpoint 1 only. Pre-pass should write from_endpoint:1 back to
        // config so future polls scope the check correctly.
        const device = devices.bulb;
        const target = devices.bulb_color;
        const targetEndpoint = target.getEndpoint(1)!;
        device.getEndpoint(1)!.binds = [{cluster: {name: "genOnOff"}, target: targetEndpoint} as any];

        settings.set(["advanced", "group_bind_cooldown"], 10);
        settings.set(["advanced", "group_bind_missing"], "report");
        // Persist a legacy bind (no from_endpoint).
        settings.addBinding(device.ieeeAddr, "genOnOff", "bulb_color", 1);
        expect(settings.getDevice(device.ieeeAddr)!.binds![0].from_endpoint).toBeUndefined();

        const ext = Array.from(controller.extensions).find((e) => e.constructor.name.includes("GroupBindEnforcement")) as any;
        await ext.poll();
        await flushPromises();

        const persisted = settings.getDevice(device.ieeeAddr)!.binds!;
        expect(persisted[0].from_endpoint).toBe(1);
        // Sanity: no spurious "missing" drift on any endpoint.
        const driftItems = (controller.zigbee.resolveEntity(device.ieeeAddr) as Device).drift ?? [];
        expect(driftItems.find((d) => d.type === "bind" && d.direction === "missing_from_device")).toBeUndefined();
    });

    it("Should NOT backfill from_endpoint when a legacy bind has no on-device match", async () => {
        // Legacy bind exists in config but isn't on the device at all.
        // We must leave it as-is and let the regular missing-handler surface
        // it as drift on every endpoint that doesn't have it.
        const device = devices.bulb;
        // beforeEach clears endpoint.binds; nothing extra needed.

        settings.set(["advanced", "group_bind_cooldown"], 10);
        settings.set(["advanced", "group_bind_missing"], "report");
        settings.addBinding(device.ieeeAddr, "genOnOff", "bulb_color", 1);

        const ext = Array.from(controller.extensions).find((e) => e.constructor.name.includes("GroupBindEnforcement")) as any;
        await ext.poll();
        await flushPromises();

        const persisted = settings.getDevice(device.ieeeAddr)!.binds!;
        expect(persisted[0].from_endpoint).toBeUndefined();
    });

    // --- bug-fix tests: gating ---

    it("Should NOT sync on interview when enforcement is disabled (cooldown=0, no strategy)", async () => {
        // The pre-fix code would still run syncDeviceGroups/Binds when the
        // device had pre-configured groups/binds, even with poll disabled.
        const device = devices.bulb;
        const cfg = settings.getDevice(device.ieeeAddr)!;
        (cfg as any).binds = [{cluster: "genOnOff", to: "bulb_color", to_endpoint: 1, from_endpoint: 1}];
        // Clear any prior enforcement config to ensure the gate evaluates "disabled".
        settings.set(["advanced", "group_bind_cooldown"], 0);
        const persistedAdv = settings.getPersistedSettings().advanced as any;
        delete persistedAdv.group_bind_unexpected;
        delete persistedAdv.group_bind_missing;
        settings.reRead();

        const ext = Array.from(controller.extensions).find((e) => e.constructor.name.includes("GroupBindEnforcement")) as any;
        await ext.stop();
        await ext.start();

        const modelDevice = controller.zigbee.resolveEntity(device.ieeeAddr) as Device;
        await ext.onDeviceInterview({device: modelDevice, status: "successful"});
        await flushPromises();

        expect(device.bindingTable).not.toHaveBeenCalled();
        expect(mockLogger.info).not.toHaveBeenCalledWith(expect.stringContaining("interviewed successfully"));
    });
});
