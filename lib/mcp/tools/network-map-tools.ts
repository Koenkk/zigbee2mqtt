/**
 * Z2M MCP Server - Network Map Tools
 * Phase 3: Network topology visualization
 */

import * as Types from '../types';
import type Zigbee from '../../zigbee';
import type State from '../../state';
import logger from '../../util/logger';

export async function getNetworkMap(zigbee: Zigbee, state: State): Promise<Types.McpToolResult> {
  try {
    const clients = zigbee.getClients();
    const coordinator = zigbee.getCoordinator();
    
    // Generate DOT format graph
    let dot = 'digraph {\n';
    dot += '  rankdir=LR;\n';
    
    // Add coordinator node
    dot += `  "${coordinator?.ieee_addr}" [label="${state.getFriendlyName(coordinator) || 'Coordinator'}", shape=box, color=green];\n`;
    
    // Add device nodes and edges
    for (const device of clients) {
      const name = state.getFriendlyName(device) || device.ieee_addr;
      const shape = device.type === 'Router' ? 'ellipse' : 'box';
      dot += `  "${device.ieee_addr}" [label="${name}", shape=${shape}];\n`;
      
      if (device.linkquality) {
        const parent_ieee = (device as any).parent?.ieee_addr || coordinator?.ieee_addr;
        dot += `  "${parent_ieee}" -> "${device.ieee_addr}" [label="${device.linkquality}"];\n`;
      }
    }
    
    dot += '}\n';
    
    return Types.createSuccess({
      format: 'graphviz',
      graph: dot,
      device_count: clients.length,
    });
  } catch (error) {
    logger.error('Error generating network map:', error);
    return Types.createError(error instanceof Error ? error : new Error('Failed to generate network map'));
  }
}
