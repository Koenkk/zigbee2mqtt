import {McpServer, StdioServerTransport} from "@modelcontextprotocol/sdk/server/stdio.js";
import {CallToolRequestSchema, ListToolsRequestSchema, ReadResourceRequestSchema, ListResourcesRequestSchema} from "@modelcontextprotocol/sdk/types.js";
import type Zigbee from "../zigbee";
import type Mqtt from "../mqtt";
import type State from "../state";
import type EventBus from "../eventBus";
import type Extension from "./extension";
import logger from "../util/logger";
import * as settings from "../util/settings";
// Phase 1: Core tools
import {DeviceTools} from "../mcp/tools/device-tools";
import {BridgeTools} from "../mcp/tools/bridge-tools";
import {DeviceResources} from "../mcp/resources/device-resources";
import {BridgeResources} from "../mcp/resources/bridge-resources";
// Phase 2: Group and binding tools (imported as modules)
import * as GroupToolsFuncs from "../mcp/tools/group-tools";
import * as BindToolsFuncs from "../mcp/tools/bind-tools";
import {GroupResources} from "../mcp/resources/group-resources-wrapper";
// NOTE: GroupResources is a wrapper class that adapts functional exports to class-based API
// Phase 3: Advanced tools (imported as modules)
import * as ConverterToolsFuncs from "../mcp/tools/converter-tools";
import * as OtaToolsFuncs from "../mcp/tools/ota-tools";
import * as NetworkMapToolsFuncs from "../mcp/tools/network-map-tools";
import * as AdvancedBridgeToolsFuncs from "../mcp/tools/advanced-bridge-tools";

/**
 * MCP Server Extension for Zigbee2MQTT
 * Provides tools and resources for AI integration via stdio transport
 */
export default class ExtensionMcpServer implements Extension {
    private mcpServer: McpServer | null = null;
    // Phase 1: Core tools
    private deviceTools: DeviceTools;
    private bridgeTools: BridgeTools;
    private deviceResources: DeviceResources;
    private bridgeResources: BridgeResources;
    // Phase 2: Group resources
    private groupResources: GroupResources;

    constructor(
        private zigbee: Zigbee,
        private mqtt: Mqtt,
        private state: State,
        private publishEntityState: (entity: unknown, message: unknown, source: string) => Promise<void>,
        private eventBus: EventBus,
        private enableDisableExtension: (enable: boolean, name: string) => Promise<void>,
        private restartCallback: () => Promise<void>,
        private addExtension: (extension: Extension) => Promise<void>,
    ) {
        // Phase 1: Core tools
        this.deviceTools = new DeviceTools(zigbee, state, eventBus);
        this.bridgeTools = new BridgeTools(zigbee, state, eventBus);
        this.deviceResources = new DeviceResources(zigbee, state);
        this.bridgeResources = new BridgeResources(zigbee, state);
        // Phase 2: Group resources
        this.groupResources = new GroupResources(zigbee, state);
    }

