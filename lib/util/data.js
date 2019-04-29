const path = require('path');
const fs = require('fs');

let dataPath = null;

function load() {
    if (process.env.ZIGBEE2MQTT_DATA) {
        dataPath = process.env.ZIGBEE2MQTT_DATA;
    } else {
        dataPath = path.join(__dirname, '..', '..', 'data');
        dataPath = path.normalize(dataPath);
    }
}

load();

function joinPathStorage(file) {
    const storagePath = path.join(dataPath, '.storage');
    if (!fs.existsSync(storagePath)) {
        fs.mkdirSync(storagePath);
    }

    return path.join(storagePath, file);
}

module.exports = {
    joinPath: (file) => path.join(dataPath, file),
    joinPathStorage: (file) => joinPathStorage(file),
    getPath: () => dataPath,

    // For test only.
    _reload: () => load(),
};
