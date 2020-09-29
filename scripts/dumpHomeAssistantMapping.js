const HomeAssistant = require('../lib/extension/homeassistant');
const stringify = require('json-stable-stringify-without-jsonify');
const homeassistant = new HomeAssistant(null, null, null, null, {on: () => {}});
const mapping = Object.entries(homeassistant._getMapping());
mapping.sort((a, b) => {
    if (a[0] > b[0]) {
        return -1;
    }
    if (b[0] > a[0]) {
        return 1;
    }
    return 0;
});

for (const entry of mapping) {
    console.log(`${entry[0]} - ${stringify(entry[1])}`);
}
