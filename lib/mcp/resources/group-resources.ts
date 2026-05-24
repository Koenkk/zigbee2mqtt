/**
 * Z2M MCP Server - Group Resources
 * Phase 2: Group URIs (z2m://groups and z2m://groups/{id})
 */

import * as Types from '../types.js';
import { Zigbee } from '../../zigbee/index.js';
import { State } from '../../state.js';
import { logger } from '../../util/logger.js';

export interface GroupResourcesContext {
  zigbee: Zigbee;
  state: State;
}

/**
 * Convert internal group representation to MCP Group schema
 */
function groupToMcp(group: any, state: State): Types.Group {
  const members = (group.members || []).map((member: any) => ({
    id: member.ieee_addr || member.id,
    friendly_name: state.getFriendlyName(member.ieee_addr || member.id) || 'unknown',
    type: member.type,
  }));

  return {
    id: group.id,
    name: group.name || `Group ${group.id}`,
    members,
    group_type: group.type,
  };
}

/**
 * Handle z2m://groups - List all groups
 */
export async function handleGroupsList(context: GroupResourcesContext): Promise<string> {
  try {
    const groups = context.zigbee.getGroups?.() || [];
    const mcpGroups = groups.map((group) => groupToMcp(group, context.state));

    return JSON.stringify({
      uri: 'z2m://groups',
      groups: mcpGroups,
      count: mcpGroups.length,
    }, null, 2);
  } catch (err) {
    logger.error('handleGroupsList failed:', err);
    throw new Error(`Failed to list groups: ${err instanceof Error ? err.message : 'Unknown error'}`);
  }
}

/**
 * Handle z2m://groups/{id} - Get specific group
 */
export async function handleGroupDetail(context: GroupResourcesContext, id: string): Promise<string> {
  try {
    const groupId = Number(id);
    if (Number.isNaN(groupId)) {
      throw new Error(`Invalid group ID: ${id}`);
    }

    const groups = context.zigbee.getGroups?.() || [];
    const group = groups.find((g) => g.id === groupId);

    if (!group) {
      throw new Error(`Group not found: ${groupId}`);
    }

    const mcpGroup = groupToMcp(group, context.state);
    return JSON.stringify({
      uri: `z2m://groups/${id}`,
      group: mcpGroup,
    }, null, 2);
  } catch (err) {
    logger.error('handleGroupDetail failed:', err);
    throw new Error(`Failed to get group detail: ${err instanceof Error ? err.message : 'Unknown error'}`);
  }
}

/**
 * Handle z2m://groups/{id}/members - Get group members
 */
export async function handleGroupMembers(context: GroupResourcesContext, id: string): Promise<string> {
  try {
    const groupId = Number(id);
    if (Number.isNaN(groupId)) {
      throw new Error(`Invalid group ID: ${id}`);
    }

    const groups = context.zigbee.getGroups?.() || [];
    const group = groups.find((g) => g.id === groupId);

    if (!group) {
      throw new Error(`Group not found: ${groupId}`);
    }

    const members = (group.members || []).map((member: any) => ({
      id: member.ieee_addr || member.id,
      friendly_name: context.state.getFriendlyName(member.ieee_addr || member.id) || 'unknown',
      type: member.type,
    }));

    return JSON.stringify({
      uri: `z2m://groups/${id}/members`,
      members,
      count: members.length,
    }, null, 2);
  } catch (err) {
    logger.error('handleGroupMembers failed:', err);
    throw new Error(`Failed to get group members: ${err instanceof Error ? err.message : 'Unknown error'}`);
  }
}
