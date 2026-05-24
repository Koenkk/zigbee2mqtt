import type Zigbee from "../../zigbee";
import type State from "../../state";
import type EventBus from "../../eventBus";
import logger from "../../util/logger";
import {PermitJoinRequestSchema, createSuccess, createError, type BridgeInfo, type PermitJoinResponse} from "../types";
import * as settings from "../../util/settings";

/**
 * Bridge tools: info, permit_join, health, config schema
 */

export class BridgeTools {
    constructor(
        private zigbee: Zigbee,
        private state: State,
        private eventBus: EventBus,
    ) {}

    /**
     * Get bridge info (version, coordinator, network status)
     */
    async getBridgeInfo() {
        try {
            const coordinator = this.zigbee.getCoordinator();
            const networkParams = this.zigbee.getNetworkParameters?.() || {};

            const bridgeInfo: BridgeInfo = {
                version: "2.10.1", // TODO: Get from package.json or settings
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
                permit_join_timeout: 0, // TODO: Track permit join timeout
            };

            return createSuccess(bridgeInfo);
        } catch (error) {
            logger.error(`Failed to get bridge info: ${error}`);
            return createError("BRIDGE_INFO_FAILED", `Failed to get bridge info: ${error}`);
        }
    }

    /**
     * Enable/disable permit join
     */
    async permitJoin(request: Record<string, unknown>) {
        try {
            const parsed = PermitJoinRequestSchema.parse(request);
            const {enabled, duration, device} = parsed;

            if (enabled) {
                // Enable permit join
                await this.zigbee.permitJoin(enabled, duration || 254, device);
                this.eventBus.emit("permitJoinChanged", {
                    permitted: true,
                    timeout: duration || 254,
                });
            } else {
                // Disable permit join
                await this.zigbee.permitJoin(false);
                this.eventBus.emit("permitJoinChanged", {
                    permitted: false,
                    timeout: 0,
                });
            }

            const response: PermitJoinResponse = {
                enabled,
                duration: duration || 0,
                timeout: this.zigbee.getPermitJoined?.() ? duration || 254 : 0,
            };

            return createSuccess(response);
        } catch (error) {
            if (error instanceof Error && error.message.includes("validation")) {
                return createError("INVALID_REQUEST", `Invalid request: ${error.message}`);
            }
            logger.error(`Failed to set permit join: ${error}`);
            return createError("PERMIT_JOIN_FAILED", `Failed to set permit join: ${error}`);
        }
    }

    /**
     * Get config schema (returns MCP server config schema)
     */
    async getConfigSchema() {
        try {
            const schema = {
                type: "object",
                title: "MCP Server",
                description: "Model Context Protocol server configuration",
                properties: {
                    enabled: {
                        type: "boolean",
                        title: "Enabled",
                        description: "Enable MCP server",
                        default: true,
                        requiresRestart: true,
                    },
                    transport: {
                        type: "string",
                        title: "Transport",
                        description: "Transport mechanism (stdio, http)",
                        enum: ["stdio", "http"],
                        default: "stdio",
                        requiresRestart: true,
                    },
                    http: {
                        type: "object",
                        title: "HTTP Configuration",
                        description: "HTTP transport settings",
                        properties: {
                            port: {
                                type: "number",
                                title: "Port",
                                description: "HTTP server port",
                                default: 4747,
                                minimum: 1024,
                                maximum: 65535,
                                requiresRestart: true,
                            },
                            host: {
                                type: "string",
                                title: "Host",
                                description: "HTTP server host/bind address",
                                default: "127.0.0.1",
                                requiresRestart: true,
                            },
                        },
                    },
                },
                required: ["enabled"],
            };

            return createSuccess(schema);
        } catch (error) {
            logger.error(`Failed to get config schema: ${error}`);
            return createError("CONFIG_SCHEMA_FAILED", `Failed to get config schema: ${error}`);
        }
    }

    /**
     * Health check - basic status
     */
    async checkHealth() {
        try {
            const coordinator = this.zigbee.getCoordinator();
            const devices = this.zigbee.getClients();

            // Count offline devices
            const offlineDevices = devices.filter((d) => {
                const state = this.state.get(d);
                return !state || state.linkquality === null;
            });

            // Count low battery devices
            const lowBatteryDevices = devices.filter((d) => {
                const state = this.state.get(d);
                return state?.battery && state.battery < 20;
            });

            return createSuccess({
                coordinator_online: !!coordinator,
                total_devices: devices.length,
                offline_devices: offlineDevices.length,
                low_battery_devices: lowBatteryDevices.length,
                status: "healthy",
                timestamp: new Date().toISOString(),
            });
        } catch (error) {
            logger.error(`Failed to check health: ${error}`);
            return createError("HEALTH_CHECK_FAILED", `Failed to check health: ${error}`);
        }
    }
}
