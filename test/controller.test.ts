// biome-ignore assist/source/organizeImports: import mocks first
import {afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi} from "vitest";
import * as data from "./mocks/data";
import {mockLogger} from "./mocks/logger";
import {
    mockMQTTConnectAsync,
    mockMQTTEndAsync,
    events as mockMQTTEvents,
    mockMQTTPublishAsync,
    mockMQTTSubscribeAsync,
    mockMQTTUnsubscribeAsync,
} from "./mocks/mqtt";
import {flushPromises} from "./mocks/utils";
import type {Device as ZhDevice} from "./mocks/zigbeeHerdsman";
import {devices, mockController as mockZHController, events as mockZHEvents, returnDevices} from "./mocks/zigbeeHerdsman";

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import stringify from "json-stable-stringify-without-jsonify";
import tmp from "tmp";

import type {Mock, MockInstance} from "vitest";
import {Controller as ZHController} from "zigbee-herdsman";
import {Controller} from "../lib/controller";
import type Device from "../lib/model/device";
import * as settings from "../lib/util/settings";

const LOG_MQTT_NS = "z2m:mqtt";

const mockUnixDgramSend = vi.fn();

vi.mock("unix-dgram", () => ({
    createSocket: vi.fn(() => ({send: mockUnixDgramSend})),
}));

const mocksClear = [
    mockZHController.stop,
    mockMQTTEndAsync,
    mockMQTTPublishAsync,
    mockMQTTSubscribeAsync,
    mockMQTTUnsubscribeAsync,
    mockMQTTEndAsync,
    mockMQTTConnectAsync,
    devices.bulb_color.removeFromNetwork,
    devices.bulb.removeFromNetwork,
    mockLogger.log,
    mockLogger.debug,
    mockLogger.info,
    mockLogger.error,
    mockUnixDgramSend,
];