    async start(): Promise<void> {
        try {
            const mcpSettings = settings.get().mcp_server;

            // Check if MCP server is enabled
            if (!mcpSettings?.enabled) {
                logger.info("MCP Server is disabled, skipping start");
                return;
            }

            // Initialize MCP server with stdio transport
            const transport = new StdioServerTransport();
            this.mcpServer = new McpServer({
                name: "zigbee2mqtt-mcp",
                version: "1.0.0",
            });

            // Register tool handlers
            this.mcpServer.setRequestHandler(ListToolsRequestSchema, async () => {
                return {
                    tools: [
                        {
                            name: "list_devices",
                            description: "List all Zigbee devices on the network",
                            inputSchema: {
                                type: "object" as const,
                                properties: {
                                    type: {
                                        type: "string",
                                        enum: ["Coordinator", "Router", "EndDevice"],
                                        description: "Filter by device type",
                                    },
                                    supported: {
                                        type: "boolean",
                                        description: "Filter by support status",
                                    },
                                    disabled: {
                                        type: "boolean",
                                        description: "Filter by disabled status",
                                    },
                                },
                            },
                        },
                        {
                            name: "get_device",
                            description: "Get detailed information about a specific device",
                            inputSchema: {
                                type: "object" as const,
                                properties: {
                                    device_id: {
                                        type: "string",
                                        description: "Device IEEE address or friendly name",
                                    },
                                },
                                required: ["device_id"],
                            },
                        },
                        {
                            name: "control_device",
                            description: "Control device state (brightness, on/off, color, etc.)",
                            inputSchema: {
                                type: "object" as const,
                                properties: {
                                    device_id: {
                                        type: "string",
                                        description: "Device ID to control",
                                    },
                                    state: {
                                        type: "object",
                                        description: "State object with properties to set",
                                    },
                                },
                                required: ["device_id", "state"],
                            },
                        },
                        {
                            name: "get_device_state",
                            description: "Get current state of a device",
                            inputSchema: {
                                type: "object" as const,
                                properties: {
                                    device_id: {
                                        type: "string",
                                        description: "Device ID",
                                    },
                                },
                                required: ["device_id"],
                            },
                        },
                        {
                            name: "rename_device",
                            description: "Rename a device",
                            inputSchema: {
                                type: "object" as const,
                                properties: {
                                    device_id: {
                                        type: "string",
                                        description: "Device to rename",
                                    },
                                    new_name: {
                                        type: "string",
                                        description: "New friendly name",
                                    },
                                    homeassistant_sync: {
                                        type: "boolean",
                                        description: "Sync name to Home Assistant",
                                        default: true,
                                    },
                                },
                                required: ["device_id", "new_name"],
                            },
                        },
                        {
                            name: "remove_device",
                            description: "Remove device from network",
                            inputSchema: {
                                type: "object" as const,
                                properties: {
                                    device_id: {
                                        type: "string",
                                        description: "Device to remove",
                                    },
                                    block: {
                                        type: "boolean",
                                        description: "Block device from rejoining",
                                        default: false,
                                    },
                                    force: {
                                        type: "boolean",
                                        description: "Force removal",
                                        default: false,
                                    },
                                },
                                required: ["device_id"],
                            },
                        },
                        {
                            name: "get_bridge_info",
                            description: "Get bridge information (version, coordinator, network)",
                            inputSchema: {
                                type: "object" as const,
                                properties: {},
                            },
                        },
                        {
                            name: "permit_join",
                            description: "Enable/disable joining for new devices",
                            inputSchema: {
                                type: "object" as const,
                                properties: {
                                    enabled: {
                                        type: "boolean",
                                        description: "Enable or disable permit join",
                                    },
                                    duration: {
                                        type: "number",
                                        description: "Duration in seconds (0-255)",
                                        minimum: 0,
                                        maximum: 255,
                                    },
                                    device: {
                                        type: "string",
                                        description: "Device to permit join to (optional)",
                                    },
                                },
                                required: ["enabled"],
                            },
                        },
                        {
                            name: "check_health",
                            description: "Check bridge and network health",
                            inputSchema: {
                                type: "object" as const,
                                properties: {},
                            },
                        },
                        {
                            name: "get_config_schema",
                            description: "Get MCP server configuration schema",
                            inputSchema: {
                                type: "object" as const,
                                properties: {},
                            },
                        },
                        // Phase 2: Group tools
                        {
                            name: "list_groups",
                            description: "List all groups on the network",
                            inputSchema: {
                                type: "object" as const,
                                properties: {},
                            },
                        },
                        {
                            name: "get_group",
                            description: "Get detailed information about a group",
                            inputSchema: {
                                type: "object" as const,
                                properties: {
                                    group_id: {
                                        type: "string",
                                        description: "Group ID or name",
                                    },
                                },
                                required: ["group_id"],
                            },
                        },
                        {
                            name: "create_group",
                            description: "Create a new group",
                            inputSchema: {
                                type: "object" as const,
                                properties: {
                                    name: {
                                        type: "string",
                                        description: "Group name",
                                    },
                                    members: {
                                        type: "array",
                                        description: "Initial member device IDs",
                                        items: {type: "string"},
                                    },
                                },
                                required: ["name"],
                            },
                        },
                        {
                            name: "delete_group",
                            description: "Delete a group",
                            inputSchema: {
                                type: "object" as const,
                                properties: {
                                    group_id: {
                                        type: "string",
                                        description: "Group ID or name",
                                    },
                                },
                                required: ["group_id"],
                            },
                        },
                        {
                            name: "rename_group",
                            description: "Rename a group",
                            inputSchema: {
                                type: "object" as const,
                                properties: {
                                    group_id: {
                                        type: "string",
                                        description: "Group ID or name",
                                    },
                                    new_name: {
                                        type: "string",
                                        description: "New group name",
                                    },
                                },
                                required: ["group_id", "new_name"],
                            },
                        },
                        {
                            name: "add_group_members",
                            description: "Add devices to a group",
                            inputSchema: {
                                type: "object" as const,
                                properties: {
                                    group_id: {
                                        type: "string",
                                        description: "Group ID or name",
                                    },
                                    member_ids: {
                                        type: "array",
                                        description: "Device IDs to add",
                                        items: {type: "string"},
                                    },
                                },
                                required: ["group_id", "member_ids"],
                            },
                        },
                        {
                            name: "remove_group_members",
                            description: "Remove devices from a group",
                            inputSchema: {
                                type: "object" as const,
                                properties: {
                                    group_id: {
                                        type: "string",
                                        description: "Group ID or name",
                                    },
                                    member_ids: {
                                        type: "array",
                                        description: "Device IDs to remove",
                                        items: {type: "string"},
                                    },
                                },
                                required: ["group_id", "member_ids"],
                            },
                        },
                        // Phase 2: Binding tools
                        {
                            name: "bind_device",
                            description: "Bind devices together",
                            inputSchema: {
                                type: "object" as const,
                                properties: {
                                    source_id: {
                                        type: "string",
                                        description: "Source device ID",
                                    },
                                    target_id: {
                                        type: "string",
                                        description: "Target device ID",
                                    },
                                    cluster: {
                                        type: "string",
                                        description: "Zigbee cluster name",
                                    },
                                },
                                required: ["source_id", "target_id"],
                            },
                        },
                        {
                            name: "unbind_device",
                            description: "Unbind devices",
                            inputSchema: {
                                type: "object" as const,
                                properties: {
                                    source_id: {
                                        type: "string",
                                        description: "Source device ID",
                                    },
                                    target_id: {
                                        type: "string",
                                        description: "Target device ID",
                                    },
                                    cluster: {
                                        type: "string",
                                        description: "Zigbee cluster name",
                                    },
                                },
                                required: ["source_id", "target_id"],
                            },
                        },
                        {
                            name: "get_bindings",
                            description: "Get all bindings for a device",
                            inputSchema: {
                                type: "object" as const,
                                properties: {
                                    device_id: {
                                        type: "string",
                                        description: "Device ID",
                                    },
                                },
                                required: ["device_id"],
                            },
                        },
                        // Phase 3: OTA tools
                        {
                            name: "check_ota_updates",
                            description: "Check for OTA updates",
                            inputSchema: {
                                type: "object" as const,
                                properties: {},
                            },
                        },
                        {
                            name: "trigger_ota_update",
                            description: "Trigger OTA update for a device",
                            inputSchema: {
                                type: "object" as const,
                                properties: {
                                    device_id: {
                                        type: "string",
                                        description: "Device ID",
                                    },
                                },
                                required: ["device_id"],
                            },
                        },
                        // Phase 3: Converter tools
                        {
                            name: "generate_external_definitions",
                            description: "Generate external converter definitions",
                            inputSchema: {
                                type: "object" as const,
                                properties: {
                                    device_id: {
                                        type: "string",
                                        description: "Device ID",
                                    },
                                },
                                required: ["device_id"],
                            },
                        },
                        {
                            name: "save_converter",
                            description: "Save a converter definition",
                            inputSchema: {
                                type: "object" as const,
                                properties: {
                                    converter_name: {
                                        type: "string",
                                        description: "Converter name",
                                    },
                                    definition: {
                                        type: "object",
                                        description: "Converter definition",
                                    },
                                },
                                required: ["converter_name", "definition"],
                            },
                        },
                        {
                            name: "remove_converter",
                            description: "Remove a saved converter",
                            inputSchema: {
                                type: "object" as const,
                                properties: {
                                    converter_name: {
                                        type: "string",
                                        description: "Converter name",
                                    },
                                },
                                required: ["converter_name"],
                            },
                        },
                        {
                            name: "list_converters",
                            description: "List all converters",
                            inputSchema: {
                                type: "object" as const,
                                properties: {},
                            },
                        },
                        // Phase 3: Network map tools
                        {
                            name: "get_network_map",
                            description: "Get network topology map",
                            inputSchema: {
                                type: "object" as const,
                                properties: {},
                            },
                        },
                        // Phase 3: Advanced bridge tools
                        {
                            name: "restart_bridge",
                            description: "Restart the Zigbee2MQTT bridge",
                            inputSchema: {
                                type: "object" as const,
                                properties: {},
                            },
                        },
                    ],
                };
            });

            // Register tool call handler
            this.mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => {
                const {name, arguments: args} = request.params;

                try {
                    let result;
                    switch (name) {
                        case "list_devices":
                            result = await this.deviceTools.listDevices(args as Record<string, unknown>);
                            break;
                        case "get_device":
                            result = await this.deviceTools.getDevice((args as any).device_id);
                            break;
                        case "control_device":
                            result = await this.deviceTools.controlDevice(args as Record<string, unknown>);
                            break;
                        case "get_device_state":
                            result = await this.deviceTools.getDeviceState((args as any).device_id);
                            break;
                        case "rename_device":
                            result = await this.deviceTools.renameDevice(args as Record<string, unknown>);
                            break;
                        case "remove_device":
                            result = await this.deviceTools.removeDevice(args as Record<string, unknown>);
                            break;
                        case "get_bridge_info":
                            result = await this.bridgeTools.getBridgeInfo();
                            break;
                        case "permit_join":
                            result = await this.bridgeTools.permitJoin(args as Record<string, unknown>);
                            break;
                        case "check_health":
                            result = await this.bridgeTools.checkHealth();
                            break;
                        case "get_config_schema":
                            result = await this.bridgeTools.getConfigSchema();
                            break;
                        // Phase 2: Group tools
                        case "list_groups":
                            result = await GroupToolsFuncs.listGroups({
                                zigbee: this.zigbee,
                                state: this.state,
                            });
                            break;
                        case "get_group":
                            result = await GroupToolsFuncs.getGroup({
                                zigbee: this.zigbee,
                                state: this.state,
                            }, args);
                            break;
                        case "create_group":
                            result = await GroupToolsFuncs.createGroup({
                                zigbee: this.zigbee,
                                state: this.state,
                            }, args);
                            break;
                        case "delete_group":
                            result = await GroupToolsFuncs.deleteGroup({
                                zigbee: this.zigbee,
                                state: this.state,
                            }, args);
                            break;
                        case "rename_group":
                            result = await GroupToolsFuncs.renameGroup({
                                zigbee: this.zigbee,
                                state: this.state,
                            }, args);
                            break;
                        case "add_group_members":
                            result = await GroupToolsFuncs.addGroupMembers({
                                zigbee: this.zigbee,
                                state: this.state,
                            }, args);
                            break;
                        case "remove_group_members":
                            result = await GroupToolsFuncs.removeGroupMembers({
                                zigbee: this.zigbee,
                                state: this.state,
                            }, args);
                            break;
                        // Phase 2: Binding tools
                        case "bind_device":
                            result = await BindToolsFuncs.bindDevice({
                                zigbee: this.zigbee,
                                state: this.state,
                                eventBus: this.eventBus,
                            }, args);
                            break;
                        case "unbind_device":
                            result = await BindToolsFuncs.unbindDevice({
                                zigbee: this.zigbee,
                                state: this.state,
                                eventBus: this.eventBus,
                            }, args);
                            break;
                        case "get_bindings":
                            result = await BindToolsFuncs.getBindings({
                                zigbee: this.zigbee,
                                state: this.state,
                                eventBus: this.eventBus,
                            }, args);
                            break;
                        // Phase 3: OTA tools
                        case "check_ota_updates":
                            result = await OtaToolsFuncs.checkOtaUpdates({
                                zigbee: this.zigbee,
                                state: this.state,
                            });
                            break;
                        case "trigger_ota_update":
                            result = await OtaToolsFuncs.triggerOtaUpdate({
                                zigbee: this.zigbee,
                                state: this.state,
                            }, args);
                            break;
                        // Phase 3: Converter tools
                        case "generate_external_definitions":
                            result = await ConverterToolsFuncs.generateExternalDefinitions({
                                zigbee: this.zigbee,
                                state: this.state,
                            }, args);
                            break;
                        case "save_converter":
                            result = await ConverterToolsFuncs.saveConverter({
                                zigbee: this.zigbee,
                                state: this.state,
                            }, args);
                            break;
                        case "remove_converter":
                            result = await ConverterToolsFuncs.removeConverter({
                                zigbee: this.zigbee,
                                state: this.state,
                            }, args);
                            break;
                        case "list_converters":
                            result = await ConverterToolsFuncs.listConverters({
                                zigbee: this.zigbee,
                                state: this.state,
                            });
                            break;
                        // Phase 3: Network map tools
                        case "get_network_map":
                            result = await NetworkMapToolsFuncs.getNetworkMap({
                                zigbee: this.zigbee,
                                state: this.state,
                            });
                            break;
                        // Phase 3: Advanced bridge tools
                        case "restart_bridge":
                            result = await AdvancedBridgeToolsFuncs.restartBridge({
                                zigbee: this.zigbee,
                                state: this.state,
                            });
                            break;
                        default:
                            return {
                                isError: true,
                                content: [
                                    {
                                        type: "text",
                                        text: `Unknown tool: ${name}`,
                                    },
                                ],
                            };
                    }

                    return {
                        content: [
                            {
                                type: "text",
                                text: JSON.stringify(result),
                            },
                        ],
                    };
                } catch (error) {
                    logger.error(`Error handling tool call ${name}: ${error}`);
                    return {
                        isError: true,
                        content: [
                            {
                                type: "text",
                                text: `Error: ${error}`,
                            },
                        ],
                    };
                }
            });

            // Register resource handlers
            this.mcpServer.setRequestHandler(ListResourcesRequestSchema, async () => {
                return {
                    resources: [
                        {
                            uri: "z2m://devices",
                            name: "All Devices",
                            description: "List all devices on the network",
                            mimeType: "application/json",
                        },
                        {
                            uri: "z2m://bridge/info",
                            name: "Bridge Information",
                            description: "Bridge configuration and status",
                            mimeType: "application/json",
                        },
                        {
                            uri: "z2m://conditions",
                            name: "Network Conditions",
                            description: "Alerts and network conditions",
                            mimeType: "application/json",
                        },
                        // Phase 2: Group resources
                        {
                            uri: "z2m://groups",
                            name: "All Groups",
                            description: "List all groups on the network",
                            mimeType: "application/json",
                        },
                    ],
                };
            });

            // Register resource read handler
            this.mcpServer.setRequestHandler(ReadResourceRequestSchema, async (request) => {
                const {uri} = request.params;

                try {
                    let content: unknown;

                    if (uri === "z2m://devices") {
                        content = this.deviceResources.listDevices();
                    } else if (uri.startsWith("z2m://devices/")) {
                        const deviceId = uri.replace("z2m://devices/", "");
                        if (deviceId.endsWith("/state")) {
                            const id = deviceId.replace("/state", "");
                            content = this.deviceResources.getDeviceState(id);
                        } else {
                            content = this.deviceResources.getDevice(deviceId);
                        }
                    } else if (uri === "z2m://bridge/info") {
                        content = this.bridgeResources.getBridgeInfo();
                    } else if (uri === "z2m://conditions") {
                        content = this.bridgeResources.getConditions();
                    } else if (uri === "z2m://groups") {
                        // Phase 2: Group resources
                        content = this.groupResources.listGroups();
                    } else if (uri.startsWith("z2m://groups/")) {
                        const groupId = uri.replace("z2m://groups/", "");
                        if (groupId.endsWith("/members")) {
                            const id = groupId.replace("/members", "");
                            content = this.groupResources.getGroupMembers(id);
                        } else {
                            content = this.groupResources.getGroup(groupId);
                        }
                    } else {
                        return {
                            isError: true,
                            contents: [
                                {
                                    uri,
                                    mimeType: "text/plain",
                                    text: `Unknown resource: ${uri}`,
                                },
                            ],
                        };
                    }

                    return {
                        contents: [
                            {
                                uri,
                                mimeType: "application/json",
                                text: JSON.stringify(content, null, 2),
                            },
                        ],
                    };
                } catch (error) {
                    logger.error(`Error reading resource ${uri}: ${error}`);
                    return {
                        isError: true,
                        contents: [
                            {
                                uri,
                                mimeType: "text/plain",
                                text: `Error: ${error}`,
                            },
                        ],
                    };
                }
            });

            // Connect transport
            await this.mcpServer.connect(transport);
            logger.info("MCP Server started on stdio transport");
        } catch (error) {
            logger.error(`Failed to start MCP server: ${error}`);
        }
    }

    async stop(): Promise<void> {
        try {
            if (this.mcpServer) {
                // Close MCP server
                logger.info("MCP Server stopped");
            }
        } catch (error) {
            logger.error(`Error stopping MCP server: ${error}`);
        } finally {
            this.eventBus.removeListeners(this);
        }
    }
}
