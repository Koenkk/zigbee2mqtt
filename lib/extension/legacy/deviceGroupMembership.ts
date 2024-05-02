/* istanbul ignore file */
import * as settings from '../../util/settings';
import logger from '../../util/logger';
import Extension from '../extension';
import bind from 'bind-decorator';
import Device from '../../model/device';

const topicRegex = new RegExp(`^${settings.get().mqtt.base_topic}/bridge/device/(.+)/get_group_membership$`);

export default class DeviceGroupMembership extends Extension {
    override async start(): Promise<void> {
        this.eventBus.onMQTTMessage(this, this.onMQTTMessage);
    }

    @bind async onMQTTMessage(data: eventdata.MQTTMessage): Promise<void> {
        const match = data.topic.match(topicRegex);
        if (!match) {
            return null;
        }

        const parsed = this.zigbee.resolveEntityAndEndpoint(match[1]);
        const device = parsed?.entity as Device;
        if (!device || !(device instanceof Device)) {
            logger.error(`Device '${match[1]}' does not exist`);
            return;
        }

        const endpoint = parsed.endpoint;
        if (parsed.endpointID && !endpoint) {
            logger.error(`Device '${parsed.ID}' does not have endpoint '${parsed.endpointID}'`);
            return;
        }

        const response = await endpoint.command(
            `genGroups`, 'getMembership', {groupcount: 0, grouplist: []}, {},
        );

        if (!response) {
            logger.warning(`Couldn't get group membership of ${device.ieeeAddr}`);
            return;
        }

        let {grouplist, capacity} = response;

        grouplist = grouplist.map((gid: string) => {
            const g = settings.getGroup(gid);
            return g ? g.friendly_name : gid;
        });

        const msgGroupList = `${device.ieeeAddr} is in groups [${grouplist}]`;
        let msgCapacity;
        if (capacity === 254) {
            msgCapacity = 'it can be a part of at least 1 more group';
        } else {
            msgCapacity = `its remaining group capacity is ${capacity === 255 ? 'unknown' : capacity}`;
        }
        logger.info(`${msgGroupList} and ${msgCapacity}`);

        this.publishEntityState(device, {group_list: grouplist, group_capacity: capacity});
    }
}
