import * as data from '../mocks/data';
import {mockLogger} from '../mocks/logger';
import {mockMQTT} from '../mocks/mqtt';
import {flushPromises} from '../mocks/utils';
import {devices, events as mockZHEvents} from '../mocks/zigbeeHerdsman';

import * as zhc from 'zigbee-herdsman-converters';

import {Controller} from '../../lib/controller';
import * as settings from '../../lib/util/settings';

const mockOnEvent = jest.fn();
const mockLivoloOnEvent = jest.fn();
const mappedLivolo = zhc.findByModel('TI0001')!;
mappedLivolo.onEvent = mockLivoloOnEvent;
// @ts-expect-error mock
zhc.onEvent = mockOnEvent;

const mocksClear = [mockMQTT.publishAsync, mockLogger.warning, mockLogger.debug];

describe('Extension: OnEvent', () => {
    let controller: Controller;

    beforeEach(async () => {
        jest.useFakeTimers();
        data.writeDefaultConfiguration();
        settings.reRead();
        controller = new Controller(jest.fn(), jest.fn());
        await controller.start();
        await flushPromises();
    });

    beforeEach(async () => {
        // @ts-expect-error private
        controller.state.state = {};
        data.writeDefaultConfiguration();
        settings.reRead();
        mocksClear.forEach((m) => m.mockClear());
        mockOnEvent.mockClear();
    });

    afterAll(async () => {
        jest.useRealTimers();
    });

    it('Should call with start event', async () => {
        expect(mockLivoloOnEvent).toHaveBeenCalledTimes(1);
        const call = mockLivoloOnEvent.mock.calls[0];
        expect(call[0]).toBe('start');
        expect(call[1]).toStrictEqual({});
        expect(call[2]).toBe(devices.LIVOLO);
        expect(call[3]).toStrictEqual(settings.getDevice(devices.LIVOLO.ieeeAddr));
        expect(call[4]).toStrictEqual({});
    });

    it('Should call with stop event', async () => {
        mockLivoloOnEvent.mockClear();
        await controller.stop();
        await flushPromises();
        expect(mockLivoloOnEvent).toHaveBeenCalledTimes(1);
        const call = mockLivoloOnEvent.mock.calls[0];
        expect(call[0]).toBe('stop');
        expect(call[1]).toStrictEqual({});
        expect(call[2]).toBe(devices.LIVOLO);
    });

    it('Should call with zigbee event', async () => {
        mockLivoloOnEvent.mockClear();
        await mockZHEvents.deviceAnnounce({device: devices.LIVOLO});
        await flushPromises();
        expect(mockLivoloOnEvent).toHaveBeenCalledTimes(1);
        expect(mockLivoloOnEvent).toHaveBeenCalledWith(
            'deviceAnnounce',
            {device: devices.LIVOLO},
            devices.LIVOLO,
            settings.getDevice(devices.LIVOLO.ieeeAddr),
            {},
            {
                deviceExposesChanged: expect.any(Function),
            },
        );

        // Test deviceExposesChanged
        mockMQTT.publishAsync.mockClear();
        console.log(mockLivoloOnEvent.mock.calls[0][5].deviceExposesChanged());
        expect(mockMQTT.publishAsync.mock.calls[0][0]).toStrictEqual('zigbee2mqtt/bridge/devices');
    });

    it('Should call index onEvent with zigbee event', async () => {
        mockOnEvent.mockClear();
        await mockZHEvents.deviceAnnounce({device: devices.LIVOLO});
        await flushPromises();
        expect(mockOnEvent).toHaveBeenCalledTimes(1);
        expect(zhc.onEvent).toHaveBeenCalledWith('deviceAnnounce', {device: devices.LIVOLO}, devices.LIVOLO, {
            deviceExposesChanged: expect.any(Function),
        });
    });
});
