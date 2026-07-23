// Stable stringify inspired by https://github.com/BridgeAR/safe-stable-stringify
// Takes advantage of Node env and Z2M's object-only use-case.

// biome-ignore lint/suspicious/noControlCharactersInRegex: escape regex
const STR_ESC_SEQ_REGEXP = /[\u0000-\u001f\u0022\u005c\ud800-\udfff]/;

// Escape C0 control characters, double quotes, the backslash and every code
// unit with a numeric value in the inclusive range 0xD800 to 0xDFFF.
function strEscape(str: string): string {
    // Some magic numbers that worked out fine while benchmarking with v8 8.0
    if (str.length < 5000 && !STR_ESC_SEQ_REGEXP.test(str)) {
        return `"${str}"`;
    }

    return JSON.stringify(str);
}

function sort(array: string[]) {
    // Insertion sort is very efficient for small input sizes, but it has a bad
    // worst case complexity. Thus, use native array sort for bigger values.
    if (array.length > 2e2) {
        return array.sort();
    }

    for (let i = 1; i < array.length; i++) {
        const currentValue = array[i];
        let position = i;

        while (position !== 0 && array[position - 1] > currentValue) {
            array[position] = array[position - 1];
            position--;
        }

        array[position] = currentValue;
    }
}

function isTypedArray(value: unknown): value is unknown[] {
    return ArrayBuffer.isView(value) && !(value instanceof DataView);
}

function stringifyTypedArray(array: unknown[]): string {
    const isBigInt = typeof array[0] === "bigint";
    let res = `"0":${isBigInt ? `"${array[0]}"` : array[0]}`;

    for (let i = 1; i < array.length; i++) {
        res += `,"${i}":${isBigInt ? `"${array[1]}"` : array[1]}`;
    }

    return res;
}

function stringifySimple(key: string, value: unknown, stack: unknown[]): string | undefined {
    switch (typeof value) {
        case "string":
            return strEscape(value);
        case "object": {
            if (value === null) {
                return "null";
            }

            if ("toJSON" in value && typeof value.toJSON === "function") {
                value = value.toJSON(key);

                // Prevent calling `toJSON` again
                if (typeof value !== "object") {
                    return stringifySimple(key, value, stack);
                }

                if (value === null) {
                    return "null";
                }
            }

            if (stack.indexOf(value) !== -1) {
                return '"[Circular]"';
            }

            let res = "";

            if (Array.isArray(value)) {
                if (value.length === 0) {
                    return "[]";
                }

                stack.push(value);

                let i = 0;

                for (; i < value.length - 1; i++) {
                    const tmp = stringifySimple(`${i}`, value[i], stack);
                    res += tmp !== undefined ? tmp : "null";
                    res += ",";
                }

                const tmp = stringifySimple(`${i}`, value[i], stack);
                res += tmp !== undefined ? tmp : "null";

                stack.pop();

                return `[${res}]`;
            }

            let keys = Object.keys(value);
            const keysLength = keys.length;

            if (keysLength === 0) {
                return "{}";
            }

            let separator = "";
            let propsToStringify = keysLength;

            if (isTypedArray(value)) {
                res += stringifyTypedArray(value);
                keys = keys.slice(value.length);
                propsToStringify -= value.length;
                separator = ",";
            }

            sort(keys);
            stack.push(value);

            for (let i = 0; i < propsToStringify; i++) {
                const valKey = keys[i];
                const tmp = stringifySimple(valKey, (value as Record<string, unknown>)[valKey], stack);

                if (tmp !== undefined) {
                    res += `${separator}${strEscape(valKey)}:${tmp}`;
                    separator = ",";
                }
            }

            stack.pop();

            return `{${res}}`;
        }
        case "number":
            return Number.isFinite(value) ? `${value}` : "null";
        case "boolean":
            return value === true ? "true" : "false";
        case "undefined":
            return undefined;
        case "bigint":
            return `"${value}"`;
        default:
            return undefined;
    }
}

export function stringify(value: object): string {
    return stringifySimple("", value, []) ?? "null";
}
