const path = require('path');

let dataPath = null;

function getRoot() {
    const tsnode = process[Symbol.for('ts-node.register.instance')];
    const jest = process.env.JEST_WORKER_ID;
    /* istanbul ignore next */
    const relativePath = tsnode || jest ? path.join(__dirname, '..', '..') : path.join(__dirname, '..', '..', '..');
    return path.resolve(relativePath);
}

function load() {
    if (process.env.ZIGBEE2MQTT_DATA) {
        dataPath = process.env.ZIGBEE2MQTT_DATA;
    } else {
        dataPath = path.join(getRoot(), 'data');
        dataPath = path.normalize(dataPath);
    }
}

load();

module.exports = {
    joinPath: (file) => path.join(dataPath, file),
    getPath: () => dataPath,
    getRoot,

    // For test only.
    _reload: () => load(),
};
