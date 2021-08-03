import Extension from './extension';
import logger from '../util/logger';

const msToMinute = 1000 * 60;
const msToHour = msToMinute * 60;
const Hours25 = 25 * msToHour;
const Minutes5 = 5 * msToMinute;

class Availability extends Extension {
    private timers: {[s: string]: NodeJS.Timeout} = {};
    private availability: {[s: string]: boolean} = {};

    constructor(zigbee, mqtt, state, publishEntityState, eventBus) {
        super(zigbee, mqtt, state, publishEntityState, eventBus);
    }

    isRouter(re: ResolvedEntity): boolean {
        // Some should be treated as routers: https://github.com/Koenkk/zigbee2mqtt/issues/775#issuecomment-453683846
        if (['E11-G13', 'E11-N1EA', '53170161'].includes(re.definition?.model)) {
            return true;
        }

        // Device is a mains powered router
        return re.device.type === 'Router' && re.device.powerSource !== 'Battery';
    }

    timer(re: ResolvedEntity): void {
        clearTimeout(this.timers[re.device.ieeeAddr]);
        const ago = Date.now() - re.device.lastSeen;

        if (this.isRouter(re)) {
            logger.debug(`Router '${re.name}' was last seen '${(ago / msToMinute).toFixed(2)}' minutes ago.`);
            this.publishAvailability(re, ago > Minutes5);
            this.timers[re.device.ieeeAddr] = setTimeout(async () => {
                try {
                    await re.device.ping();
                    logger.debug(`Succesfully pinged '${re.name}'`);
                } catch (error) {
                    logger.error(`Failed to ping '${re.name}'`);
                }
            }, Minutes5 * 0.75);
        } else {
            logger.debug(`EndDevice '${re.name}' was last seen '${(ago / msToHour).toFixed(2)}' hours ago.`);
            this.publishAvailability(re, ago > Hours25);
            this.timers[re.device.ieeeAddr] = setTimeout(() => this.timer(re), msToHour);
        }
    }

    onMQTTConnected(): void {
        for (const device of this.zigbee.getClients()) {
            const re: ResolvedEntity = this.zigbee.resolvedEntity(device);
            this.timer(re);
        }
    }

    publishAvailability(re: ResolvedEntity, available: boolean): void {
        if (this.availability[re.device.ieeeAddr] == available) {
            return;
        }

        const topic = `${re.name}/availability`;
        const payload = available ? 'online' : 'offline';
        this.availability[re.device.ieeeAddr] = available;
        this.mqtt.publish(topic, payload, {retain: true, qos: 0});
    }
}

module.exports = Availability;
