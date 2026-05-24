import {z} from "zod";

/**
 * Shared types and Zod schemas for MCP server
 * Handles validation and response formatting
 */

// ============================================================================
// DEVICE SCHEMAS & TYPES
// ============================================================================

export const DeviceListFilterSchema = z.object({
    type: z.enum(["Coordinator", "Router", "EndDevice"]).optional(),
    supported: z.boolean().optional(),
    disabled: z.boolean().optional(),
}).strict();

export type DeviceListFilter = z.infer<typeof DeviceListFilterSchema>;

export const DeviceControlRequestSchema = z.object({
    device_id: z.string().min(1, "device_id is required"),
    state: z.record(z.unknown(), "state must be an object"),
}).strict();

export type DeviceControlRequest = z.infer<typeof DeviceControlRequestSchema>;

export const RenameDeviceRequestSchema = z.object({
    device_id: z.string().min(1, "device_id is required"),
    new_name: z.string().min(1, "new_name is required"),
    homeassistant_sync: z.boolean().optional().default(true),
}).strict();

export type RenameDeviceRequest = z.infer<typeof RenameDeviceRequestSchema>;

export const RemoveDeviceRequestSchema = z.object({
    device_id: z.string().min(1, "device_id is required"),
    block: z.boolean().optional().default(false),
    force: z.boolean().optional().default(false),
}).strict();

export type RemoveDeviceRequest = z.infer<typeof RemoveDeviceRequestSchema>;

// ============================================================================
// BRIDGE SCHEMAS & TYPES
// ============================================================================

export const PermitJoinRequestSchema = z.object({
    enabled: z.boolean(),
    duration: z.number().int().min(0).max(255).optional(),
    device: z.string().optional(),
}).strict();

export type PermitJoinRequest = z.infer<typeof PermitJoinRequestSchema>;

// ============================================================================
// RESPONSE TYPES
// ============================================================================

export interface McpError {
    code: string;
    message: string;
    details?: unknown;
}

export interface McpSuccess<T = unknown> {
    success: true;
    data: T;
}

export function createSuccess<T>(data: T): McpSuccess<T> {
    return {
        success: true,
        data,
    };
}

export function createError(code: string, message: string, details?: unknown): McpError {
    return {
        code,
        message,
        ...(details && {details}),
    };
}

// ============================================================================
// DEVICE STATE/INFO TYPES
// ============================================================================

export interface DeviceInfo {
    id: string;
    ieee_address: string;
    network_address: number | null;
    name: string;
    model: string;
    manufacturer: string;
    type: string;
    power_source: string | null;
    supported: boolean;
    disabled: boolean;
    friendly_name: string;
    battery: number | null;
    link_quality: number | null;
    rssi: number | null;
    state: Record<string, unknown> | null;
    last_seen: number | null;
    last_reported: number | null;
    interviewing: boolean;
    interview_completed: boolean;
    exposes: unknown[];
}

export interface BridgeInfo {
    version: string;
    coordinator: {
        type: string;
        ieeeAddr: string;
        nwkAddr: number;
    } | null;
    network: {
        extended_pan_id: string | null;
        pan_id: number | null;
        channel: number | null;
    };
    permit_join: boolean;
    permit_join_timeout: number;
}

export interface PermitJoinResponse {
    enabled: boolean;
    duration: number;
    timeout: number;
}

// ============================================================================
// MISSING SCHEMAS (OTA, INTERVIEW, CONFIGURE, BACKUP)
// ============================================================================

export const TriggerOtaRequestSchema = z.object({
    device_id: z.string().min(1, "device_id is required"),
}).strict();

export const InterviewDeviceRequestSchema = z.object({
    device_id: z.string().min(1, "device_id is required"),
}).strict();

export const ConfigureDeviceRequestSchema = z.object({
    device_id: z.string().min(1, "device_id is required"),
    option_name: z.string().min(1, "option_name is required"),
    value: z.unknown(),
}).strict();

export const BackupCoordinatorRequestSchema = z.object({
    backup_type: z.enum(["full", "partial"]).optional().default("full"),
}).strict();

export interface InterviewDeviceResponse {
    success: boolean;
    message: string;
}

export interface ConfigureDeviceResponse {
    success: boolean;
    message: string;
}

export interface RestartBridgeResponse {
    success: boolean;
    message: string;
}

export interface BackupCoordinatorResponse {
    success: boolean;
    backup_id: string;
    size: number;
    message: string;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

export function parseInput<T>(schema: z.ZodSchema<T>, input: unknown): { data?: T; error?: string } {
    try {
        const data = schema.parse(input);
        return { data };
    } catch (err) {
        return { error: err instanceof z.ZodError ? err.errors[0].message : 'Invalid input' };
    }
}
