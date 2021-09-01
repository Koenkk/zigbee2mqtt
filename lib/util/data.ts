import path from 'path';

let dataPath: string = null;

function load(): void {
    if (process.env.ZIGBEE2MQTT_DATA) {
        dataPath = process.env.ZIGBEE2MQTT_DATA;
    } else {
        dataPath = path.join(__dirname, '..', '..', 'data');
        dataPath = path.normalize(dataPath);
    }
}

load();

export function joinPath(file: string): string {
    return path.join(dataPath, file);
}

export function getPath(): string {
    return dataPath;
}

// eslint-disable-next-line camelcase
export function __testingOnly_reload(): void {
    load();
}
