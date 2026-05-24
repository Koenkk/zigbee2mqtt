/**
 * Wrapper class for Group Resources
 * Adapts functional exports to class-based API for use in mcpServer
 */
import * as GroupResourcesFuncs from './group-resources';
import type Zigbee from '../../zigbee';
import type State from '../../state';

export class GroupResources {
  constructor(private zigbee: Zigbee, private state: State) {}

  async listGroups(): Promise<unknown> {
    const json = await GroupResourcesFuncs.handleGroupsList({
      zigbee: this.zigbee,
      state: this.state,
    });
    return JSON.parse(json);
  }

  async getGroup(groupId: string): Promise<unknown> {
    const json = await GroupResourcesFuncs.handleGroupDetail({
      zigbee: this.zigbee,
      state: this.state,
    }, groupId);
    return JSON.parse(json);
  }

  async getGroupMembers(groupId: string): Promise<unknown> {
    const json = await GroupResourcesFuncs.handleGroupMembers({
      zigbee: this.zigbee,
      state: this.state,
    }, groupId);
    return JSON.parse(json);
  }
}
