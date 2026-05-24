import type Zigbee from "../../zigbee";
import type State from "../../state";
import type EventBus from "../../eventBus";
import logger from "../../util/logger";
import {
    DeviceControlRequestSchema,
    RenameDeviceRequestSchema,
    RemoveDeviceRequestSchema,
    createSuccess,
    createError,
    type DeviceInfo,
    DeviceListFilterSchema,
} from "../types";

/**
 * Device tools: list, get, control, rename, remove
 */

export class DeviceTools {
    constructor(
        private zigbee: Zigbee,
        private state: State,
        private eventBus: EventBus,
    ) {}

    /**
     * List all devices with optional filtering
     */
    async listDevices(filter?: Record<string, unknown>) {
        try {
            const filterParsed = filter ? DeviceListFilterSchema.parse(filter) : {};
            const devices = this.zigbee.getClients();
            let result = devices.map((device) => this.deviceToInfo(device));

            // Apply filters
            if (filterParsed.type) {
                result = result.filter((d) => d.type === filterParsed.type);
            }
            if (filterParsed.supported !== undefined) {
                result = result.filter((d) => d.supported === filterParsed.supported);
            }
            if (filterParsed.disabled !== undefined) {
                result = result.filter((d) => d.disabled === filterParsed.disabled);
            }

            return createSuccess({
                count: result.length,
                devices: result,
            });
        } catch (error) {
            logger.error(`Failed to list devices: ${error}`);
            return createError("DEVICE_LIST_FAILED", `Failed to list devices: ${error}`);
        }
    }

    /**
     * Get single device by ID
     */
    async getDevice(deviceId: string) {
        try {
            const device = this.zigbee.getDevice(deviceId);
            if (!device) {
                return createError("DEVICE_NOT_FOUND", `Device ${deviceId} not found`);
            }

            return createSuccess(this.deviceToInfo(device));
        } catch (error) {
            logger.error(`Failed to get device ${deviceId}: ${error}`);
            return createError("DEVICE_GET_FAILED", `Failed to get device: ${error}`);
        }
    }

    /**
     * Control device state (brightness, on/off, color, etc.)
     */
    async controlDevice(request: Record<string, unknown>) {
        try {
            const parsed = DeviceControlRequestSchema.parse(request);
            const {device_id, state} = parsed;

            const device = this.zigbee.getDevice(device_id);
            if (!device) {
                return createError("DEVICE_NOT_FOUND", `Device ${device_id} not found`);
            }

            // The state object is passed to the device control logic
            // This will be handled by the existing z2m device control mechanisms
            await this.state.set(device, state, "mcp");

            return createSuccess({
                device_id,
                state,
                message: "Device state updated",
            });
        } catch (error) {
            if (error instanceof Error && error.message.includes("validation")) {
                return createError("INVALID_REQUEST", `Invalid request: ${error.message}`);
            }
            logger.error(`Failed to control device: ${error}`);
            return createError("DEVICE_CONTROL_FAILED", `Failed to control device: ${error}`);
        }
    }

    /**
     * Rename device
     */
    async renameDevice(request: Record<string, unknown>) {
        try {
            const parsed = RenameDeviceRequestSchema.parse(request);
            const {device_id, new_name, homeassistant_sync} = parsed;

            const device = this.zigbee.getDevice(device_id);
            if (!device) {
                return createError("DEVICE_NOT_FOUND", `Device ${device_id} not found`);
            }

            const oldName = device.friendly_name || device.name;
            device.friendly_name = new_name;

            // TODO: Persist friendly_name to devices.js
            // TODO: If homeassistant_sync enabled, trigger HA entity rename

            this.eventBus.emit("deviceRenamed", {device, from: oldName, to: new_name});

            return createSuccess({
                device_id,
                old_name: oldName,
                new_name,
                message: "Device renamed successfully",
            });
        } catch (error) {
            if (error instanceof Error && error.message.includes("validation")) {
                return createError("INVALID_REQUEST", `Invalid request: ${error.message}`);
            }
            logger.error(`Failed to rename device: ${error}`);
            return createError("DEVICE_RENAME_FAILED", `Failed to rename device: ${error}`);
        }
    }

    /**
     * Remove device from network
     */
    async removeDevice(request: Record<string, unknown>) {
        try {
            const parsed = RemoveDeviceRequestSchema.parse(request);
            const {device_id, block, force} = parsed;

            const device = this.zigbee.getDevice(device_id);
            if (!device) {
                return createError("DEVICE_NOT_FOUND", `Device ${device_id} not found`);
            }

            await this.zigbee.removeDevice(device_id, {block, force});

            return createSuccess({
                device_id,
                removed: true,
                block,
                message: "Device removed successfully",
            });
        } catch (error) {
            if (error instanceof Error && error.message.includes("validation")) {
                return createError("INVALID_REQUEST", `Invalid request: ${error.message}`);
            }
            logger.error(`Failed to remove device: ${error}`);
            return createError("DEVICE_REMOVE_FAILED", `Failed to remove device: ${error}`);
        }
    }

    /**
     * Get device state
     */
    async getDeviceState(deviceId: string) {
        try {
            const device = this.zigbee.getDevice(deviceId);
            if (!device) {
                return createError("DEVICE_NOT_FOUND", `Device ${deviceId} not found`);
            }

            const state = this.state.get(device);
            return createSuccess({
                device_id: deviceId,
                state: state || {},
            });
        } catch (error) {
            logger.error(`Failed to get device state: ${error}`);
            return createError("DEVICE_STATE_FAILED", `Failed to get device state: ${error}`);
        }
    }

    /**
     * Convert internal Device object to DeviceInfo
     */
    private deviceToInfo(device: any): DeviceInfo {
        const state = this.state.get(device);

        return {
            id: device.ieeeAddr,
            ieee_address: device.ieeeAddr,
            network_address: device.networkAddress,
            name: device.name,
            model: device.definition?.model || "Unknown",
            manufacturer: device.definition?.vendor || "Unknown",
            type: device.type,
            power_source: device.powerSource || null,
            supported: device.isSupported || false,
            disabled: device.disabled || false,
            friendly_name: device.friendly_name || device.name,
            battery: state?.battery || null,
            link_quality: state?.linkquality || null,
            rssi: state?.rssi || null,
            state: state || null,
            last_seen: device.lastSeen,
            last_reported: device.lastReported,
            interviewing: device.interviewing || false,
            interview_completed: device.interviewCompleted || false,
            exposes: device.definition?.exposes || [],
        };
    }
}
