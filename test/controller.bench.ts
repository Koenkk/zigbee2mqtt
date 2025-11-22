import {existsSync, mkdirSync} from "node:fs";
import stringify from "json-stable-stringify-without-jsonify";
import {bench, describe, vi} from "vitest";
import {type Controller, Zcl, Zdo, ZSpec} from "zigbee-herdsman";
import type Adapter from "zigbee-herdsman/dist/adapter/adapter";
import type {ZclPayload} from "zigbee-herdsman/dist/adapter/events";
import {Device, InterviewState} from "zigbee-herdsman/dist/controller/model/device";
import {Endpoint} from "zigbee-herdsman/dist/controller/model/endpoint";
import Entity from "zigbee-herdsman/dist/controller/model/entity";
import {Group} from "zigbee-herdsman/dist/controller/model/group";
import type {DeviceType} from "zigbee-herdsman/dist/controller/tstype";
import {Foundation} from "zigbee-herdsman/dist/zspec/zcl/definition/foundation";
import type {RequestToResponseMap} from "zigbee-herdsman/dist/zspec/zdo/definition/tstypes";
import data from "../lib/util/data";
import {BENCH_OPTIONS} from "./benchOptions";

vi.doMock("zigbee-herdsman", async (importOriginal) => {
    const actual = await importOriginal<typeof import("zigbee-herdsman")>();
    class MockHerdsman {
        on: Controller["on"] = vi.fn();
        start: Controller["start"] = async () => "resumed" as const;
        stop: Controller["stop"] = async () => {};
        isStopping: Controller["isStopping"] = () => false;
        getCoordinatorVersion: Controller["getCoordinatorVersion"] = async () =>
            Promise.resolve({
                type: "Dummy",
                meta: {revision: "9.9.9"},
            });
        getNetworkParameters: Controller["getNetworkParameters"] = async () => Promise.resolve({...NETWORK_PARAMS});
        getPermitJoin: Controller["getPermitJoin"] = () => false;
        getPermitJoinEnd: Controller["getPermitJoinEnd"] = () => undefined;
        getDeviceByIeeeAddr: Controller["getDeviceByIeeeAddr"] = (ieeeAddr) => ZH_DEVICES.find((device) => device.ieeeAddr === ieeeAddr);
        getGroupByID: Controller["getGroupByID"] = (id) => ZH_GROUPS.find((group) => group.groupID === id);
        getDevicesByType: Controller["getDevicesByType"] = (type) => ZH_DEVICES.filter((device) => device.type === type);
        getDeviceByNetworkAddress: Controller["getDeviceByNetworkAddress"] = (networkAddress) =>
            ZH_DEVICES.find((device) => device.networkAddress === networkAddress);
        *getDevicesIterator(predicate: ((device: Device) => boolean) | undefined) {
            for (const device of ZH_DEVICES) {
                if (!predicate || predicate(device)) {
                    yield device;
                }
            }
        }
        *getGroupsIterator(predicate: ((group: Group) => boolean) | undefined) {
            for (const group of ZH_GROUPS) {
                if (!predicate || predicate(group)) {
                    yield group;
                }
            }
        }
    }

    return {
        ...actual,
        Controller: MockHerdsman,
    };
});

process.env.ZIGBEE2MQTT_DATA = "data-bench";
data._testReload();

if (!existsSync(data.getPath())) {
    mkdirSync(data.getPath(), {recursive: true});
}

const createEndpoint = (id: number, ieeeAddr: string, networkAddress: number) => {
    const ep = Endpoint.create(
        id,
        id === ZSpec.GP_ENDPOINT ? ZSpec.GP_PROFILE_ID : ZSpec.HA_PROFILE_ID,
        id === ZSpec.GP_ENDPOINT ? 0x66 : 0x65,
        id === ZSpec.GP_ENDPOINT ? [Zcl.Clusters.greenPower.ID] : [Zcl.Clusters.genBasic.ID, Zcl.Clusters.genOnOff.ID],
        id === ZSpec.GP_ENDPOINT ? [Zcl.Clusters.greenPower.ID] : [Zcl.Clusters.genBasic.ID],
        networkAddress,
        ieeeAddr,
    );
    ep.save = () => {};

    return ep;
};
// `Device.create` requires `Database`, bypass it by using the private constructor directly
const createDevice = (
    dbId: number,
    type: DeviceType,
    ieeeAddr: string,
    networkAddress: number,
    manufacturerID: number | undefined,
    manufacturerName: string | undefined,
    powerSource: string | undefined,
    modelID: string | undefined,
): Device => {
    const haEp = createEndpoint(ZSpec.HA_ENDPOINT, ieeeAddr, networkAddress);
    const ep2 = createEndpoint(2, ieeeAddr, networkAddress);
    const endpoints = [haEp, ep2];

    if (type === "Coordinator" || type === "Router") {
        const gpEp = createEndpoint(ZSpec.GP_ENDPOINT, ieeeAddr, networkAddress);

        endpoints.push(gpEp);
    }

    // @ts-expect-error mocking private
    const device = new Device(
        dbId,
        type,
        ieeeAddr,
        networkAddress,
        manufacturerID,
        endpoints,
        manufacturerName,
        powerSource,
        modelID,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        InterviewState.Successful,
        {},
        undefined,
        undefined,
        0,
        undefined,
    );

    // in-memory only
    device.save = () => {};

    return device;
};
// `Group.create` requires `Database`, bypass it by using the private constructor directly
const createGroup = (dbId: number, id: number): Group => {
    // @ts-expect-error mocking private
    const group = new Group(dbId, id, [], {});

    // in-memory only
    group.save = () => {};

    return group;
};

