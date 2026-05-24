/**
 * Z2M MCP Server - Binding Tools
 * Phase 2: Device and group binding operations
 */

import * as Types from '../types.js';
import { Zigbee } from '../../zigbee/index.js';
import { State } from '../../state.js';
import { logger } from '../../util/logger.js';

export interface BindingToolsContext {
  zigbee: Zigbee;
  state: State;
}

/**
 * Convert binding endpoint object to MCP schema
 */
function bindingToMcp(binding: any): Types.Binding {
  const sourceEndpoint = binding.source;
  const targetEndpoint = binding.target;

  return {
    id: `${sourceEndpoint.id || ''}:${sourceEndpoint.endpoint || ''}`,
    source: {
      id: sourceEndpoint.id || '',
      endpoint: sourceEndpoint.endpoint || 1,
    },
    target: {
      id: targetEndpoint.id || undefined,
      type: targetEndpoint.id ? 'device' : 'group',
      cluster: binding.meta?.cluster || binding.cluster || 'unknown',
      endpoint: targetEndpoint.endpoint,
      group_id: targetEndpoint.group_id,
    },
  };
}

/**
 * get_bindings - Get all bindings for a device
 */
export async function getBindings(context: BindingToolsContext, input: unknown): Promise<Types.McpToolResult> {
  try {
    const parsed = Types.parseInput(Types.GetBindingsRequestSchema, input);
    if (parsed.error) {
      return Types.createError(`Invalid input: ${parsed.error}`);
    }

    const deviceIdentifier = parsed.data!.device_id;
    const device = context.zigbee.getClients().find((d) => d.ieee_addr === deviceIdentifier || context.state.getFriendlyName(d) === deviceIdentifier);

    if (!device) {
      return Types.createError(`Device not found: ${deviceIdentifier}`);
    }

    const bindings = device.binds || [];
    const mcpBindings = bindings.map((binding) => bindingToMcp(binding));

    const response: Types.GetBindingsResponse = {
      device_id: device.ieee_addr,
      bindings: mcpBindings,
      count: mcpBindings.length,
    };

    return Types.createSuccess(response);
  } catch (error) {
    logger.error('Error getting bindings:', error);
    return Types.createError(error instanceof Error ? error : new Error('Failed to get bindings'));
  }
}

/**
 * bind_device - Bind source device to target device on cluster
 */
export async function bindDevice(context: BindingToolsContext, input: unknown): Promise<Types.McpToolResult> {
  try {
    const parsed = Types.parseInput(Types.BindDeviceRequestSchema, input);
    if (parsed.error) {
      return Types.createError(`Invalid input: ${parsed.error}`);
    }

    const { source_device, source_endpoint, target_device, target_endpoint, cluster } = parsed.data!;

    // Find source device
    const sourceDeviceObj = context.zigbee.getClients().find((d) => d.ieee_addr === source_device || context.state.getFriendlyName(d) === source_device);

    if (!sourceDeviceObj) {
      return Types.createError(`Source device not found: ${source_device}`);
    }

    // Find target device
    const targetDeviceObj = context.zigbee.getClients().find((d) => d.ieee_addr === target_device || context.state.getFriendlyName(d) === target_device);

    if (!targetDeviceObj) {
      return Types.createError(`Target device not found: ${target_device}`);
    }

    // Perform binding
    await context.zigbee.bind?.(sourceDeviceObj, source_endpoint, cluster, targetDeviceObj, target_endpoint);

    const response: Types.BindDeviceResponse = {
      success: true,
      message: `Bound ${context.state.getFriendlyName(sourceDeviceObj) || source_device}:${source_endpoint} to ${context.state.getFriendlyName(targetDeviceObj) || target_device}:${target_endpoint} on cluster ${cluster}`,
    };

    return Types.createSuccess(response);
  } catch (error) {
    logger.error('Error binding device:', error);
    return Types.createError(error instanceof Error ? error : new Error('Failed to bind device'));
  }
}

/**
 * unbind_device - Unbind source device from target device on cluster
 */
export async function unbindDevice(context: BindingToolsContext, input: unknown): Promise<Types.McpToolResult> {
  try {
    const parsed = Types.parseInput(Types.UnbindDeviceRequestSchema, input);
    if (parsed.error) {
      return Types.createError(`Invalid input: ${parsed.error}`);
    }

    const { source_device, source_endpoint, target_device, target_endpoint, cluster } = parsed.data!;

    // Find source device
    const sourceDeviceObj = context.zigbee.getClients().find((d) => d.ieee_addr === source_device || context.state.getFriendlyName(d) === source_device);

    if (!sourceDeviceObj) {
      return Types.createError(`Source device not found: ${source_device}`);
    }

    // Find target device
    const targetDeviceObj = context.zigbee.getClients().find((d) => d.ieee_addr === target_device || context.state.getFriendlyName(d) === target_device);

    if (!targetDeviceObj) {
      return Types.createError(`Target device not found: ${target_device}`);
    }

    // Perform unbinding
    await context.zigbee.unbind?.(sourceDeviceObj, source_endpoint, cluster, targetDeviceObj, target_endpoint);

    const response: Types.UnbindDeviceResponse = {
      success: true,
      message: `Unbound ${context.state.getFriendlyName(sourceDeviceObj) || source_device}:${source_endpoint} from ${context.state.getFriendlyName(targetDeviceObj) || target_device}:${target_endpoint} on cluster ${cluster}`,
    };

    return Types.createSuccess(response);
  } catch (error) {
    logger.error('Error unbinding device:', error);
    return Types.createError(error instanceof Error ? error : new Error('Failed to unbind device'));
  }
}
