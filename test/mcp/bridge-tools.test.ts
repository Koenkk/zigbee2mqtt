/**
 * Integration tests for Z2M MCP Server Bridge Tools
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as BridgeTools from '../../lib/mcp/tools/bridge-tools.js';
import * as Types from '../../lib/mcp/types.js';

// Mock implementations
const mockCoordinator = {
  model: 'TI CC2531',
  ieeeAddr: '0x00158d0000000001',
  networkAddress: 0,
  extendedPanID: [0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08],
  panID: 1234,
  meta: {
    firmware: 'Z3.10.0',
  },
};

const mockZigbee = {
  getCoordinator: vi.fn(() => mockCoordinator),
  getClients: vi.fn(() => [
    {
      ieee_addr: '0x00158d0001a2b3c4',
      type: 'EndDevice',
      isAvailable: vi.fn(() => true),
    },
  ]),
  getChannel: vi.fn(() => 11),
  getSupportedChannels: vi.fn(() => [11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26]),
  permitJoinEnabled: vi.fn(() => false),
  permitJoin: vi.fn(),
};

const mockState = {
  get: vi.fn((device) => ({
    battery: device?.ieee_addr === '0x00158d0001a2b3c4' ? 50 : undefined,
    battery_low: device?.ieee_addr === '0x00158d0001a2b3c4' ? true : undefined,
    linkquality: 100,
  })),
  getFriendlyName: vi.fn(() => 'Test Device'),
  getAvailabilityCheckerStatus: vi.fn(() => true),
};

const mockMqtt = {
  isConnected: vi.fn(() => true),
};

describe('Bridge Tools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getBridgeInfo', () => {
    it('should return bridge information', async () => {
      const result = await BridgeTools.getBridgeInfo({
        zigbee: mockZigbee as any,
        state: mockState as any,
        mqtt: mockMqtt as any,
        version: '2.10.1',
      });

      expect(result.isError).toBeUndefined();
      if (result.content[0].text) {
        const data = JSON.parse(result.content[0].text);
        expect(data.bridge_info.version).toBe('2.10.1');
        expect(data.bridge_info.coordinator.type).toBe('TI CC2531');
        expect(data.bridge_info.coordinator.ieee_address).toBe('0x00158d0000000001');
        expect(data.bridge_info.network.channel).toBe(11);
      }
    });

    it('should include network configuration', async () => {
      const result = await BridgeTools.getBridgeInfo({
        zigbee: mockZigbee as any,
        state: mockState as any,
        mqtt: mockMqtt as any,
        version: '2.10.1',
      });

      if (result.content[0].text) {
        const data = JSON.parse(result.content[0].text);
        expect(data.bridge_info.network.channels).toContain(11);
        expect(data.bridge_info.network.pan_id).toBe(1234);
      }
    });

    it('should include permit_join status', async () => {
      const result = await BridgeTools.getBridgeInfo({
        zigbee: mockZigbee as any,
        state: mockState as any,
        mqtt: mockMqtt as any,
        version: '2.10.1',
      });

      if (result.content[0].text) {
        const data = JSON.parse(result.content[0].text);
        expect(data.bridge_info.config.permit_join).toBe(false);
      }
    });
  });

  describe('permitJoin', () => {
    it('should enable permit join', async () => {
      const result = await BridgeTools.permitJoin(
        {
          zigbee: mockZigbee as any,
          state: mockState as any,
          mqtt: mockMqtt as any,
          version: '2.10.1',
        },
        { enabled: true },
      );

      expect(result.isError).toBeUndefined();
      expect(mockZigbee.permitJoin).toHaveBeenCalledWith(true, undefined, undefined);
      if (result.content[0].text) {
        const data = JSON.parse(result.content[0].text);
        expect(data.success).toBe(true);
        expect(data.permit_join).toBe(true);
      }
    });

    it('should disable permit join', async () => {
      const result = await BridgeTools.permitJoin(
        {
          zigbee: mockZigbee as any,
          state: mockState as any,
          mqtt: mockMqtt as any,
          version: '2.10.1',
        },
        { enabled: false },
      );

      expect(result.isError).toBeUndefined();
      expect(mockZigbee.permitJoin).toHaveBeenCalledWith(false, undefined, undefined);
    });

    it('should support timeout', async () => {
      const result = await BridgeTools.permitJoin(
        {
          zigbee: mockZigbee as any,
          state: mockState as any,
          mqtt: mockMqtt as any,
          version: '2.10.1',
        },
        { enabled: true, timeout: 60 },
      );

      expect(mockZigbee.permitJoin).toHaveBeenCalledWith(true, undefined, 60);
    });

    it('should return error for invalid input', async () => {
      const result = await BridgeTools.permitJoin(
        {
          zigbee: mockZigbee as any,
          state: mockState as any,
          mqtt: mockMqtt as any,
          version: '2.10.1',
        },
        { enabled: 'invalid' as any },
      );

      expect(result.isError).toBe(true);
    });
  });

  describe('checkHealth', () => {
    it('should return health status', async () => {
      const result = await BridgeTools.checkHealth({
        zigbee: mockZigbee as any,
        state: mockState as any,
        mqtt: mockMqtt as any,
        version: '2.10.1',
      });

      expect(result.isError).toBeUndefined();
      if (result.content[0].text) {
        const data = JSON.parse(result.content[0].text);
        expect(data.status).toBe('ok');
        expect(data.checks.coordinator.status).toBe('ok');
        expect(data.checks.mqtt.connected).toBe(true);
      }
    });

    it('should detect offline devices', async () => {
      mockZigbee.getClients.mockReturnValue([
        {
          ieee_addr: '0x00158d0001a2b3c4',
          type: 'EndDevice',
          isAvailable: vi.fn(() => false),
        },
      ]);

      const result = await BridgeTools.checkHealth({
        zigbee: mockZigbee as any,
        state: mockState as any,
        mqtt: mockMqtt as any,
        version: '2.10.1',
      });

      if (result.content[0].text) {
        const data = JSON.parse(result.content[0].text);
        expect(data.checks.devices.offline).toBe(1);
      }
    });

    it('should detect low battery devices', async () => {
      const result = await BridgeTools.checkHealth({
        zigbee: mockZigbee as any,
        state: mockState as any,
        mqtt: mockMqtt as any,
        version: '2.10.1',
      });

      if (result.content[0].text) {
        const data = JSON.parse(result.content[0].text);
        expect(data.checks.devices.low_battery).toBe(1);
        expect(data.alerts).toContain('1 device(s) low battery');
      }
    });

    it('should report warning status when issues detected', async () => {
      mockState.get.mockReturnValue({
        battery_low: true,
      });

      const result = await BridgeTools.checkHealth({
        zigbee: mockZigbee as any,
        state: mockState as any,
        mqtt: mockMqtt as any,
        version: '2.10.1',
      });

      if (result.content[0].text) {
        const data = JSON.parse(result.content[0].text);
        expect(data.status).toBe('warning');
        expect(data.alerts.length).toBeGreaterThan(0);
      }
    });
  });
});