const COORD_IEEE = "0x0101010101010101";
const EXT_PAN_ID = [0xdd, 0xdd, 0xdd, 0xdd, 0xdd, 0xdd, 0xdd, 0xdd];
const NETWORK_PARAMS = {
    panID: 0x1a62,
    extendedPanID: `0x${Buffer.from(EXT_PAN_ID).toString("hex")}`,
    channel: 11,
    nwkUpdateID: 1,
};
const NETWORK_KEY = [1, 3, 5, 7, 9, 11, 13, 15, 0, 2, 4, 6, 8, 10, 12, 13];
const ZH_DEVICES: Device[] = [];
const ZH_GROUPS: Group[] = [];
const MANY_DEVICES = 100;

const initDevices = () => {
    ZH_DEVICES.splice(0, ZH_DEVICES.length);

    ZH_DEVICES.push(
        createDevice(
            0,
            "Coordinator",
            COORD_IEEE,
            ZSpec.COORDINATOR_ADDRESS,
            Zcl.ManufacturerCode.SILICON_LABORATORIES,
            undefined,
            undefined,
            undefined,
        ),
    );
    ZH_DEVICES.push(
        createDevice(1, "Router", "0xf1f1f1f1f1f1f1f1", 0x0001, Zcl.ManufacturerCode.INNR_LIGHTING_BV, "Innr", "Mains (single phase)", "AE 262"),
    );
    ZH_DEVICES.push(
        createDevice(2, "EndDevice", "0xe2e2e2e2e2e2e2e2", 0x0002, Zcl.ManufacturerCode.TUYA_GLOBAL_INC, "_TYZB01_kvwjujy9", "Battery", "TS0222"),
    );
    ZH_DEVICES.push(createDevice(3, "GreenPower", "0x00000000015d3d3d", 0x0003, undefined, undefined, undefined, "GreenPower_7"));
    // these have configure, without setTimeout, they hammer really badly (# of fn calls), so, only one of each
    ZH_DEVICES.push(
        createDevice(
            4,
            "Router",
            "0xd3d3d3d3d3d3d3d3",
            0x0004,
            Zcl.ManufacturerCode.LEDVANCE_GMBH,
            "LEDVANCE",
            "Mains (single phase)",
            "PLUG OUTDOOR EU T",
        ),
    );
    ZH_DEVICES.push(
        createDevice(5, "Router", "0xc4c4c4c4c4c4c4c4", 0x0005, Zcl.ManufacturerCode.INOVELLI, "Inovelli", "Mains (single phase)", "VZM35-SN"),
    );
    ZH_DEVICES.push(
        createDevice(
            6,
            "Router",
            "0xb5b5b5b5b5b5b5b5",
            0x0006,
            Zcl.ManufacturerCode.SILICON_LABORATORIES,
            "SMLIGHT",
            "Mains (single phase)",
            "SLZB-06Mg24",
        ),
    );
    ZH_DEVICES.push(
        createDevice(
            7,
            "Router",
            "0xa6a6a6a6a6a6a6a6",
            0x0007,
            Zcl.ManufacturerCode.TUYA_GLOBAL_INC,
            "_TZE200_p0gzbqct",
            "Mains (single phase)",
            "TS0601",
        ),
    );
};

const initGroups = () => {
    ZH_GROUPS.splice(0, ZH_GROUPS.length);

    ZH_GROUPS.push(createGroup(0, 1));
};

