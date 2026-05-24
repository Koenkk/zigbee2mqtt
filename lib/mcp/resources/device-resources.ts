import type Zigbee from "../../zigbee";
import type State from "../../state";
import logger from "../../util/logger";

/**
 * Device resource URIs
 * z2m://devices - all devices
 * z2m://devices/{id} - single device
 * z2m://devices/{id}/state - device state only
 */

export class DeviceResources {
    constructor(
        private zigbee: Zigbee,
        private state: State,
    ) {}

    /**
     * List all devices (z2m://devices)
     */
    listDevices() {
        try {
            const devices = this.zigbee.getClients();
            return devices.map((device) => ({
                id: device.ieeeAddr,
                name: device.friendly_name || device.name,
                model: device.definition?.model || "Unknown",
                type: device.type,
                supported: device.isSupported || false,
                state: this.state.get(device) || {},
            }));
        } catch (error) {
            logger.error(`Failed to list devices for resource: ${error}`);
            return [];
        }
    }

    /**
     * Get single device (z2m://devices/{id})
     */
    getDevice(deviceId: string) {
        try {
            const device = this.zigbee.getDevice(deviceId);
            if (!device) {
                return null;
            }

            return {
                id: device.ieeeAddr,
                ieee_address: device.ieeeAddr,
                network_address: device.networkAddress,
                name: device.name,
                friendly_name: device.friendly_name || device.name,
                model: device.definition?.model || "Unknown",
                manufacturer: device.definition?.vendor || "Unknown",
                type: device.type,
                power_source: device.powerSource || null,
                supported: device.isSupported || false,
                disabled: device.disabled || false,
                battery: this.state.get(device)?.battery || null,
                link_quality: this.state.get(device)?.linkquality || null,
                rssi: this.state.get(device)?.rssi || null,
                state: this.state.get(device) || null,
                last_seen: device.lastSeen,
                last_reported: device.lastReported,
                interviewing: device.interviewing || false,
                interview_completed: device.interviewCompleted || false,
                exposes: device.definition?.exposes || [],
            };
        } catch (error) {
            logger.error(`Failed to get device resource ${deviceId}: ${error}`);
            return null;
        }
    }

    /**
     * Get device state only (z2m://devices/{id}/state)
     */
    getDeviceState(deviceId: string) {
        try {
            const device = this.zigbee.getDevice(deviceId);
            if (!device) {
                return null;
            }

            return this.state.get(device) || {};
        } catch (error) {
            logger.error(`Failed to get device state resource ${deviceId}: ${error}`);
            return null;
        }
    }
}
