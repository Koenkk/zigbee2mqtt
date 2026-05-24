/**
 * Tests for Z2M MCP Server Types and Validation
 */

import { describe, it, expect } from 'vitest';
import * as Types from '../../lib/mcp/types.js';

describe('Types and Schemas', () => {
  describe('DeviceSchema validation', () => {
    it('should validate a complete device object', () => {
      const device = {
        id: '0x00158d0001a2b3c4',
        type: 'EndDevice' as const,
        network_address: 1234,
        friendly_name: 'Test Device',
        description: 'Test Description',
        manufacturer: 'Test Manufacturer',
        model: 'TEST-MODEL',
        power_source: 'Battery' as const,
        battery: 75,
        battery_low: false,
        availability: true,
        link_quality: 200,
        state: { on: true, brightness: 255 },
        last_seen: Date.now(),
      };

      const result = Types.DeviceSchema.safeParse(device);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.friendly_name).toBe('Test Device');
        expect(result.data.battery).toBe(75);
      }
    });

    it('should reject invalid device type', () => {
      const device = {
        id: '0x00158d0001a2b3c4',
        type: 'InvalidType',
        network_address: 1234,
        friendly_name: 'Test Device',
        availability: true,
        state: {},
      };

      const result = Types.DeviceSchema.safeParse(device);
      expect(result.success).toBe(false);
    });

    it('should accept minimal device object', () => {
      const device = {
        id: '0x00158d0001a2b3c4',
        type: 'Coordinator' as const,
        network_address: 0,
        friendly_name: 'Coordinator',
        availability: true,
        state: {},
      };

      const result = Types.DeviceSchema.safeParse(device);
      expect(result.success).toBe(true);
    });
  });

  describe('ListDevicesRequestSchema validation', () => {
    it('should validate empty input', () => {
      const result = Types.ListDevicesRequestSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('should validate with filters', () => {
      const input = {
        filter: {
          available_only: true,
          type: 'EndDevice' as const,
        },
      };

      const result = Types.ListDevicesRequestSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.filter?.available_only).toBe(true);
      }
    });
  });

  describe('ControlDeviceRequestSchema validation', () => {
    it('should validate control request', () => {
      const input = {
        id: '0x00158d0001a2b3c4',
        state: {
          on: true,
          brightness: 255,
        },
      };

      const result = Types.ControlDeviceRequestSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should validate with transition time', () => {
      const input = {
        id: '0x00158d0001a2b3c4',
        state: { brightness: 128 },
        transition_time: 1.5,
      };

      const result = Types.ControlDeviceRequestSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.transition_time).toBe(1.5);
      }
    });

    it('should reject invalid state values', () => {
      const input = {
        id: '0x00158d0001a2b3c4',
        state: {
          on: true,
          brightness: {} as any, // Invalid: should be number or string or boolean
        },
      };

      const result = Types.ControlDeviceRequestSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  describe('PermitJoinRequestSchema validation', () => {
    it('should validate basic permit join', () => {
      const input = { enabled: true };

      const result = Types.PermitJoinRequestSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should validate with timeout', () => {
      const input = {
        enabled: true,
        timeout: 60,
      };

      const result = Types.PermitJoinRequestSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should validate with device_id', () => {
      const input = {
        enabled: false,
        device_id: '0x00158d0001a2b3c4',
      };

      const result = Types.PermitJoinRequestSchema.safeParse(input);
      expect(result.success).toBe(true);
    });
  });

  describe('Response helpers', () => {
    it('should create successful response', () => {
      const data = { success: true, count: 5 };
      const result = Types.createSuccess(data);

      expect(result.isError).toBeUndefined();
      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');
      if (result.content[0].text) {
        const parsed = JSON.parse(result.content[0].text);
        expect(parsed.success).toBe(true);
        expect(parsed.count).toBe(5);
      }
    });

    it('should create error response', () => {
      const error = new Error('Test error message');
      const result = Types.createError(error);

      expect(result.isError).toBe(true);
      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');
      if (result.content[0].text) {
        const parsed = JSON.parse(result.content[0].text);
        expect(parsed.error).toBe('Test error message');
      }
    });

    it('should create error from string', () => {
      const result = Types.createError('Simple error');

      expect(result.isError).toBe(true);
      if (result.content[0].text) {
        const parsed = JSON.parse(result.content[0].text);
        expect(parsed.error).toBe('Simple error');
      }
    });
  });

  describe('parseInput helper', () => {
    it('should parse valid input', () => {
      const input = { enabled: true };
      const result = Types.parseInput(Types.PermitJoinRequestSchema, input);

      expect(result.error).toBeUndefined();
      expect(result.data).toBeDefined();
      expect(result.data?.enabled).toBe(true);
    });

    it('should return error for invalid input', () => {
      const input = { enabled: 'invalid' };
      const result = Types.parseInput(Types.PermitJoinRequestSchema, input);

      expect(result.data).toBeUndefined();
      expect(result.error).toBeDefined();
      expect(result.error).toContain('Expected boolean');
    });

    it('should return error for missing required field', () => {
      const input = {};
      const result = Types.parseInput(Types.PermitJoinRequestSchema, input);

      expect(result.data).toBeUndefined();
      expect(result.error).toBeDefined();
    });
  });
});
