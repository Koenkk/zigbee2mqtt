import * as data from '../mocks/data';
import {mockLogger} from '../mocks/logger';
import {events as mockMQTTEvents, mockMQTTPublishAsync} from '../mocks/mqtt';
import {flushPromises} from '../mocks/utils';
import {Device, devices, Endpoint, events as mockZHEvents} from '../mocks/zigbeeHerdsman';

import stringify from 'json-stable-stringify-without-jsonify';

import {Controller} from '../../lib/controller';
import * as settings from '../../lib/util/settings';

const mocksClear = [mockMQTTPublishAsync, mockLogger.warning, mockLogger.debug];

describe('Extension: Configure', () => {
    let controller: Controller;
    let coordinatorEndpoint: Endpoint;

    const resetExtension = async (): Promise<void> => {
        await controller.enableDisableExtension(false, 'Configure');
        await controller.enableDisableExtension(true, 'Configure');
    };

    const mockClear = (device: Device): void => {
        for (const endpoint of device.endpoints) {
            endpoint.read.mockClear();
            endpoint.write.mockClear();
            endpoint.configureReporting.mockClear();
            endpoint.bind.mockClear();
        }
    };

    const expectRemoteConfigured = (): void => {
        const device = devices.remote;
        const endpoint1 = device.getEndpoint(1)!;
        expect(endpoint1.bind).toHaveBeenCalledTimes(2);
        expect(endpoint1.bind).toHaveBeenCalledWith('genOnOff', coordinatorEndpoint);
        expect(endpoint1.bind).toHaveBeenCalledWith('genLevelCtrl', coordinatorEndpoint);

        const endpoint2 = device.getEndpoint(2)!;
        expect(endpoint2.write).toHaveBeenCalledTimes(1);
        expect(endpoint2.write).toHaveBeenCalledWith('genBasic', {49: {type: 25, value: 11}}, {disableDefaultResponse: true, manufacturerCode: 4107});
        expect(device.meta.configured).toBe(332242049);
    };

    const expectBulbConfigured = (): void => {
        const device = devices.bulb;
        const endpoint1 = device.getEndpoint(1)!;
        expect(endpoint1.read).toHaveBeenCalledTimes(2);
        expect(endpoint1.read).toHaveBeenCalledWith('lightingColorCtrl', ['colorCapabilities']);
        expect(endpoint1.read).toHaveBeenCalledWith('lightingColorCtrl', ['colorTempPhysicalMin', 'colorTempPhysicalMax']);
    };

    const expectBulbNotConfigured = (): void => {
        const device = devices.bulb;
        const endpoint1 = device.getEndpoint(1)!;
        expect(endpoint1.read).toHaveBeenCalledTimes(0);
    };

    const expectRemoteNotConfigured = (): void => {
        const device = devices.remote;
        const endpoint1 = device.getEndpoint(1)!;
        expect(endpoint1.bind).toHaveBeenCalledTimes(0);
    };

    const wait = async (ms: number): Promise<void> => await new Promise((resolve) => setTimeout(resolve, ms));

    beforeAll(async () => {
        vi.useFakeTimers();
        controller = new Controller(vi.fn(), vi.fn());
        await controller.start();
        await vi.runOnlyPendingTimersAsync();
    });

    beforeEach(async () => {
        data.writeDefaultConfiguration();
        settings.reRead();
        mocksClear.forEach((m) => m.mockClear());
        coordinatorEndpoint = devices.coordinator.getEndpoint(1)!;
        await resetExtension();
        await vi.runOnlyPendingTimersAsync();
    });

    afterAll(async () => {
        vi.useRealTimers();
    });

    it('Should configure Router on startup', async () => {
        expectBulbConfigured();
    });

    it('Should not configure EndDevice on startup', async () => {
        expectRemoteNotConfigured();
    });

    it('Should re-configure when device rejoins', async () => {
        expectBulbConfigured();
        const device = devices.bulb;
        await flushPromises();
        mockClear(device);
        const payload = {device};
        mockZHEvents.deviceJoined(payload);
        await flushPromises();
        expectBulbConfigured();
    });

    it('Should not re-configure disabled devices', async () => {
        expectBulbConfigured();
        const device = devices.bulb;
        await flushPromises();
        mockClear(device);
        settings.set(['devices', device.ieeeAddr, 'disabled'], true);
        mockZHEvents.deviceJoined({device});
        await flushPromises();
        expectBulbNotConfigured();
    });

    it('Should reconfigure reporting on reconfigure event', async () => {
        expectBulbConfigured();
        // @ts-expect-error private
        const device = controller.zigbee.resolveEntity(devices.bulb)!;
        mockClear(device.zh);
        expectBulbNotConfigured();
        // @ts-expect-error private
        controller.eventBus.emitReconfigure({device});
        await flushPromises();
        expectBulbConfigured();
    });

    it('Should not configure twice', async () => {
        expectBulbConfigured();
        const device = devices.bulb;
        mockClear(device);
        await mockZHEvents.deviceInterview({device});
        await flushPromises();
        expectBulbNotConfigured();
    });

    it('Should configure on zigbee message when not configured yet', async () => {
        const device = devices.bulb;
        delete device.meta.configured;
        mockClear(device);
        await mockZHEvents.lastSeenChanged({device});
        await flushPromises();
        expectBulbConfigured();
    });

    it('Should allow to configure via MQTT', async () => {
        mockClear(devices.remote);
        expectRemoteNotConfigured();
        await mockMQTTEvents.message('zigbee2mqtt/bridge/request/device/configure', 'remote');
        await flushPromises();
        expectRemoteConfigured();
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/device/configure',
            stringify({data: {id: 'remote'}, status: 'ok'}),
            {retain: false, qos: 0},
        );
    });

    it('Fail to configure via MQTT when device does not exist', async () => {
        await mockMQTTEvents.message('zigbee2mqtt/bridge/request/device/configure', stringify({id: 'not_existing_device'}));
        await flushPromises();
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/device/configure',
            stringify({data: {}, status: 'error', error: "Device 'not_existing_device' does not exist"}),
            {retain: false, qos: 0},
        );
    });

    it('Fail to configure via MQTT when configure fails', async () => {
        devices.remote.getEndpoint(1)!.bind.mockImplementationOnce(async () => {
            throw new Error('Bind timeout after 10s');
        });
        await mockMQTTEvents.message('zigbee2mqtt/bridge/request/device/configure', stringify({id: 'remote'}));
        await flushPromises();
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/device/configure',
            stringify({data: {}, status: 'error', error: 'Failed to configure (Bind timeout after 10s)'}),
            {retain: false, qos: 0},
        );
    });

    it('Fail to configure via MQTT when device has no configure', async () => {
        await mockMQTTEvents.message('zigbee2mqtt/bridge/request/device/configure', stringify({id: '0x0017882104a44559', transaction: 20}));
        await flushPromises();
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/device/configure',
            stringify({data: {}, status: 'error', error: "Device 'TS0601_thermostat' cannot be configured", transaction: 20}),
            {retain: false, qos: 0},
        );
    });

    it('Handles invalid payload for configure via MQTT', async () => {
        await mockMQTTEvents.message('zigbee2mqtt/bridge/request/device/configure', stringify({idx: '0x0017882104a44559'}));
        await flushPromises();
        expect(mockMQTTPublishAsync).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/device/configure',
            stringify({data: {}, status: 'error', error: 'Invalid payload'}),
            {retain: false, qos: 0},
        );
    });

    it('Should not configure when interview not completed', async () => {
        const device = devices.remote;
        delete device.meta.configured;
        device.interviewCompleted = false;
        mockClear(device);
        await mockZHEvents.lastSeenChanged({device});
        await flushPromises();
        expectRemoteNotConfigured();
        device.interviewCompleted = true;
    });

    it('Should not configure when already configuring', async () => {
        const device = devices.remote;
        delete device.meta.configured;
        const endpoint = device.getEndpoint(1)!;
        endpoint.bind.mockImplementationOnce(async () => await wait(500));
        mockClear(device);
        await mockZHEvents.lastSeenChanged({device});
        await flushPromises();
        expect(endpoint.bind).toHaveBeenCalledTimes(1);
        await mockZHEvents.lastSeenChanged({device});
        await flushPromises();
        expect(endpoint.bind).toHaveBeenCalledTimes(1);
    });

    it('Should configure max 3 times when fails', async () => {
        // @ts-expect-error private
        controller.extensions.find((e) => e.constructor.name === 'Configure').attempts = {};
        const device = devices.remote;
        delete device.meta.configured;
        const endpoint = device.getEndpoint(1)!;
        mockClear(device);
        endpoint.bind.mockImplementationOnce(async () => {
            throw new Error('BLA');
        });
        await mockZHEvents.lastSeenChanged({device});
        await flushPromises();
        endpoint.bind.mockImplementationOnce(async () => {
            throw new Error('BLA');
        });
        await mockZHEvents.lastSeenChanged({device});
        await flushPromises();
        endpoint.bind.mockImplementationOnce(async () => {
            throw new Error('BLA');
        });
        await mockZHEvents.lastSeenChanged({device});
        await flushPromises();
        endpoint.bind.mockImplementationOnce(async () => {
            throw new Error('BLA');
        });
        await mockZHEvents.lastSeenChanged({device});
        await flushPromises();
        endpoint.bind.mockImplementationOnce(async () => {
            throw new Error('BLA');
        });
        await mockZHEvents.lastSeenChanged({device});
        await flushPromises();
        expect(endpoint.bind).toHaveBeenCalledTimes(3);
    });
});
