/**
 * Z2M MCP Server - Group Tools
 * Phase 2: Group CRUD and member management operations
 */

import * as Types from '../types.js';
import { Zigbee } from '../../zigbee/index.js';
import { State } from '../../state.js';
import { logger } from '../../util/logger.js';

export interface GroupToolsContext {
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
 * list_groups - List all groups in bridge
 */
export async function listGroups(context: GroupToolsContext): Promise<Types.McpToolResult> {
  try {
    const groups = context.zigbee.getGroups?.() || [];
    const mcpGroups = groups.map((group) => groupToMcp(group, context.state));

    const response: Types.ListGroupsResponse = {
      groups: mcpGroups,
      count: mcpGroups.length,
    };

    return Types.createSuccess(response);
  } catch (error) {
    logger.error('Error listing groups:', error);
    return Types.createError(error instanceof Error ? error : new Error('Failed to list groups'));
  }
}

/**
 * get_group - Get single group by ID
 */
export async function getGroup(context: GroupToolsContext, input: unknown): Promise<Types.McpToolResult> {
  try {
    const parsed = Types.parseInput(Types.GetGroupRequestSchema, input);
    if (parsed.error) {
      return Types.createError(`Invalid input: ${parsed.error}`);
    }

    const groupId = parsed.data!.id;
    const groups = context.zigbee.getGroups?.() || [];
    const group = groups.find((g) => g.id === groupId);

    if (!group) {
      return Types.createError(`Group not found: ${groupId}`);
    }

    const response: Types.GetGroupResponse = {
      group: groupToMcp(group, context.state),
    };

    return Types.createSuccess(response);
  } catch (error) {
    logger.error('Error getting group:', error);
    return Types.createError(error instanceof Error ? error : new Error('Failed to get group'));
  }
}

/**
 * create_group - Create new group
 */
export async function createGroup(context: GroupToolsContext, input: unknown): Promise<Types.McpToolResult> {
  try {
    const parsed = Types.parseInput(Types.CreateGroupRequestSchema, input);
    if (parsed.error) {
      return Types.createError(`Invalid input: ${parsed.error}`);
    }

    const { name, members = [] } = parsed.data!;

    // Find available group ID
    const groups = context.zigbee.getGroups?.() || [];
    let groupId = 1;
    while (groups.some((g) => g.id === groupId)) {
      groupId++;
    }

    // Create group
    const createGroupPayload = {
      id: groupId,
      name,
    };

    await context.zigbee.createGroup?.(groupId, name);

    // Add initial members if provided
    let addedCount = 0;
    for (const memberIdentifier of members) {
      try {
        const device = context.zigbee.getClients().find((d) => d.ieee_addr === memberIdentifier || state.getFriendlyName(d) === memberIdentifier);
        if (device) {
          await context.zigbee.addDeviceToGroup?.(groupId, device);
          addedCount++;
        }
      } catch {
        logger.warn(`Failed to add device ${memberIdentifier} to group ${groupId}`);
      }
    }

    const response: Types.CreateGroupResponse = {
      success: true,
      group_id: groupId,
      message: `Group created with ID ${groupId}` + (addedCount > 0 ? ` and ${addedCount} members added` : ''),
    };

    return Types.createSuccess(response);
  } catch (error) {
    logger.error('Error creating group:', error);
    return Types.createError(error instanceof Error ? error : new Error('Failed to create group'));
  }
}

/**
 * delete_group - Delete group by ID
 */
export async function deleteGroup(context: GroupToolsContext, input: unknown): Promise<Types.McpToolResult> {
  try {
    const parsed = Types.parseInput(Types.DeleteGroupRequestSchema, input);
    if (parsed.error) {
      return Types.createError(`Invalid input: ${parsed.error}`);
    }

    const groupId = parsed.data!.id;
    const groups = context.zigbee.getGroups?.() || [];
    const group = groups.find((g) => g.id === groupId);

    if (!group) {
      return Types.createError(`Group not found: ${groupId}`);
    }

    await context.zigbee.removeGroup?.(groupId);

    const response: Types.DeleteGroupResponse = {
      success: true,
      message: `Group ${groupId} deleted`,
    };

    return Types.createSuccess(response);
  } catch (error) {
    logger.error('Error deleting group:', error);
    return Types.createError(error instanceof Error ? error : new Error('Failed to delete group'));
  }
}

/**
 * rename_group - Rename group
 */
export async function renameGroup(context: GroupToolsContext, input: unknown): Promise<Types.McpToolResult> {
  try {
    const parsed = Types.parseInput(Types.RenameGroupRequestSchema, input);
    if (parsed.error) {
      return Types.createError(`Invalid input: ${parsed.error}`);
    }

    const { id, name } = parsed.data!;
    const groups = context.zigbee.getGroups?.() || [];
    const group = groups.find((g) => g.id === id);

    if (!group) {
      return Types.createError(`Group not found: ${id}`);
    }

    await context.zigbee.renameGroup?.(id, name);

    const response: Types.RenameGroupResponse = {
      success: true,
      message: `Group ${id} renamed to "${name}"`,
    };

    return Types.createSuccess(response);
  } catch (error) {
    logger.error('Error renaming group:', error);
    return Types.createError(error instanceof Error ? error : new Error('Failed to rename group'));
  }
}

/**
 * add_group_members - Add devices to group
 */
export async function addGroupMembers(context: GroupToolsContext, input: unknown): Promise<Types.McpToolResult> {
  try {
    const parsed = Types.parseInput(Types.AddGroupMembersRequestSchema, input);
    if (parsed.error) {
      return Types.createError(`Invalid input: ${parsed.error}`);
    }

    const { group_id, members } = parsed.data!;
    const groups = context.zigbee.getGroups?.() || [];
    const group = groups.find((g) => g.id === group_id);

    if (!group) {
      return Types.createError(`Group not found: ${group_id}`);
    }

    let addedCount = 0;
    const failedMembers: string[] = [];

    for (const memberIdentifier of members) {
      try {
        const device = context.zigbee.getClients().find((d) => d.ieee_addr === memberIdentifier || context.state.getFriendlyName(d) === memberIdentifier);

        if (!device) {
          failedMembers.push(`${memberIdentifier} (not found)`);
          continue;
        }

        await context.zigbee.addDeviceToGroup?.(group_id, device);
        addedCount++;
      } catch {
        failedMembers.push(memberIdentifier);
      }
    }

    const response: Types.AddGroupMembersResponse = {
      success: failedMembers.length === 0,
      added: addedCount,
      message: addedCount > 0 ? `Added ${addedCount} members to group ${group_id}` : 'No members added' + (failedMembers.length > 0 ? `. Failed: ${failedMembers.join(', ')}` : ''),
    };

    return Types.createSuccess(response);
  } catch (error) {
    logger.error('Error adding group members:', error);
    return Types.createError(error instanceof Error ? error : new Error('Failed to add group members'));
  }
}

/**
 * remove_group_members - Remove devices from group
 */
export async function removeGroupMembers(context: GroupToolsContext, input: unknown): Promise<Types.McpToolResult> {
  try {
    const parsed = Types.parseInput(Types.RemoveGroupMembersRequestSchema, input);
    if (parsed.error) {
      return Types.createError(`Invalid input: ${parsed.error}`);
    }

    const { group_id, members } = parsed.data!;
    const groups = context.zigbee.getGroups?.() || [];
    const group = groups.find((g) => g.id === group_id);

    if (!group) {
      return Types.createError(`Group not found: ${group_id}`);
    }

    let removedCount = 0;
    const failedMembers: string[] = [];

    for (const memberIdentifier of members) {
      try {
        const device = context.zigbee.getClients().find((d) => d.ieee_addr === memberIdentifier || context.state.getFriendlyName(d) === memberIdentifier);

        if (!device) {
          failedMembers.push(`${memberIdentifier} (not found)`);
          continue;
        }

        await context.zigbee.removeDeviceFromGroup?.(group_id, device);
        removedCount++;
      } catch {
        failedMembers.push(memberIdentifier);
      }
    }

    const response: Types.RemoveGroupMembersResponse = {
      success: failedMembers.length === 0,
      removed: removedCount,
      message: removedCount > 0 ? `Removed ${removedCount} members from group ${group_id}` : 'No members removed' + (failedMembers.length > 0 ? `. Failed: ${failedMembers.join(', ')}` : ''),
    };

    return Types.createSuccess(response);
  } catch (error) {
    logger.error('Error removing group members:', error);
    return Types.createError(error instanceof Error ? error : new Error('Failed to remove group members'));
  }
}
