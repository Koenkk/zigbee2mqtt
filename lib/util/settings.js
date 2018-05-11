const YAWN = require('yawn-yaml/cjs');
const fs = require('fs');
const defaultPath = `${__dirname}/../../data/configuration.yaml`;
let yawn = read();

function getConfigPath() {
  // if a configuration path is given as arg, use it
  // else, use the default location at /data/configuration.yaml
  if (process.argv.length < 3) {
    return defaultPath;
  } else {
    return process.argv[2];
  }
}

function write() {
    fs.writeFileSync(getConfigPath(), yawn.yaml);
}

function read() {
    return new YAWN(fs.readFileSync(getConfigPath(), 'utf8'));
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
