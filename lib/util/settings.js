const YAWN = require('yawn-yaml/cjs');
const fs = require('fs');
const data = require('./data');
let file = data.joinPath('configuration.yaml');
let yawn = read();

function write() {
    fs.writeFileSync(file, yawn.yaml);
}

function read() {
    return new YAWN(fs.readFileSync(file, 'utf8'));
}

function addDevice(id) {
    if (!yawn.json.devices) {
        const first = "\n" +
            "# List of devices, automatically updates when new devices join, E.G.:\n" +
            "# '0x00158d0001d8e1d2':\n" +
            "#    friendly_name: bedroom_switch  # Friendly name to be used in MQTT topic\n" +
            "#    retain: true                   # Retain MQTT messages\n" +
            "devices:\n" +
            `  '${id}':\n` +
            `    friendly_name: '${id}'\n` +
            `    retain: false`;

        yawn.yaml += first;
    } else {
        const devices = yawn.json.devices;
        devices[id] = {friendly_name: id, retain: false};
        yawn.json = {...yawn.json, devices: devices};
    }

    write();
    yawn = read();
}

module.exports = {
    get: () => yawn.json,
    write: () => write(),
    getDevice: (id) => yawn.json.devices ? yawn.json.devices[id] : false,
    addDevice: (id) => addDevice(id),
}