const addManyDevices = () => {
    for (let i = 0; i < MANY_DEVICES; i++) {
        const ieee = `0xf1f1f1f1f1f1f1${i.toString(16).padStart(2, "0")}`;

        // device without `configure` (too many calls otherwise)
        ZH_DEVICES.push(createDevice(1, "Router", ieee, 0x0008 + i, Zcl.ManufacturerCode.INNR_LIGHTING_BV, "Innr", "Mains (single phase)", "AE 262"));
    }
};

const getMidDeviceIeee = () =>
    `0xf1f1f1f1f1f1f1${Math.floor(MANY_DEVICES / 2)
        .toString(16)
        .padStart(2, "0")}`;

Device.byIeeeAddr = (ieeeAddr, _includeDeleted) => ZH_DEVICES.find((device) => device.ieeeAddr === ieeeAddr);
Device.byType = (type) => ZH_DEVICES.filter((device) => device.type === type);

const adapter = {
    sendZclFrameToEndpoint: async (
        _ieeeAddr: string,
        networkAddress: number,
        endpoint: number,
        zclFrame: Zcl.Frame,
        _timeout: number,
        disableResponse: boolean,
        _disableRecovery: boolean,
        sourceEndpoint?: number,
    ): Promise<ZclPayload | undefined> => {
        const payload: {[key: string]: unknown}[] = [];

        if (!disableResponse) {
            if (zclFrame.header.isGlobal) {
                switch (zclFrame.command.ID) {
                    case Foundation.read.ID: {
                        for (const attr of zclFrame.payload) {
                            const attribute = zclFrame.cluster.getAttribute(attr.attrId);

                            if (attribute && attribute.type !== Zcl.DataType.NO_DATA && attribute.type < Zcl.DataType.OCTET_STR) {
                                payload.push({
                                    attrId: attr.attrId,
                                    dataType: attribute.type,
                                    attrData: 1,
                                    status: 0,
                                });
                            }
                        }

                        const messageContents = Zcl.Frame.create(
                            0,
                            Zcl.Direction.SERVER_TO_CLIENT,
                            true,
                            undefined,
                            10,
                            Foundation.readRsp.ID,
                            zclFrame.cluster.ID,
                            payload,
                            {},
                        ).toBuffer();

                        return await Promise.resolve({
                            clusterID: zclFrame.cluster.ID,
                            header: Zcl.Header.fromBuffer(messageContents),
                            address: networkAddress,
                            data: messageContents,
                            endpoint: sourceEndpoint ?? 1,
                            linkquality: 200,
                            groupID: 0,
                            wasBroadcast: false,
                            destinationEndpoint: endpoint,
                        });
                    }
                    case Foundation.configReport.ID: {
                        for (const item of zclFrame.payload) {
                            payload.push({attrId: item.attrId, status: 0, direction: 1});
                        }

                        const messageContents = Zcl.Frame.create(
                            0,
                            Zcl.Direction.SERVER_TO_CLIENT,
                            true,
                            undefined,
                            10,
                            Foundation.configReportRsp.ID,
                            zclFrame.cluster.ID,
                            payload,
                            {},
                        ).toBuffer();

                        return await Promise.resolve({
                            clusterID: zclFrame.cluster.ID,
                            header: Zcl.Header.fromBuffer(messageContents),
                            address: networkAddress,
                            data: messageContents,
                            endpoint: sourceEndpoint ?? 1,
                            linkquality: 200,
                            groupID: 0,
                            wasBroadcast: false,
                            destinationEndpoint: endpoint,
                        });
                    }
                }
            }
        }

        return await Promise.resolve(undefined);
    },
    sendZclFrameToGroup: async (_groupID: number, _zclFrame: Zcl.Frame, _sourceEndpoint?: number): Promise<void> => await Promise.resolve(),
    sendZdo: async (
        _ieeeAddress: string,
        _networkAddress: number,
        clusterId: Zdo.ClusterId,
        _payload: Buffer,
        _disableResponse: boolean,
    ): Promise<RequestToResponseMap[keyof RequestToResponseMap] | undefined> => {
        switch (clusterId) {
            case Zdo.ClusterId.BIND_REQUEST:
            case Zdo.ClusterId.UNBIND_REQUEST: {
                return await Promise.resolve([Zdo.Status.SUCCESS, undefined]);
            }
        }

        return await Promise.resolve(undefined);
    },
};

Entity.injectAdapter(adapter as Adapter);

// use plain type to avoid early import that otherwise messes with data path
let controller: import("../lib/controller.js").Controller;
const origSetImmediate = global.setImmediate;
const origSetTimeout = global.setTimeout;

