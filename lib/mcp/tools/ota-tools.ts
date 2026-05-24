/**
 * Z2M MCP Server - OTA Tools
 * Phase 3: Over-The-Air firmware updates
 */

import * as Types from '../types';
import type Zigbee from '../../zigbee';
import type State from '../../state';
import logger from '../../util/logger';

export async function checkOtaUpdates(zigbee: Zigbee, state: State): Promise<Types.McpToolResult> {
  try {
    const clients = zigbee.getClients();
    const updates = [];
    
    for (const device of clients) {
      // Check if device has OTA update available
      const hasUpdate = (device as any).hasOta?.() || false;
      if (hasUpdate) {
        updates.push({
          device_id: device.ieee_addr,
          friendly_name: state.getFriendlyName(device),
          current_version: (device as any).sw_build_id,
        });
      }
    }
    
    return Types.createSuccess({
      updates_available: updates.length,
      updates,
    });
  } catch (error) {
    logger.error('Error checking OTA updates:', error);
    return Types.createError(error instanceof Error ? error : new Error('Failed to check OTA updates'));
  }
}

export async function triggerOta(zigbee: Zigbee, state: State, input: unknown): Promise<Types.McpToolResult> {
  try {
    const parsed = Types.parseInput(Types.TriggerOtaRequestSchema, input);
    if (parsed.error) {
      return Types.createError(`Invalid input: ${parsed.error}`);
    }

    const { device_id } = parsed.data!;
    const device = zigbee.getClients().find((d: any) => d.ieee_addr === device_id || state.getFriendlyName(d) === device_id);

    if (!device) {
      return Types.createError(`Device not found: ${device_id}`);
    }

    // Trigger OTA update
    await (device as any).update?.();

    return Types.createSuccess({
      success: true,
      message: `OTA update initiated for ${state.getFriendlyName(device) || device_id}`,
    });
  } catch (error) {
    logger.error('Error triggering OTA:', error);
    return Types.createError(error instanceof Error ? error : new Error('Failed to trigger OTA'));
  }
}
