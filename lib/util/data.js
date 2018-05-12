const path = require('path');

function dataPath() {
  if (process.env.ZIGBEE2MQTT_DATA) {
    return process.env.ZIGBEE2MQTT_DATA;
  } else {
    return `${__dirname}/../../data`
  }
}

module.exports = {
  path: dataPath(),
  joinPath: (file) => path.join(dataPath(), file)
}
