import * as data from '../mocks/data';
import {mockLogger} from '../mocks/logger';
import {mockMQTT, events as mockMQTTEvents} from '../mocks/mqtt';
import {flushPromises} from '../mocks/utils';
import {devices} from '../mocks/zigbeeHerdsman';

import type Bridge from '../../lib/extension/bridge';

import stringify from 'json-stable-stringify-without-jsonify';

import {Controller} from '../../lib/controller';
import * as settings from '../../lib/util/settings';

const mocksClear = [mockLogger.info, mockLogger.warning, mockMQTT.publishAsync, devices.bulb.interview];

describe('Extension: Bridge - HomeAssistant', () => {
    let controller: Controller;
    let extension: Bridge;

    beforeAll(async () => {
        vi.useFakeTimers();
        controller = new Controller(vi.fn(), vi.fn());
        await controller.start();
        await flushPromises();
        // @ts-expect-error private
        extension = controller.extensions.find((e) => e.constructor.name === 'Bridge');
    });

    beforeEach(async () => {
        mockMQTT.reconnecting = false;
        data.writeDefaultConfiguration();
        settings.reRead();
        data.writeDefaultState();
        mocksClear.forEach((m) => m.mockClear());
        mockLogger.setTransportsEnabled(false);
        // @ts-expect-error private
        extension.restartRequired = false;
    });

    afterAll(async () => {
        vi.useRealTimers();
    });

    it('Change options and apply - homeassistant', async () => {
        // TODO: there appears to be a race condition somewhere in here
        // @ts-expect-error private
        expect(controller.extensions.find((e) => e.constructor.name === 'HomeAssistant')).toBeUndefined();
        mockMQTTEvents.message('zigbee2mqtt/bridge/request/options', stringify({options: {homeassistant: {enabled: true}}}));
        await flushPromises();
        // @ts-expect-error private
        expect(controller.extensions.find((e) => e.constructor.name === 'HomeAssistant')).not.toBeUndefined();
        expect(mockMQTT.publishAsync).toHaveBeenCalledWith('zigbee2mqtt/bridge/info', expect.any(String), {retain: true, qos: 0});
        expect(mockMQTT.publishAsync).toHaveBeenCalledWith(
            'zigbee2mqtt/bridge/response/options',
            stringify({data: {restart_required: true}, status: 'ok'}),
            {retain: false, qos: 0},
        );
        // revert
        mockMQTTEvents.message('zigbee2mqtt/bridge/request/options', stringify({options: {homeassistant: {enabled: false}}}));
        await flushPromises();
        // @ts-expect-error private
        expect(controller.extensions.find((e) => e.constructor.name === 'HomeAssistant')).toBeUndefined();
    });
});