describe("Controller", () => {
    let controller: Controller;
    let mockExit: Mock;

    const getZ2MDevice = (zhDevice: string | number | ZhDevice): Device => {
        return controller.zigbee.resolveEntity(zhDevice)! as Device;
    };

    beforeAll(() => {
        vi.useFakeTimers();
    });

    beforeEach(() => {
        returnDevices.splice(0);
        mockExit = vi.fn();
        data.writeDefaultConfiguration();
        settings.reRead();
        controller = new Controller(vi.fn(), mockExit);
        for (const mock of mocksClear) mock.mockClear();
        settings.reRead();
        data.writeDefaultState();
    });

    afterAll(() => {
        vi.useRealTimers();
    });

    afterEach(async () => {
        await controller?.stop();
        await flushPromises();
    });

    it("Start controller", async () => {
        settings.setOnboarding(true);
        settings.set(["advanced", "transmit_power"], 14);
        await controller.start();
        expect(ZHController).toHaveBeenCalledWith({
            network: {
                panID: 6754,
                extendedPanID: [221, 221, 221, 221, 221, 221, 221, 221],
                channelList: [11],
                networkKey: [1, 3, 5, 7, 9, 11, 13, 15, 0, 2, 4, 6, 8, 10, 12, 13],
            },
            databasePath: path.join(data.mockDir, "database.db"),
            databaseBackupPath: path.join(data.mockDir, "database.db.backup"),
            backupPath: path.join(data.mockDir, "coordinator_backup.json"),
            acceptJoiningDeviceHandler: expect.any(Function),
            adapter: {concurrent: undefined, delay: undefined, disableLED: false, transmitPower: 14},
            serialPort: {baudRate: undefined, rtscts: undefined, path: "/dev/dummy"},
        });
        expect(mockZHController.start).toHaveBeenCalledTimes(1);
        expect(mockLogger.info).toHaveBeenCalledWith(`Currently ${Object.values(devices).length - 1} devices are joined.`);
        expect(mockLogger.info).toHaveBeenCalledWith(
            "bulb (0x000b57fffec6a5b2): LED1545G12 - IKEA TRADFRI bulb E26/E27, white spectrum, globe, opal, 980 lm (Router)",
        );
        expect(mockLogger.info).toHaveBeenCalledWith("remote (0x0017880104e45517): 324131092621 - Philips Hue dimmer switch (EndDevice)");
        expect(mockLogger.info).toHaveBeenCalledWith("0x0017880104e45518 (0x0017880104e45518): Not supported (EndDevice)");
        expect(mockMQTTConnectAsync).toHaveBeenCalledTimes(1);
        expect(mockMQTTConnectAsync).toHaveBeenCalledWith("mqtt://localhost", {
            will: {payload: Buffer.from('{"state":"offline"}'), retain: true, topic: "zigbee2mqtt/bridge/state", qos: 1},
            properties: {maximumPacketSize: 1048576},
            keepalive: 60,
            protocolVersion: 4,
        });
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith(
            "zigbee2mqtt/bulb",
            stringify({state: "ON", brightness: 50, color_temp: 370, linkquality: 99}),
            {retain: true, qos: 0},
        );
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith("zigbee2mqtt/remote", stringify({brightness: 255}), {retain: true, qos: 0});
        expect(settings.get().onboarding).toBeUndefined();
    });

    it("Start controller with specific MQTT settings", async () => {
        const ca = tmp.fileSync().name;
        fs.writeFileSync(ca, "ca");
        const key = tmp.fileSync().name;
        fs.writeFileSync(key, "key");
        const cert = tmp.fileSync().name;
        fs.writeFileSync(cert, "cert");

        const configuration = {
            base_topic: "zigbee2mqtt",
            server: "mqtt://localhost",
            keepalive: 30,
            ca,
            cert,
            key,
            password: "pass",
            user: "user1",
            client_id: "my_client_id",
            reject_unauthorized: false,
            version: 5,
            maximum_packet_size: 20000,
        };
        settings.set(["mqtt"], configuration);
        await controller.start();
        await flushPromises();
        expect(mockMQTTConnectAsync).toHaveBeenCalledTimes(1);
        const expected = {
            will: {payload: Buffer.from('{"state":"offline"}'), retain: true, topic: "zigbee2mqtt/bridge/state", qos: 1},
            keepalive: 30,
            ca: Buffer.from([99, 97]),
            key: Buffer.from([107, 101, 121]),
            cert: Buffer.from([99, 101, 114, 116]),
            password: "pass",
            username: "user1",
            clientId: "my_client_id",
            rejectUnauthorized: false,
            protocolVersion: 5,
            properties: {maximumPacketSize: 20000},
        };
        expect(mockMQTTConnectAsync).toHaveBeenCalledWith("mqtt://localhost", expected);
    });

    it("Start controller with only username MQTT settings", async () => {
        const ca = tmp.fileSync().name;
        fs.writeFileSync(ca, "ca");
        const key = tmp.fileSync().name;
        fs.writeFileSync(key, "key");
        const cert = tmp.fileSync().name;
        fs.writeFileSync(cert, "cert");

        const configuration = {
            base_topic: "zigbee2mqtt",
            server: "mqtt://localhost",
            keepalive: 30,
            ca,
            cert,
            key,
            user: "user1",
            client_id: "my_client_id",
            reject_unauthorized: false,
            version: 5,
            maximum_packet_size: 20000,
        };
        settings.set(["mqtt"], configuration);
        await controller.start();
        await flushPromises();
        expect(mockMQTTConnectAsync).toHaveBeenCalledTimes(1);
        const expected = {
            will: {payload: Buffer.from('{"state":"offline"}'), retain: true, topic: "zigbee2mqtt/bridge/state", qos: 1},
            keepalive: 30,
            ca: Buffer.from([99, 97]),
            key: Buffer.from([107, 101, 121]),
            cert: Buffer.from([99, 101, 114, 116]),
            username: "user1",
            clientId: "my_client_id",
            rejectUnauthorized: false,
            protocolVersion: 5,
            properties: {maximumPacketSize: 20000},
        };
        expect(mockMQTTConnectAsync).toHaveBeenCalledWith("mqtt://localhost", expected);
    });

    it("Should generate network_key, pan_id and ext_pan_id when set to GENERATE", async () => {
        settings.set(["advanced", "network_key"], "GENERATE");
        settings.set(["advanced", "pan_id"], "GENERATE");
        settings.set(["advanced", "ext_pan_id"], "GENERATE");
        await controller.start();
        await flushPromises();
        expect((ZHController as unknown as MockInstance).mock.calls[0][0].network.networkKey.length).toStrictEqual(16);
        expect((ZHController as unknown as MockInstance).mock.calls[0][0].network.extendedPanID.length).toStrictEqual(8);
        expect((ZHController as unknown as MockInstance).mock.calls[0][0].network.panID).toStrictEqual(expect.any(Number));
        expect(data.read().advanced.network_key.length).toStrictEqual(16);
        expect(data.read().advanced.ext_pan_id.length).toStrictEqual(8);
        expect(data.read().advanced.pan_id).toStrictEqual(expect.any(Number));
    });

    it("Start controller should publish cached states", async () => {
        data.writeDefaultState();
        await controller.start();
        await flushPromises();
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith(
            "zigbee2mqtt/bulb",
            stringify({state: "ON", brightness: 50, color_temp: 370, linkquality: 99}),
            {qos: 0, retain: true},
        );
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith("zigbee2mqtt/remote", stringify({brightness: 255}), {qos: 0, retain: true});
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith("zigbee2mqtt/group_1", stringify({state: "ON"}), {qos: 0, retain: false});
    });

    it("Start controller should not publish cached states when disabled", async () => {
        settings.set(["advanced", "cache_state_send_on_startup"], false);
        data.writeDefaultState();
        await controller.start();
        await flushPromises();
        const publishedTopics = mockMQTTPublishAsync.mock.calls.map((m) => m[0]);
        expect(publishedTopics).toEqual(expect.not.arrayContaining(["zigbee2mqtt/bulb", "zigbee2mqtt/remote"]));
    });

    it("Start controller should not publish cached states when cache_state is false", async () => {
        settings.set(["advanced", "cache_state"], false);
        data.writeDefaultState();
        await controller.start();
        await flushPromises();
        expect(mockMQTTPublishAsync).not.toHaveBeenCalledWith(
            "zigbee2mqtt/bulb",
            `{"state":"ON","brightness":50,"color_temp":370,"linkquality":99}`,
            {qos: 0, retain: true},
        );
        expect(mockMQTTPublishAsync).not.toHaveBeenCalledWith("zigbee2mqtt/remote", `{"brightness":255}`, {qos: 0, retain: true});
    });

    it("Log when MQTT client is unavailable", async () => {
        await controller.start();
        await flushPromises();
        mockLogger.error.mockClear();
        // @ts-expect-error private
        controller.mqtt.client.reconnecting = true;
        vi.advanceTimersByTime(11 * 1000);
        expect(mockLogger.error).toHaveBeenCalledWith("Not connected to MQTT server!");
        // @ts-expect-error private
        controller.mqtt.client.reconnecting = false;
    });

    it("Dont publish to mqtt when client is unavailable", async () => {
        await controller.start();
        await flushPromises();
        mockLogger.error.mockClear();
        // @ts-expect-error private
        controller.mqtt.client.reconnecting = true;
        const device = getZ2MDevice("bulb");
        await controller.publishEntityState(device, {
            state: "ON",
            brightness: 50,
            color_temp: 370,
            color: {r: 100, g: 50, b: 10},
            dummy: {1: "yes", 2: "no"},
        });
        await flushPromises();
        expect(mockLogger.error).toHaveBeenCalledTimes(2);
        expect(mockLogger.error).toHaveBeenCalledWith("Not connected to MQTT server!");
        expect(mockLogger.error).toHaveBeenCalledWith(
            'Cannot send message: topic: \'zigbee2mqtt/bulb\', payload: \'{"brightness":50,"color":{"b":10,"g":50,"r":100},"color_temp":370,"dummy":{"1":"yes","2":"no"},"linkquality":99,"state":"ON"}',
        );
        // @ts-expect-error private
        controller.mqtt.client.reconnecting = false;
    });

    it("Should not allow publishing wildcard characters in topic", async () => {
        await controller.start();
        await flushPromises();
        mockMQTTPublishAsync.mockClear();
        await controller.mqtt.publish("z2m/#/status", "empty");
        expect(mockMQTTPublishAsync).toHaveBeenCalledTimes(0);
        expect(mockLogger.error).toHaveBeenCalledWith(`Topic 'z2m/#/status' includes wildcard characters, skipping publish.`);
        await controller.mqtt.publish("z2m/+/status", "empty");
        expect(mockMQTTPublishAsync).toHaveBeenCalledTimes(0);
        expect(mockLogger.error).toHaveBeenCalledWith(`Topic 'z2m/+/status' includes wildcard characters, skipping publish.`);
    });

    it("Load empty state when state file does not exist", async () => {
        data.removeState();
        await controller.start();
        await flushPromises();
        // @ts-expect-error private
        expect(controller.state.state).toStrictEqual(new Map());
    });

    it("Should remove device not on passlist on startup", async () => {
        settings.set(["passlist"], [devices.bulb_color.ieeeAddr]);
        devices.bulb.removeFromNetwork.mockImplementationOnce(() => {
            throw new Error("dummy");
        });
        await controller.start();
        await flushPromises();
        expect(devices.bulb_color.removeFromNetwork).toHaveBeenCalledTimes(0);
        expect(devices.bulb.removeFromNetwork).toHaveBeenCalledTimes(1);
    });

    it("Should remove device on blocklist on startup", async () => {
        settings.set(["blocklist"], [devices.bulb_color.ieeeAddr]);
        await controller.start();
        await flushPromises();
        expect(devices.bulb_color.removeFromNetwork).toHaveBeenCalledTimes(1);
        expect(devices.bulb.removeFromNetwork).toHaveBeenCalledTimes(0);
    });

    it("Start controller fails", async () => {
        mockZHController.start.mockImplementationOnce(() => {
            throw new Error("failed");
        });
        await controller.start();
        expect(mockExit).toHaveBeenCalledTimes(1);
    });

    it("Start controller fails after onboarding", async () => {
        settings.setOnboarding(true);
        mockZHController.start.mockImplementationOnce(() => {
            throw new Error("failed");
        });
        await controller.start();
        expect(mockExit).toHaveBeenCalledTimes(1);
        expect(settings.get().onboarding).toStrictEqual(true);
    });

    it("Start controller fails due to MQTT connect error", async () => {
        mockMQTTConnectAsync.mockImplementationOnce(() => {
            throw new Error("addr not found");
        });
        await controller.start();
        await flushPromises();
        expect(mockLogger.error).toHaveBeenCalledWith("MQTT failed to connect, exiting... (addr not found)");
        expect(mockExit).toHaveBeenCalledTimes(1);
        expect(mockExit).toHaveBeenCalledWith(1, false);
    });

    it("Start controller fails due to MQTT connect error after onboarding", async () => {
        settings.setOnboarding(true);
        mockMQTTConnectAsync.mockImplementationOnce(() => {
            throw new Error("addr not found");
        });
        await controller.start();
        await flushPromises();
        expect(mockLogger.error).toHaveBeenCalledWith("MQTT failed to connect, exiting... (addr not found)");
        expect(mockExit).toHaveBeenCalledTimes(1);
        expect(mockExit).toHaveBeenCalledWith(1, false);
        expect(settings.get().onboarding).toStrictEqual(true);
    });

    it("Start controller and stop with restart", async () => {
        await controller.start();
        await controller.stop(true);
        expect(mockMQTTEndAsync).toHaveBeenCalledTimes(1);
        expect(mockZHController.stop).toHaveBeenCalledTimes(1);
        expect(mockExit).toHaveBeenCalledTimes(1);
        expect(mockExit).toHaveBeenCalledWith(0, true);
    });

    it("Start controller and stop without SdNotify", async () => {
        mockZHController.stop.mockRejectedValueOnce("failed");
        await controller.start();
        await controller.stop();
        expect(mockMQTTEndAsync).toHaveBeenCalledTimes(1);
        expect(mockZHController.stop).toHaveBeenCalledTimes(1);
        expect(mockExit).toHaveBeenCalledTimes(1);
        expect(mockExit).toHaveBeenCalledWith(1, false);
        expect(mockUnixDgramSend).toHaveBeenCalledTimes(0);
    });

    it("Start controller and stop with SdNotify", async () => {
        vi.spyOn(os, "platform").mockImplementationOnce(() => "linux");

        process.env.NOTIFY_SOCKET = "mocked"; // coverage

        mockZHController.stop.mockRejectedValueOnce("failed");
        await controller.start();
        await controller.stop();
        expect(mockMQTTEndAsync).toHaveBeenCalledTimes(1);
        expect(mockZHController.stop).toHaveBeenCalledTimes(1);
        expect(mockExit).toHaveBeenCalledTimes(1);
        expect(mockExit).toHaveBeenCalledWith(1, false);
        expect(mockUnixDgramSend).toHaveBeenCalledTimes(2);

        delete process.env.NOTIFY_SOCKET;
    });

    it("Start controller adapter disconnects", async () => {
        // Fail to stop extension exit code 1 should not override adapter disconnect exit code 2
        vi.spyOn(Array.from(controller.extensions)[0], "stop").mockRejectedValueOnce(new Error("failed"));
        await controller.start();
        await mockZHEvents.adapterDisconnected();
        await flushPromises();
        expect(mockMQTTEndAsync).toHaveBeenCalledTimes(1);
        expect(mockZHController.stop).toHaveBeenCalledTimes(1);
        expect(mockExit).toHaveBeenCalledTimes(1);
        expect(mockExit).toHaveBeenCalledWith(2, false);
    });

    it("does not throw when extension fails to stop on controller stop", async () => {
        vi.spyOn(Array.from(controller.extensions)[0], "stop").mockRejectedValueOnce(new Error("failed"));
        await controller.start();
        await flushPromises();
        await controller.stop();
        await flushPromises();
        expect(mockMQTTEndAsync).toHaveBeenCalledTimes(1);
        expect(mockExit).toHaveBeenCalledTimes(1);
        expect(mockExit).toHaveBeenCalledWith(1, false);
    });

    it("does not throw when extension stop throws", async () => {
        const ext = Array.from(controller.extensions)[0];
        vi.spyOn(ext, "stop").mockRejectedValueOnce(new Error("failed"));
        await controller.start();
        await flushPromises();
        await controller.removeExtension(ext);
        expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining("Failed to stop"));
    });

    it("Handles reconnecting to MQTT", async () => {
        await controller.start();
        await flushPromises();

        mockLogger.error.mockClear();
        mockLogger.info.mockClear();

        mockMQTTEvents.error(new Error("ECONNRESET"));
        // @ts-expect-error private
        controller.mqtt.client.reconnecting = true;
        expect(mockLogger.error).toHaveBeenCalledWith("MQTT error: ECONNRESET");

        await vi.advanceTimersByTimeAsync(11000);
        expect(mockLogger.error).toHaveBeenCalledWith("Not connected to MQTT server!");

        // @ts-expect-error private
        controller.mqtt.client.reconnecting = false;
        await mockMQTTEvents.connect();
        expect(mockLogger.info).toHaveBeenCalledWith("Connected to MQTT server");
    });

    it("Handles reconnecting to MQTT after v5+ DISCONNECT", async () => {
        settings.set(["mqtt", "version"], 5);
        await controller.start();
        await flushPromises();

        mockLogger.error.mockClear();
        mockLogger.info.mockClear();
        mockMQTTEvents.disconnect({
            reasonCode: 149,
            properties: {reasonString: "Maximum packet size was exceeded"},
        });
        // @ts-expect-error private
        controller.mqtt.client.disconnecting = true;
        expect(mockLogger.error).toHaveBeenCalledWith("MQTT disconnect: reason 149 (Maximum packet size was exceeded)");

        await vi.advanceTimersByTimeAsync(11000);
        expect(mockLogger.error).toHaveBeenCalledWith("Not connected to MQTT server!");

        // @ts-expect-error private
        controller.mqtt.client.disconnecting = false;
        await mockMQTTEvents.connect();
        expect(mockLogger.info).toHaveBeenCalledWith("Connected to MQTT server");
    });

    it("Handles MQTT publish error", async () => {
        await controller.start();
        await flushPromises();
        mockMQTTPublishAsync.mockClear();
        // fail on device_joined (has skipLog=false)
        mockMQTTPublishAsync.mockImplementationOnce(mockMQTTPublishAsync.getMockImplementation()!).mockImplementationOnce(() => {
            throw new Error("client disconnecting");
        });
        await mockZHEvents.deviceJoined({device: devices.bulb});
        await flushPromises();

        expect(mockLogger.error).toHaveBeenCalledWith("MQTT server error: client disconnecting");
    });

    it("Handle mqtt message", async () => {
        const spyEventbusEmitMQTTMessage = vi.spyOn(controller.eventBus, "emitMQTTMessage").mockImplementation(vi.fn());

        await controller.start();
        mockLogger.debug.mockClear();
        await mockMQTTEvents.message("dummytopic", "dummymessage");
        expect(spyEventbusEmitMQTTMessage).toHaveBeenCalledWith({topic: "dummytopic", message: "dummymessage"});
        expect(mockLogger.log).toHaveBeenCalledWith("debug", "Received MQTT message on 'dummytopic' with data 'dummymessage'", LOG_MQTT_NS);
    });

    it("Skip MQTT messages on topic we published to", async () => {
        const spyEventbusEmitMQTTMessage = vi.spyOn(controller.eventBus, "emitMQTTMessage").mockImplementation(vi.fn());

        await controller.start();
        mockLogger.debug.mockClear();
        await mockMQTTEvents.message("zigbee2mqtt/skip-this-topic", "skipped");
        expect(spyEventbusEmitMQTTMessage).toHaveBeenCalledWith({topic: "zigbee2mqtt/skip-this-topic", message: "skipped"});
        mockLogger.debug.mockClear();
        await controller.mqtt.publish("skip-this-topic", "", {});
        await mockMQTTEvents.message("zigbee2mqtt/skip-this-topic", "skipped");
        expect(mockLogger.debug).toHaveBeenCalledTimes(0);
    });

    it("On zigbee event message", async () => {
        await controller.start();
        const device = devices.bulb;
        const payload = {
            device,
            endpoint: device.getEndpoint(1),
            type: "attributeReport",
            linkquality: 10,
            cluster: "genBasic",
            data: {modelId: device.modelID},
        };
        await mockZHEvents.message(payload);
        await flushPromises();
        expect(mockLogger.log).toHaveBeenCalledWith(
            "debug",
            `Received Zigbee message from 'bulb', type 'attributeReport', cluster 'genBasic', data '{"modelId":"TRADFRI bulb E27 WS opal 980lm"}' from endpoint 1`,
            "z2m",
        );
    });

    it("On zigbee event message with group ID", async () => {
        await controller.start();
        const device = devices.bulb;
        const payload = {
            device,
            endpoint: device.getEndpoint(1),
            type: "attributeReport",
            linkquality: 10,
            groupID: 0,
            cluster: "genBasic",
            data: {modelId: device.modelID},
        };
        await mockZHEvents.message(payload);
        await flushPromises();
        expect(mockLogger.log).toHaveBeenCalledWith(
            "debug",
            `Received Zigbee message from 'bulb', type 'attributeReport', cluster 'genBasic', data '{"modelId":"TRADFRI bulb E27 WS opal 980lm"}' from endpoint 1 with groupID 0`,
            "z2m",
        );
    });

    it("Should add entities which are missing from configuration but are in database to configuration", async () => {
        await controller.start();
        const device = devices.notInSettings;
        expect(settings.getDevice(device.ieeeAddr)).not.toBeUndefined();
    });

    it("On zigbee deviceJoined", async () => {
        await controller.start();
        const device = devices.bulb;
        const payload = {device};
        await mockZHEvents.deviceJoined(payload);
        await flushPromises();
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith(
            "zigbee2mqtt/bridge/event",
            stringify({type: "device_joined", data: {friendly_name: "bulb", ieee_address: device.ieeeAddr}}),
            {},
        );
    });

    it("acceptJoiningDeviceHandler reject device on blocklist", async () => {
        await controller.start();
        const device = devices.bulb;
        settings.set(["blocklist"], [device.ieeeAddr]);
        const handler = (ZHController as unknown as MockInstance).mock.calls[0][0].acceptJoiningDeviceHandler;
        expect(await handler(device.ieeeAddr)).toBe(false);
    });

    it("acceptJoiningDeviceHandler accept device not on blocklist", async () => {
        await controller.start();
        const device = devices.bulb;
        settings.set(["blocklist"], ["123"]);
        const handler = (ZHController as unknown as MockInstance).mock.calls[0][0].acceptJoiningDeviceHandler;
        expect(await handler(device.ieeeAddr)).toBe(true);
    });

    it("acceptJoiningDeviceHandler accept device on passlist", async () => {
        await controller.start();
        const device = devices.bulb;
        settings.set(["passlist"], [device.ieeeAddr]);
        const handler = (ZHController as unknown as MockInstance).mock.calls[0][0].acceptJoiningDeviceHandler;
        expect(await handler(device.ieeeAddr)).toBe(true);
    });

    it("acceptJoiningDeviceHandler reject device not in passlist", async () => {
        await controller.start();
        const device = devices.bulb;
        settings.set(["passlist"], ["123"]);
        const handler = (ZHController as unknown as MockInstance).mock.calls[0][0].acceptJoiningDeviceHandler;
        expect(await handler(device.ieeeAddr)).toBe(false);
    });

    it("acceptJoiningDeviceHandler should prefer passlist above blocklist", async () => {
        await controller.start();
        const device = devices.bulb;
        settings.set(["passlist"], [device.ieeeAddr]);
        settings.set(["blocklist"], [device.ieeeAddr]);
        const handler = (ZHController as unknown as MockInstance).mock.calls[0][0].acceptJoiningDeviceHandler;
        expect(await handler(device.ieeeAddr)).toBe(true);
    });

    it("acceptJoiningDeviceHandler accept when not on blocklist and passlist", async () => {
        await controller.start();
        const device = devices.bulb;
        const handler = (ZHController as unknown as MockInstance).mock.calls[0][0].acceptJoiningDeviceHandler;
        expect(await handler(device.ieeeAddr)).toBe(true);
    });

    it("Shouldnt crash when two device join events are received", async () => {
        await controller.start();
        const device = devices.bulb;
        const payload = {device};
        mockZHEvents.deviceJoined(payload);
        mockZHEvents.deviceJoined(payload);
        await flushPromises();
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith(
            "zigbee2mqtt/bridge/event",
            stringify({type: "device_joined", data: {friendly_name: "bulb", ieee_address: device.ieeeAddr}}),
            {},
        );
    });

    it("On zigbee deviceInterview started", async () => {
        await controller.start();
        const device = devices.bulb;
        const payload = {device, status: "started"};
        await mockZHEvents.deviceInterview(payload);
        await flushPromises();
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith(
            "zigbee2mqtt/bridge/event",
            stringify({type: "device_interview", data: {friendly_name: "bulb", status: "started", ieee_address: device.ieeeAddr}}),
            {},
        );
    });

    it("On zigbee deviceInterview failed", async () => {
        await controller.start();
        const device = devices.bulb;
        const payload = {device, status: "failed"};
        await mockZHEvents.deviceInterview(payload);
        await flushPromises();
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith(
            "zigbee2mqtt/bridge/event",
            stringify({type: "device_interview", data: {friendly_name: "bulb", status: "failed", ieee_address: device.ieeeAddr}}),
            {},
        );
    });

    it("On zigbee deviceInterview successful supported", async () => {
        await controller.start();
        mockMQTTPublishAsync.mockClear();
        const device = devices.bulb;
        const payload = {device, status: "successful"};
        await mockZHEvents.deviceInterview(payload);
        await flushPromises();
        expect(mockMQTTPublishAsync.mock.calls[1][0]).toStrictEqual("zigbee2mqtt/bridge/event");
        const parsedMessage = JSON.parse(mockMQTTPublishAsync.mock.calls[1][1]);
        expect(parsedMessage.type).toStrictEqual("device_interview");
        expect(parsedMessage.data.friendly_name).toStrictEqual("bulb");
        expect(parsedMessage.data.status).toStrictEqual("successful");
        expect(parsedMessage.data.ieee_address).toStrictEqual(device.ieeeAddr);
        expect(parsedMessage.data.supported).toStrictEqual(true);
        expect(parsedMessage.data.definition.model).toStrictEqual("LED1545G12");
        expect(parsedMessage.data.definition.vendor).toStrictEqual("IKEA");
        expect(parsedMessage.data.definition.description).toStrictEqual("TRADFRI bulb E26/E27, white spectrum, globe, opal, 980 lm");
        expect(parsedMessage.data.definition.exposes).toStrictEqual(expect.any(Array));
        expect(parsedMessage.data.definition.options).toStrictEqual(expect.any(Array));
        expect(mockMQTTPublishAsync.mock.calls[1][2]).toStrictEqual({});
    });

    it("On zigbee deviceInterview successful not supported", async () => {
        await controller.start();
        mockMQTTPublishAsync.mockClear();
        const device = devices.unsupported;
        const payload = {device, status: "successful"};
        await mockZHEvents.deviceInterview(payload);
        await flushPromises();
        expect(mockMQTTPublishAsync.mock.calls[1][0]).toStrictEqual("zigbee2mqtt/bridge/event");
        const parsedMessage = JSON.parse(mockMQTTPublishAsync.mock.calls[1][1]);
        expect(parsedMessage.type).toStrictEqual("device_interview");
        expect(parsedMessage.data.friendly_name).toStrictEqual(device.ieeeAddr);
        expect(parsedMessage.data.status).toStrictEqual("successful");
        expect(parsedMessage.data.ieee_address).toStrictEqual(device.ieeeAddr);
        expect(parsedMessage.data.supported).toStrictEqual(false);
        expect(parsedMessage.data.definition.model).toStrictEqual("notSupportedModelID");
        expect(parsedMessage.data.definition.vendor).toStrictEqual("notSupportedMfg");
        expect(parsedMessage.data.definition.description).toStrictEqual("Automatically generated definition");
        expect(parsedMessage.data.definition.exposes).toStrictEqual(expect.any(Array));
        expect(parsedMessage.data.definition.options).toStrictEqual(expect.any(Array));
        expect(mockMQTTPublishAsync.mock.calls[1][2]).toStrictEqual({});
    });

    it("On zigbee event device announce", async () => {
        await controller.start();
        const device = devices.bulb;
        const payload = {device};
        await mockZHEvents.deviceAnnounce(payload);
        await flushPromises();
        expect(mockLogger.debug).toHaveBeenCalledWith(`Device 'bulb' announced itself`);
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith(
            "zigbee2mqtt/bridge/event",
            stringify({type: "device_announce", data: {friendly_name: "bulb", ieee_address: device.ieeeAddr}}),
            {},
        );
    });

    it("On zigbee event device leave (removed from database and settings)", async () => {
        await controller.start();
        returnDevices.push("0x00124b00120144ae");
        settings.set(["devices"], {});
        mockMQTTPublishAsync.mockClear();
        const device = devices.bulb;
        const payload = {ieeeAddr: device.ieeeAddr};
        await mockZHEvents.deviceLeave(payload);
        await flushPromises();
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith(
            "zigbee2mqtt/bridge/event",
            stringify({type: "device_leave", data: {ieee_address: device.ieeeAddr, friendly_name: device.ieeeAddr}}),
            {},
        );
    });

    it("On zigbee event device leave (removed from database and NOT settings)", async () => {
        await controller.start();
        returnDevices.push("0x00124b00120144ae");
        const device = devices.bulb;
        mockMQTTPublishAsync.mockClear();
        const payload = {ieeeAddr: device.ieeeAddr};
        await mockZHEvents.deviceLeave(payload);
        await flushPromises();
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith(
            "zigbee2mqtt/bridge/event",
            stringify({type: "device_leave", data: {ieee_address: device.ieeeAddr, friendly_name: "bulb"}}),
            {},
        );
    });

    it("Publish entity state attribute output", async () => {
        await controller.start();
        settings.set(["advanced", "output"], "attribute");
        mockMQTTPublishAsync.mockClear();
        const device = getZ2MDevice("bulb");
        await controller.publishEntityState(device, {
            dummy: {1: "yes", 2: "no"},
            color: {r: 100, g: 50, b: 10},
            state: "ON",
            test: undefined,
            test1: null,
            color_temp: 370,
            brightness: 50,
        });
        await flushPromises();
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith("zigbee2mqtt/bulb/state", "ON", {qos: 0, retain: true});
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith("zigbee2mqtt/bulb/brightness", "50", {qos: 0, retain: true});
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith("zigbee2mqtt/bulb/color_temp", "370", {qos: 0, retain: true});
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith("zigbee2mqtt/bulb/color", "100,50,10", {qos: 0, retain: true});
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith("zigbee2mqtt/bulb/dummy-1", "yes", {qos: 0, retain: true});
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith("zigbee2mqtt/bulb/dummy-2", "no", {qos: 0, retain: true});
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith("zigbee2mqtt/bulb/test1", "", {qos: 0, retain: true});
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith("zigbee2mqtt/bulb/test", "", {qos: 0, retain: true});
    });

    it("Publish entity state attribute_json output", async () => {
        await controller.start();
        settings.set(["advanced", "output"], "attribute_and_json");
        mockMQTTPublishAsync.mockClear();
        const device = getZ2MDevice("bulb");
        await controller.publishEntityState(device, {state: "ON", brightness: 200, color_temp: 370, linkquality: 99});
        await flushPromises();
        expect(mockMQTTPublishAsync).toHaveBeenCalledTimes(5);
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith("zigbee2mqtt/bulb/state", "ON", {qos: 0, retain: true});
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith("zigbee2mqtt/bulb/brightness", "200", {qos: 0, retain: true});
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith("zigbee2mqtt/bulb/color_temp", "370", {qos: 0, retain: true});
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith("zigbee2mqtt/bulb/linkquality", "99", {qos: 0, retain: true});
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith(
            "zigbee2mqtt/bulb",
            stringify({state: "ON", brightness: 200, color_temp: 370, linkquality: 99}),
            {qos: 0, retain: true},
        );
    });

    it("Publish entity state attribute_json output filtered", async () => {
        await controller.start();
        settings.set(["advanced", "output"], "attribute_and_json");
        settings.set(["devices", devices.bulb.ieeeAddr, "filtered_attributes"], ["color_temp", "linkquality"]);
        mockMQTTPublishAsync.mockClear();
        const device = getZ2MDevice("bulb");
        await controller.publishEntityState(device, {state: "ON", brightness: 200, color_temp: 370, linkquality: 99});
        await flushPromises();
        expect(mockMQTTPublishAsync).toHaveBeenCalledTimes(3);
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith("zigbee2mqtt/bulb/state", "ON", {qos: 0, retain: true});
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith("zigbee2mqtt/bulb/brightness", "200", {qos: 0, retain: true});
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith("zigbee2mqtt/bulb", stringify({state: "ON", brightness: 200}), {qos: 0, retain: true});
    });

    it("Publish entity state attribute_json output filtered (device_options)", async () => {
        await controller.start();
        settings.set(["advanced", "output"], "attribute_and_json");
        settings.set(["device_options", "filtered_attributes"], ["color_temp", "linkquality"]);
        mockMQTTPublishAsync.mockClear();
        const device = getZ2MDevice("bulb");
        await controller.publishEntityState(device, {state: "ON", brightness: 200, color_temp: 370, linkquality: 99});
        await flushPromises();
        expect(mockMQTTPublishAsync).toHaveBeenCalledTimes(3);
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith("zigbee2mqtt/bulb/state", "ON", {qos: 0, retain: true});
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith("zigbee2mqtt/bulb/brightness", "200", {qos: 0, retain: true});
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith("zigbee2mqtt/bulb", stringify({state: "ON", brightness: 200}), {qos: 0, retain: true});
    });

    it("Publish entity state attribute_json output filtered cache", async () => {
        await controller.start();
        settings.set(["advanced", "output"], "attribute_and_json");
        settings.set(["devices", devices.bulb.ieeeAddr, "filtered_cache"], ["linkquality"]);
        mockMQTTPublishAsync.mockClear();

        const device = getZ2MDevice("bulb");
        expect(controller.state.get(device)).toStrictEqual({brightness: 50, color_temp: 370, linkquality: 99, state: "ON"});

        await controller.publishEntityState(device, {state: "ON", brightness: 200, color_temp: 370, linkquality: 87});
        await flushPromises();

        expect(controller.state.get(device)).toStrictEqual({brightness: 200, color_temp: 370, state: "ON"});
        expect(mockMQTTPublishAsync).toHaveBeenCalledTimes(5);
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith("zigbee2mqtt/bulb/state", "ON", {qos: 0, retain: true});
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith("zigbee2mqtt/bulb/brightness", "200", {qos: 0, retain: true});
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith("zigbee2mqtt/bulb/linkquality", "87", {qos: 0, retain: true});
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith(
            "zigbee2mqtt/bulb",
            stringify({state: "ON", brightness: 200, color_temp: 370, linkquality: 87}),
            {qos: 0, retain: true},
        );
    });

    it("Publish entity state attribute_json output filtered cache (device_options)", async () => {
        await controller.start();
        settings.set(["advanced", "output"], "attribute_and_json");
        settings.set(["device_options", "filtered_cache"], ["linkquality"]);
        mockMQTTPublishAsync.mockClear();

        const device = getZ2MDevice("bulb");
        expect(controller.state.get(device)).toStrictEqual({brightness: 50, color_temp: 370, linkquality: 99, state: "ON"});

        await controller.publishEntityState(device, {state: "ON", brightness: 200, color_temp: 370, linkquality: 87});
        await flushPromises();

        expect(controller.state.get(device)).toStrictEqual({brightness: 200, color_temp: 370, state: "ON"});
        expect(mockMQTTPublishAsync).toHaveBeenCalledTimes(5);
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith("zigbee2mqtt/bulb/state", "ON", {qos: 0, retain: true});
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith("zigbee2mqtt/bulb/brightness", "200", {qos: 0, retain: true});
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith("zigbee2mqtt/bulb/linkquality", "87", {qos: 0, retain: true});
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith(
            "zigbee2mqtt/bulb",
            stringify({state: "ON", brightness: 200, color_temp: 370, linkquality: 87}),
            {qos: 0, retain: true},
        );
    });

    it("Publish entity state with device information", async () => {
        await controller.start();
        settings.set(["mqtt", "include_device_information"], true);
        mockMQTTPublishAsync.mockClear();
        let device = getZ2MDevice("bulb");
        await controller.publishEntityState(device, {state: "ON"});
        await flushPromises();
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith(
            "zigbee2mqtt/bulb",
            stringify({
                state: "ON",
                brightness: 50,
                color_temp: 370,
                linkquality: 99,
                device: {
                    friendlyName: "bulb",
                    model: "LED1545G12",
                    ieeeAddr: "0x000b57fffec6a5b2",
                    networkAddress: 40369,
                    type: "Router",
                    manufacturerID: 4476,
                    powerSource: "Mains (single phase)",
                },
            }),
            {qos: 0, retain: true},
        );

        // Unsupported device should have model "unknown"
        device = getZ2MDevice("unsupported2");
        await controller.publishEntityState(device, {state: "ON"});
        await flushPromises();
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith(
            "zigbee2mqtt/unsupported2",
            stringify({
                state: "ON",
                device: {
                    friendlyName: "unsupported2",
                    model: "notSupportedModelID",
                    ieeeAddr: "0x0017880104e45529",
                    networkAddress: 6536,
                    type: "EndDevice",
                    manufacturerID: 0,
                    powerSource: "Battery",
                },
            }),
            {qos: 0, retain: false},
        );
    });

    it("Should publish entity state without retain", async () => {
        await controller.start();
        settings.set(["devices", devices.bulb.ieeeAddr, "retain"], false);
        mockMQTTPublishAsync.mockClear();
        const device = getZ2MDevice("bulb");
        await controller.publishEntityState(device, {state: "ON"});
        await flushPromises();
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith(
            "zigbee2mqtt/bulb",
            stringify({state: "ON", brightness: 50, color_temp: 370, linkquality: 99}),
            {qos: 0, retain: false},
        );
    });

    it("Should publish entity state with retain", async () => {
        await controller.start();
        settings.set(["devices", devices.bulb.ieeeAddr, "retain"], true);
        mockMQTTPublishAsync.mockClear();
        const device = getZ2MDevice("bulb");
        await controller.publishEntityState(device, {state: "ON"});
        await flushPromises();
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith(
            "zigbee2mqtt/bulb",
            stringify({state: "ON", brightness: 50, color_temp: 370, linkquality: 99}),
            {qos: 0, retain: true},
        );
    });

    it("Should publish entity state with expiring retention", async () => {
        await controller.start();
        settings.set(["mqtt", "version"], 5);
        settings.set(["devices", devices.bulb.ieeeAddr, "retain"], true);
        settings.set(["devices", devices.bulb.ieeeAddr, "retention"], 37);
        mockMQTTPublishAsync.mockClear();
        const device = getZ2MDevice("bulb");
        await controller.publishEntityState(device, {state: "ON"});
        await flushPromises();
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith(
            "zigbee2mqtt/bulb",
            stringify({state: "ON", brightness: 50, color_temp: 370, linkquality: 99}),
            {qos: 0, retain: true, properties: {messageExpiryInterval: 37}},
        );
    });

    it("Publish entity state no empty messages", async () => {
        data.writeEmptyState();
        await controller.start();
        mockMQTTPublishAsync.mockClear();
        const device = getZ2MDevice("bulb");
        await controller.publishEntityState(device, {});
        await flushPromises();
        expect(mockMQTTPublishAsync).toHaveBeenCalledTimes(0);
    });

    it("Should allow to disable state persistency", async () => {
        settings.set(["advanced", "cache_state_persistent"], false);
        data.removeState();
        await controller.start();
        mockMQTTPublishAsync.mockClear();
        const device = getZ2MDevice("bulb");
        await controller.publishEntityState(device, {state: "ON"});
        await controller.publishEntityState(device, {brightness: 200});
        await flushPromises();
        expect(mockMQTTPublishAsync).toHaveBeenCalledTimes(2);
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith("zigbee2mqtt/bulb", stringify({state: "ON"}), {qos: 0, retain: true});
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith("zigbee2mqtt/bulb", stringify({state: "ON", brightness: 200}), {qos: 0, retain: true});
        await controller.stop();
        expect(data.stateExists()).toBeFalsy();
    });

    it("Shouldnt crash when it cannot save state", async () => {
        data.removeState();
        await controller.start();
        mockLogger.error.mockClear();
        // @ts-expect-error private
        controller.state.file = "/";
        // @ts-expect-error private
        controller.state.save();
        expect(mockLogger.error).toHaveBeenCalledWith(expect.stringMatching(/Failed to write state to '\/'/));
    });

    it("Publish should not cache when set", async () => {
        settings.set(["advanced", "cache_state"], false);
        data.writeEmptyState();
        await controller.start();
        mockMQTTPublishAsync.mockClear();
        const device = getZ2MDevice("bulb");
        await controller.publishEntityState(device, {state: "ON"});
        await controller.publishEntityState(device, {brightness: 200});
        await flushPromises();
        expect(mockMQTTPublishAsync).toHaveBeenCalledTimes(2);
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith("zigbee2mqtt/bulb", stringify({state: "ON"}), {qos: 0, retain: true});
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith("zigbee2mqtt/bulb", stringify({brightness: 200}), {qos: 0, retain: true});
    });

    it("Should start when state is corrupted", async () => {
        fs.writeFileSync(path.join(data.mockDir, "state.json"), "corrupted");
        await controller.start();
        await flushPromises();
        // @ts-expect-error private
        expect(controller.state.state).toStrictEqual(new Map());
    });

    it("Start controller with force_disable_retain", async () => {
        settings.set(["mqtt", "force_disable_retain"], true);
        await controller.start();
        await flushPromises();
        expect(mockMQTTConnectAsync).toHaveBeenCalledTimes(1);
        const expected = {
            will: {payload: Buffer.from('{"state":"offline"}'), retain: false, topic: "zigbee2mqtt/bridge/state", qos: 1},
            keepalive: 60,
            protocolVersion: 4,
            properties: {maximumPacketSize: 1048576},
        };
        expect(mockMQTTConnectAsync).toHaveBeenCalledWith("mqtt://localhost", expected);
    });

    it("Should republish retained messages on MQTT initial connect", async () => {
        await controller.start();
        await flushPromises();

        const retainedMessages = Object.keys(controller.mqtt.retainedMessages).length;

        mockMQTTPublishAsync.mockClear();
        await vi.advanceTimersByTimeAsync(2500); // before any startup configure triggers

        expect(mockMQTTPublishAsync).toHaveBeenCalledTimes(retainedMessages);
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith("zigbee2mqtt/bridge/info", expect.any(String), {retain: true});
    });

    it("Should not republish retained messages on MQTT initial connect when retained message are sent", async () => {
        await controller.start();
        await flushPromises();
        mockMQTTPublishAsync.mockClear();
        await mockMQTTEvents.message("zigbee2mqtt/bridge/info", "dummy");
        await vi.advanceTimersByTimeAsync(2500); // before any startup configure triggers

        expect(mockMQTTPublishAsync).toHaveBeenCalledTimes(0);
    });

    it("Should prevent any message being published with retain flag when force_disable_retain is set", async () => {
        settings.set(["mqtt", "force_disable_retain"], true);
        await controller.mqtt.connect();
        mockMQTTPublishAsync.mockClear();
        // @ts-expect-error private
        await controller.mqtt.publish("fo", "bar", {retain: true});
        await flushPromises();
        expect(mockMQTTPublishAsync).toHaveBeenCalledTimes(1);
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith("zigbee2mqtt/fo", "bar", {retain: false});
    });

    it("Should publish last seen changes", async () => {
        settings.set(["advanced", "last_seen"], "epoch");
        await controller.start();
        await flushPromises();
        mockMQTTPublishAsync.mockClear();
        const device = devices.remote;
        await mockZHEvents.lastSeenChanged({device, reason: "deviceAnnounce"});
        expect(mockMQTTPublishAsync).toHaveBeenCalledTimes(1);
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith("zigbee2mqtt/remote", stringify({brightness: 255, last_seen: 1000}), {
            qos: 0,
            retain: true,
        });
    });

    it("Should not publish last seen changes when reason is messageEmitted", async () => {
        settings.set(["advanced", "last_seen"], "epoch");
        await controller.start();
        await flushPromises();
        mockMQTTPublishAsync.mockClear();
        const device = devices.remote;
        await mockZHEvents.lastSeenChanged({device, reason: "messageEmitted"});
        expect(mockMQTTPublishAsync).toHaveBeenCalledTimes(0);
    });

    it("Ignore messages from coordinator", async () => {
        // https://github.com/Koenkk/zigbee2mqtt/issues/9218
        await controller.start();
        const device = devices.coordinator;
        const payload = {
            device,
            endpoint: device.getEndpoint(1),
            type: "attributeReport",
            linkquality: 10,
            cluster: "genBasic",
            data: {modelId: device.modelID},
        };
        await mockZHEvents.message(payload);
        await flushPromises();
        expect(mockLogger.log).toHaveBeenCalledWith(
            "debug",
            `Received Zigbee message from 'Coordinator', type 'attributeReport', cluster 'genBasic', data '{}' from endpoint 1, ignoring since it is from coordinator`,
            "z2m",
        );
    });

    it("Should remove state of removed device when stopped", async () => {
        await controller.start();
        const device = getZ2MDevice("bulb");
        expect(controller.state.get(device)).toStrictEqual({brightness: 50, color_temp: 370, linkquality: 99, state: "ON"});
        device.zh.isDeleted = true;
        await controller.stop();
        // @ts-expect-error private
        expect(controller.state.state.get(device.ieeeAddr)).toStrictEqual(undefined);
    });

    it("EventBus should handle sync errors", async () => {
        const eventbus = controller.eventBus;
        const callback = vi.fn().mockImplementation(() => {
            throw new Error("Whoops!");
        });
        eventbus.onStateChange({constructor: {name: "Test"}}, callback);
        eventbus.emitStateChange({});
        await flushPromises();
        expect(callback).toHaveBeenCalledTimes(1);
        expect(mockLogger.error).toHaveBeenCalledWith(`EventBus error 'Test/stateChange': Whoops!`);
    });

    it("EventBus should handle async errors", async () => {
        const eventbus = controller.eventBus;
        const callback = vi.fn().mockRejectedValue(new Error("Whoops!"));
        eventbus.onStateChange({constructor: {name: "Test"}}, callback);
        eventbus.emitStateChange({});
        await flushPromises();
        expect(callback).toHaveBeenCalledTimes(1);
        expect(mockLogger.error).toHaveBeenCalledWith(`EventBus error 'Test/stateChange': Whoops!`);
    });

    it("prevents interacting with invalid extensions", async () => {
        await controller.start();

        await expect(async () => {
            await controller.enableDisableExtension(true, "Fake");
        }).rejects.toThrow("Extension Fake does not exist (should be added with 'addExtension') or is built-in that cannot be enabled at runtime");

        await expect(async () => {
            await controller.enableDisableExtension(false, "Availability");
        }).rejects.toThrow("Built-in extension Availability cannot be disabled at runtime");
    });
});