const mockGlobalThis = () => {
    const setImmediateProms: (void | Promise<void>)[] = [];
    const setTimeoutProms: (void | Promise<void>)[] = [];

    // @ts-expect-error mock
    globalThis.setImmediate = (callback: () => void) => {
        setImmediateProms.push(callback());
    };
    // @ts-expect-error mock
    globalThis.setTimeout = (callback: () => void) => {
        setTimeoutProms.push(callback());
    };

    return {setImmediateProms, setTimeoutProms};
};

const unmockGlobalThis = () => {
    globalThis.setImmediate = origSetImmediate;
    globalThis.setTimeout = origSetTimeout;
};

const settle = async (mockedGlobal: ReturnType<typeof mockGlobalThis>) => {
    await Promise.allSettled(mockedGlobal.setImmediateProms);
    await Promise.allSettled(mockedGlobal.setTimeoutProms);
    await new Promise((resolve) => origSetImmediate(resolve));
};

const initSettings = async (pathValuePairs?: [string[], string | number | boolean][]) => {
    const settings = await import("../lib/util/settings.js");

    settings.writeMinimalDefaults();
    // disable logging, too much influence on perf
    settings.set(["advanced", "log_level"], "error");
    settings.set(["advanced", "log_output"], []);
    settings.set(["advanced", "pan_id"], NETWORK_PARAMS.panID);
    settings.set(["advanced", "ext_pan_id"], EXT_PAN_ID);
    settings.set(["advanced", "network_key"], NETWORK_KEY);

    if (pathValuePairs) {
        for (const [path, value] of pathValuePairs) {
            settings.set(path, value);
        }
    }
};

const initController = async () => {
    const {Controller} = await import("../lib/controller.js");

    controller = new Controller(
        async () => {},
        async () => {},
    );

    // all dummies, can trigger `controller.mqtt.onMessage(topic, message)` as needed
    // @ts-expect-error mocking private
    controller.mqtt.client = {
        options: {
            protocolVersion: 5,
            protocol: "mqtt",
            host: "localhost",
            port: 1883,
        },
        queue: [],
        reconnecting: false,
        disconnecting: false,
        disconnected: false,
        endAsync: async () => {},
        // @ts-expect-error Z2M does not make use of return
        publishAsync: async () => {},
    };
    controller.mqtt.connect = async () => {
        // @ts-expect-error private
        await controller.mqtt.onConnect();
    };
    controller.mqtt.subscribe = async () => {};
    controller.mqtt.unsubscribe = async () => {};

    // will be in-memory only
    controller.state.start = () => {};
    controller.state.stop = () => {};
};

