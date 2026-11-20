import type * as zhc from "zigbee-herdsman-converters";
import type Device from "../model/device";
import type Group from "../model/group";
import {isLightExpose} from "./utils";

export type ColorMode = "hs" | "xy" | "color_temp";

const COLOR_MODE_FEATURES: Readonly<Record<string, ColorMode>> = {color_hs: "hs", color_xy: "xy", color_temp: "color_temp"};

/**
 * Color modes supported by the light exposes, optionally only those of `endpoint`.
 * Returns `undefined` when there is no matching light expose (= unknown, don't touch).
 */
export function exposedColorModes(exposes: zhc.Expose[], endpoint?: string): Set<ColorMode> | undefined {
    const lights = exposes.filter((e) => isLightExpose(e) && (endpoint === undefined || e.endpoint === endpoint));

    if (lights.length === 0) {
        return undefined;
    }

    const modes = new Set<ColorMode>();

    for (const light of lights) {
        for (const feature of (light as zhc.Light).features) {
            const mode = COLOR_MODE_FEATURES[feature.name];

            if (mode) {
                modes.add(mode);
            }
        }
    }

    return modes;
}

/**
 * Closest color mode the light supports, `undefined` when it supports none (e.g. brightness only).
 * Some lights report a mode they don't support, e.g. color temperature only lights reporting the ZCL default `colorMode` 0 (hs).
 * https://github.com/Koenkk/zigbee2mqtt/issues/28757
 */
export function toSupportedColorMode(mode: ColorMode, supported: Set<ColorMode>): ColorMode | undefined {
    if (supported.has(mode)) return mode;
    if (mode === "hs" && supported.has("xy")) return "xy";
    if (mode === "xy" && supported.has("hs")) return "hs";
    if (supported.has("color_temp")) return "color_temp";
    if (supported.has("xy")) return "xy";
    if (supported.has("hs")) return "hs";
    return undefined;
}

function isColorMode(value: unknown): value is ColorMode {
    return value === "hs" || value === "xy" || value === "color_temp";
}

function deviceExposes(device: Device): zhc.Expose[] {
    // `exposes()` throws when the definition isn't resolved (yet), e.g. for an unsupported device.
    return device.definition ? device.exposes() : [];
}

function entityExposes(entity: Device | Group): zhc.Expose[] {
    if (entity.isDevice()) {
        return deviceExposes(entity);
    }

    const exposes: zhc.Expose[] = [];

    for (const device of entity.membersDevices()) {
        exposes.push(...deviceExposes(device));
    }

    return exposes;
}

/**
 * Replace any `color_mode` (or `color_mode_<endpoint>`) in `state` the entity doesn't support with the closest supported one,
 * or remove it when the light supports no color mode, or when it would be replaced by `color_temp` while `state` has no `color_temp`.
 * Modifies `state` in place.
 */
export function normalizeColorMode(entity: Device | Group, state: KeyValue): void {
    let exposes: zhc.Expose[] | undefined;

    for (const key of Object.keys(state)) {
        if (key !== "color_mode" && !key.startsWith("color_mode_")) continue;

        const mode = state[key];

        if (!isColorMode(mode)) continue;

        exposes ??= entityExposes(entity);
        const endpoint = key === "color_mode" ? undefined : key.slice("color_mode_".length);
        // A group's `color_mode` combines its members, which may expose their light on an endpoint.
        const supported = exposedColorModes(exposes, entity.isGroup() ? undefined : endpoint);

        if (!supported) continue;

        const newMode = toSupportedColorMode(mode, supported);

        // Without a `color_temp` value there's nothing to back a `color_temp` mode, so drop the mode instead of replacing it.
        const colorTempKey = endpoint === undefined ? "color_temp" : `color_temp_${endpoint}`;

        if (newMode === undefined || (newMode === "color_temp" && newMode !== mode && state[colorTempKey] === undefined)) {
            delete state[key];
        } else if (newMode !== mode) {
            state[key] = newMode;
        }
    }
}
