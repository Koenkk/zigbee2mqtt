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

function joinPath(file: string): string {
    return path.join(dataPath, file);
}

function getPath(): string {
    return dataPath;
}

// eslint-disable-next-line camelcase
function testingOnlyReload(): void {
    load();
}

export default {joinPath, getPath, testingOnlyReload};
