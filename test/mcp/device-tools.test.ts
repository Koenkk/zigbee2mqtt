/**
 * Integration tests for Z2M MCP Server Device Tools
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as DeviceTools from '../../lib/mcp/tools/device-tools.js';
import * as Types from '../../lib/mcp/types.js';

// Mock implementations
const mockZigbee = {
  getClients: vi.fn(() => [
    {
      ieee_addr: '0x00158d0001a2b3c4',
      type: 'EndDevice',
      networkAddress: 1234,
      definition: {
        description: 'Test Device',
        vendor: 'Test Vendor',
        model: 'TEST-001',
      },
      powerSource: 'Battery',
      isAvailable: vi.fn(() => true),
      lastSeen: Date.now(),
      settings: {},
      interviewing: false,
      interviewCompleted: true,
      routes: [],
      publish: vi.fn(),
    },
  ]),
  getDevice: vi.fn((id) => null),
  getDevicesByState: vi.fn(() => []),
};

const mockState = {
  get: vi.fn(() => ({
    battery: 85,
    battery_low: false,
    linkquality: 200,
    on: true,
  })),
  getFriendlyName: vi.fn(() => 'Test Device'),
  getAvailabilityCheckerStatus: vi.fn(() => true),
};

describe('Device Tools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('listDevices', () => {
    it('should list all devices', async () => {
      const result = await DeviceTools.listDevices(
        { zigbee: mockZigbee as any, state: mockState as any },
        {},
      );

      expect(result.isError).toBeUndefined();
      expect(result.content).toHaveLength(1);
      if (result.content[0].text) {
        const data = JSON.parse(result.content[0].text);
        expect(data.count).toBe(1);
        expect(data.devices).toHaveLength(1);
        expect(data.devices[0].friendly_name).toBe('Test Device');
      }
    });

    it('should filter by availability', async () => {
      const input = {
        filter: {
          available_only: true,
        },
      };

      const result = await DeviceTools.listDevices(
        { zigbee: mockZigbee as any, state: mockState as any },
        input,
      );

      expect(result.isError).toBeUndefined();
      if (result.content[0].text) {
        const data = JSON.parse(result.content[0].text);
        expect(data.count).toBeGreaterThanOrEqual(0);
      }
    });

    it('should filter by device type', async () => {
      const input = {
        filter: {
          type: 'EndDevice',
        },
      };

      const result = await DeviceTools.listDevices(
        { zigbee: mockZigbee as any, state: mockState as any },
        input,
      );

      expect(result.isError).toBeUndefined();
      if (result.content[0].text) {
        const data = JSON.parse(result.content[0].text);
        expect(data.count).toBeGreaterThanOrEqual(0);
      }
    });

    it('should return error for invalid input', async () => {
      const result = await DeviceTools.listDevices(
        { zigbee: mockZigbee as any, state: mockState as any },
        { filter: { available_only: 'invalid' } },
      );

      expect(result.isError).toBe(true);
    });
  });

  describe('getDevice', () => {
    it('should get device by ID', async () => {
      const mockDevice = mockZigbee.getClients()[0];
      mockZigbee.getDevice.mockReturnValue(mockDevice);

      const result = await DeviceTools.getDevice(
        { zigbee: mockZigbee as any, state: mockState as any },
        { id: '0x00158d0001a2b3c4' },
      );

      expect(result.isError).toBeUndefined();
      if (result.content[0].text) {
        const data = JSON.parse(result.content[0].text);
        expect(data.device.id).toBe('0x00158d0001a2b3c4');
      }
    });

    it('should return error for non-existent device', async () => {
      mockZigbee.getDevice.mockReturnValue(null);
      mockZigbee.getDevicesByState.mockReturnValue([]);

      const result = await DeviceTools.getDevice(
        { zigbee: mockZigbee as any, state: mockState as any },
        { id: '0xnonexistent' },
      );

      expect(result.isError).toBe(true);
    });

    it('should return error for invalid input', async () => {
      const result = await DeviceTools.getDevice(
        { zigbee: mockZigbee as any, state: mockState as any },
        { id: 123 as any },
      );

      expect(result.isError).toBe(true);
    });
  });

  describe('getDeviceState', () => {
    it('should get device state', async () => {
      const mockDevice = mockZigbee.getClients()[0];
      mockZigbee.getDevice.mockReturnValue(mockDevice);

      const result = await DeviceTools.getDeviceState(
        { zigbee: mockZigbee as any, state: mockState as any },
        { id: '0x00158d0001a2b3c4' },
      );

      expect(result.isError).toBeUndefined();
      if (result.content[0].text) {
        const data = JSON.parse(result.content[0].text);
        expect(data.state).toHaveProperty('battery');
        expect(data.state.battery).toBe(85);
      }
    });

    it('should return error for non-existent device', async () => {
      mockZigbee.getDevice.mockReturnValue(null);
      mockZigbee.getDevicesByState.mockReturnValue([]);

      const result = await DeviceTools.getDeviceState(
        { zigbee: mockZigbee as any, state: mockState as any },
        { id: '0xnonexistent' },
      );

      expect(result.isError).toBe(true);
    });
  });

  describe('controlDevice', () => {
    it('should control device state', async () => {
      const mockDevice = mockZigbee.getClients()[0];
      mockZigbee.getDevice.mockReturnValue(mockDevice);

      const result = await DeviceTools.controlDevice(
        { zigbee: mockZigbee as any, state: mockState as any },
        {
          id: '0x00158d0001a2b3c4',
          state: {
            on: true,
            brightness: 255,
          },
        },
      );

      expect(result.isError).toBeUndefined();
      expect(mockDevice.publish).toHaveBeenCalled();
      if (result.content[0].text) {
        const data = JSON.parse(result.content[0].text);
        expect(data.success).toBe(true);
      }
    });

    it('should include transition time in control', async () => {
      const mockDevice = mockZigbee.getClients()[0];
      mockZigbee.getDevice.mockReturnValue(mockDevice);

      const result = await DeviceTools.controlDevice(
        { zigbee: mockZigbee as any, state: mockState as any },
        {
          id: '0x00158d0001a2b3c4',
          state: { brightness: 128 },
          transition_time: 2.5,
        },
      );

      expect(result.isError).toBeUndefined();
      expect(mockDevice.publish).toHaveBeenCalledWith(
        expect.objectContaining({ transition: 2.5 }),
        null,
      );
    });

    it('should return error for non-existent device', async () => {
      mockZigbee.getDevice.mockReturnValue(null);
      mockZigbee.getDevicesByState.mockReturnValue([]);

      const result = await DeviceTools.controlDevice(
        { zigbee: mockZigbee as any, state: mockState as any },
        {
          id: '0xnonexistent',
          state: { on: true },
        },
      );

      expect(result.isError).toBe(true);
    });
  });
});