describe("Controller with dummy zigbee/mqtt", () => {
    bench(
        "[defaults] start & stop controller",
        async () => {
            initDevices();
            initGroups();
            await initSettings();
            await initController();
            const mockedGlobal = mockGlobalThis();

            await controller.start();
            await settle(mockedGlobal);

            if ((await controller.zigbee.getCoordinatorVersion()).type !== "Dummy") {
                throw new Error("Invalid");
            }

            await controller.stop();
            unmockGlobalThis();
        },
        BENCH_OPTIONS,
    );

    bench(
        "[HA] start & stop controller",
        async () => {
            initDevices();
            initGroups();
            await initSettings([[["homeassistant", "enabled"], true]]);
            await initController();
            const mockedGlobal = mockGlobalThis();

            await controller.start();
            controller.mqtt.onMessage("homeassistant/status", Buffer.from("online", "utf8"));
            await settle(mockedGlobal);

            if ((await controller.zigbee.getCoordinatorVersion()).type !== "Dummy") {
                throw new Error("Invalid");
            }

            await controller.stop();
            unmockGlobalThis();
        },
        BENCH_OPTIONS,
    );

    describe("defaults runtime", () => {
        const setup: NonNullable<Parameters<typeof bench>[2]>["setup"] = async (task, mode) => {
            BENCH_OPTIONS.setup!(task, mode);
            initDevices();
            initGroups();
            await initSettings();
            await initController();
            const mockedGlobal = mockGlobalThis();

            await controller.start();
            await settle(mockedGlobal);
        };
        const teardown = async () => {
            await controller.stop();
            unmockGlobalThis();
        };

        bench(
            "[defaults] receive device message",
            async () => {
                const mockedGlobal = mockGlobalThis();

                controller.eventBus.emitDeviceMessage({
                    type: "attributeReport",
                    device: controller.zigbee.resolveEntity("0xf1f1f1f1f1f1f1f1"),
                    endpoint: ZSpec.HA_ENDPOINT,
                    linkquality: 200,
                    groupID: 0,
                    cluster: "genOnOff",
                    data: {onOff: 1},
                    meta: {},
                });
                await settle(mockedGlobal);
            },
            {...BENCH_OPTIONS, setup, teardown},
        );

        bench(
            "[defaults] receive MQTT message",
            async () => {
                const mockedGlobal = mockGlobalThis();

                controller.mqtt.onMessage("zigbee2mqtt/0xf1f1f1f1f1f1f1f1/set", Buffer.from(`{"state": "OFF"}`, "utf8"));
                await settle(mockedGlobal);
            },
            {...BENCH_OPTIONS, setup, teardown},
        );

        bench(
            "[defaults] add group member",
            async () => {
                const mockedGlobal = mockGlobalThis();

                controller.eventBus.emitMQTTMessage({
                    topic: "zigbee2mqtt/bridge/request/group/members/add",
                    message: stringify({
                        device: "0xf1f1f1f1f1f1f1f1",
                        group: `${ZH_GROUPS[0].groupID}`,
                        endpoint: ZSpec.HA_ENDPOINT,
                    }),
                });

                await settle(mockedGlobal);

                if (ZH_GROUPS[0].members.length !== 1) {
                    throw new Error("Invalid state");
                }
            },
            {...BENCH_OPTIONS, setup, teardown},
        );
    });

    describe("defaults/stress runtime", () => {
        const setup: NonNullable<Parameters<typeof bench>[2]>["setup"] = async (task, mode) => {
            BENCH_OPTIONS.setup!(task, mode);
            initDevices();
            initGroups();
            addManyDevices();
            await initSettings();
            await initController();
            const mockedGlobal = mockGlobalThis();

            await controller.start();
            await settle(mockedGlobal);
        };

        const teardown = async () => {
            await controller.stop();
            unmockGlobalThis();
        };

        // this is mostly just to confirm the number of devices does not influence the processing (much)
        bench(
            "[defaults/stress] receive device message",
            async () => {
                const mockedGlobal = mockGlobalThis();

                controller.eventBus.emitDeviceMessage({
                    type: "attributeReport",
                    device: controller.zigbee.resolveEntity(getMidDeviceIeee()),
                    endpoint: ZSpec.HA_ENDPOINT,
                    linkquality: 200,
                    groupID: 0,
                    cluster: "genOnOff",
                    data: {onOff: 1},
                    meta: {},
                });
                await settle(mockedGlobal);
            },
            {...BENCH_OPTIONS, setup, teardown},
        );
    });

    describe("HA runtime", () => {
        const setup: NonNullable<Parameters<typeof bench>[2]>["setup"] = async (task, mode) => {
            BENCH_OPTIONS.setup!(task, mode);
            initDevices();
            initGroups();
            await initSettings([[["homeassistant", "enabled"], true]]);
            await initController();
            const mockedGlobal = mockGlobalThis();

            await controller.start();
            controller.mqtt.onMessage("homeassistant/status", Buffer.from("online", "utf8"));
            await settle(mockedGlobal);
        };

        const teardown = async () => {
            await controller.stop();
            unmockGlobalThis();
        };

        bench(
            "[HA] receive device message",
            async () => {
                const mockedGlobal = mockGlobalThis();

                controller.eventBus.emitDeviceMessage({
                    type: "attributeReport",
                    device: controller.zigbee.resolveEntity("0xf1f1f1f1f1f1f1f1"),
                    endpoint: ZSpec.HA_ENDPOINT,
                    linkquality: 200,
                    groupID: 0,
                    cluster: "genOnOff",
                    data: {onOff: 1},
                    meta: {},
                });
                await settle(mockedGlobal);
            },
            {...BENCH_OPTIONS, setup, teardown},
        );

        bench(
            "[HA] receive MQTT message",
            async () => {
                const mockedGlobal = mockGlobalThis();

                controller.mqtt.onMessage("zigbee2mqtt/0xf1f1f1f1f1f1f1f1/set", Buffer.from(`{"state": "OFF"}`, "utf8"));
                await settle(mockedGlobal);
            },
            {...BENCH_OPTIONS, setup, teardown},
        );

        bench(
            "[HA] receive MQTT discovery message",
            async () => {
                const mockedGlobal = mockGlobalThis();

                controller.mqtt.onMessage(
                    "homeassistant/sensor/0xe2e2e2e2e2e2e2e2/update/config",
                    Buffer.from(stringify({availability: [{topic: "zigbee2mqtt/bridge/state", value_template: "{{ value_json.state }}"}]}), "utf8"),
                );
                await settle(mockedGlobal);
            },
            {...BENCH_OPTIONS, setup, teardown},
        );
    });
});
