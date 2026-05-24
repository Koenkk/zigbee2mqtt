import type Zigbee from "../../zigbee";
import type State from "../../state";
import logger from "../../util/logger";

/**
 * Bridge resource URIs
 * z2m://bridge/info - bridge info
 * z2m://conditions - alerts and conditions
 */

export class BridgeResources {
    constructor(
        private zigbee: Zigbee,
        private state: State,
    ) {}

    /**
     * Get bridge info (z2m://bridge/info)
     */
    getBridgeInfo() {
        try {
            const coordinator = this.zigbee.getCoordinator();
            const networkParams = this.zigbee.getNetworkParameters?.() || {};

            return {
                version: "2.10.1", // TODO: Get from package.json
                coordinator: coordinator
                    ? {
                          type: "ZHA",
                          ieeeAddr: coordinator.ieeeAddr,
                          nwkAddr: coordinator.networkAddress,
                      }
                    : null,
                network: {
                    extended_pan_id: networkParams.extendedPanID || null,
                    pan_id: networkParams.panID || null,
                    channel: networkParams.channel || null,
                },
                permit_join: this.zigbee.getPermitJoined?.() || false,
                permit_join_timeout: 0,
            };
        } catch (error) {
            logger.error(`Failed to get bridge info resource: ${error}`);
            return null;
        }
    }

    /**
     * Get conditions/alerts (z2m://conditions)
     */
    getConditions() {
        try {
            const devices = this.zigbee.getClients();
            const conditions: Array<{
                type: string;
                severity: "info" | "warning" | "error";
                device_id?: string;
                device_name?: string;
                message: string;
            }> = [];

            // Check for offline devices
            const offlineDevices = devices.filter((d) => {
                const state = this.state.get(d);
                return !state || state.linkquality === null;
            });

            if (offlineDevices.length > 0) {
                offlineDevices.forEach((d) => {
                    conditions.push({
                        type: "offline_device",
                        severity: "warning",
                        device_id: d.ieeeAddr,
                        device_name: d.friendly_name || d.name,
                        message: `Device ${d.friendly_name || d.name} is offline`,
                    });
                });
            }

            // Check for low battery devices
            const lowBatteryDevices = devices.filter((d) => {
                const state = this.state.get(d);
                return state?.battery && state.battery < 20;
            });

            if (lowBatteryDevices.length > 0) {
                lowBatteryDevices.forEach((d) => {
                    const state = this.state.get(d);
                    conditions.push({
                        type: "low_battery",
                        severity: "warning",
                        device_id: d.ieeeAddr,
                        device_name: d.friendly_name || d.name,
                        message: `Device ${d.friendly_name || d.name} has low battery (${state?.battery}%)`,
                    });
                });
            }

            // Check for unsupported devices
            const unsupportedDevices = devices.filter((d) => !d.isSupported);
            if (unsupportedDevices.length > 0) {
                unsupportedDevices.forEach((d) => {
                    conditions.push({
                        type: "unsupported_device",
                        severity: "info",
                        device_id: d.ieeeAddr,
                        device_name: d.friendly_name || d.name,
                        message: `Device ${d.friendly_name || d.name} is not officially supported`,
                    });
                });
            }

            return conditions;
        } catch (error) {
            logger.error(`Failed to get conditions resource: ${error}`);
            return [];
        }
    }
}
