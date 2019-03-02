const path = require('path');

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

module.exports = {
    joinPath: (file) => path.join(dataPath, file),
    getPath: () => dataPath,

    // For test only.
    _reload: () => load(),
};
